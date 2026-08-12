"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, Mail, RefreshCw, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase/client";
import {
    deleteEmailConversation,
    listLeadEmailConversations,
} from "@/lib/actions/emails";
import {
    EMAIL_FIELD_ORDER,
    type EmailConversation,
    type EmailFieldKey,
} from "@/lib/types/email";
import { isValidEmail } from "@/lib/email/format";
import { EmailComposeModal } from "@/components/emails/email-compose-modal";
import { EmailConversationItem } from "@/components/emails/email-conversation";

/**
 * Rede de segurança, não o mecanismo principal.
 *
 * Quem atualiza a tela é o Realtime (logo abaixo). Este intervalo cobre o caso
 * de o socket cair sem avisar — o modo de falha do Realtime é silencioso, e uma
 * resposta que não aparece é indistinguível de nenhuma resposta ter chegado.
 */
const INTERVALO_ATUALIZACAO_MS = 120_000;

export interface LeadEmailSectionProps {
    telefone: string;
    canal: string;
    nome: string | null;
    /** Os quatro e-mails do lead, como estão no formulário do painel. */
    emails: Partial<Record<EmailFieldKey, string | null>>;
    onToast: (toast: { type: "success" | "error"; text: string }) => void;
    /**
     * Quantas respostas acabaram de ser lidas.
     *
     * Serve pro card do lead na lista lateral baixar o badge verde na hora,
     * sem esperar o próximo carregamento da lista.
     */
    onLidoLocal?: (quantidade: number) => void;
}

/**
 * Bloco de e-mail no painel do lead: botão que abre a composição e as
 * conversas já trocadas.
 *
 * A composição de e-mail NOVO vive no mesmo modal do disparo por tag — a barra
 * de formatação do Gmail não caberia nos 350px da coluna. Responder dentro de
 * uma conversa existente é inline, no próprio item.
 */
export function LeadEmailSection({
    telefone,
    canal,
    nome,
    emails,
    onToast,
    onLidoLocal,
}: LeadEmailSectionProps) {
    const hasEmail = EMAIL_FIELD_ORDER.some((key) => {
        const value = (emails[key] || "").trim();
        return value.length > 0 && isValidEmail(value);
    });

    const [composeOpen, setComposeOpen] = useState(false);
    const [conversas, setConversas] = useState<EmailConversation[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [atualizando, setAtualizando] = useState(false);

    // Guarda a chamada em voo pra um clique repetido no refresh não empilhar
    // requisição nem piscar o ícone fora de hora.
    const emVoo = useRef(false);
    // Chegou pedido enquanto a busca anterior rodava.
    const pendente = useRef(false);

    /**
     * Recarrega as conversas do servidor, no máximo uma de cada vez.
     *
     * Pedido que chega no meio de uma busca é ADIADO, nunca descartado: o
     * evento do Realtime que troca `pending` por `sent` costuma cair poucos
     * segundos depois do envio — bem em cima do refetch que o próprio envio
     * disparou. Simplesmente ignorá-lo deixava a bolha em "Na fila de envio"
     * até o intervalo de segurança de dois minutos, o que na tela é
     * indistinguível de "o Realtime não está funcionando".
     *
     * Nenhum setState acontece antes do primeiro `await`, então dá pra chamar
     * esta função direto de dentro de um efeito.
     */
    const buscar = useCallback(
        async (aoFalhar?: () => void): Promise<void> => {
            if (emVoo.current) {
                pendente.current = true;
                return;
            }
            emVoo.current = true;

            try {
                do {
                    pendente.current = false;
                    try {
                        setConversas(await listLeadEmailConversations(telefone, canal));
                    } catch {
                        aoFalhar?.();
                    }
                } while (pendente.current);
            } finally {
                emVoo.current = false;
                setCarregando(false);
            }
        },
        [telefone, canal],
    );

    useEffect(() => { void buscar(); }, [buscar]);

    /** Refresh manual: só aqui o ícone gira e o erro vira aviso na tela. */
    function atualizarAgora() {
        if (emVoo.current) return;
        setAtualizando(true);
        void buscar(() =>
            onToast({ type: "error", text: "Não foi possível atualizar os e-mails." }),
        ).finally(() => setAtualizando(false));
    }

    /**
     * Resposta nova aparece sozinha.
     *
     * O socket vai autenticado: o cliente do browser é criado com
     * `accessToken` apontando pro token do Clerk, e o Realtime usa o mesmo
     * token do PostgREST — então a policy de `authenticated` aprova a linha e
     * o evento é entregue. (A lib reautentica o socket a cada heartbeat, então
     * a rotação do token do Clerk não derruba a assinatura.)
     *
     * O callback REBUSCA em vez de remendar o estado local: as conversas são
     * agrupadas por thread no servidor, e reproduzir esse agrupamento aqui a
     * partir de uma linha solta seria uma segunda verdade sobre o mesmo dado.
     */
    useEffect(() => {
        const canal_ = supabase
            .channel(`email-lead-${telefone}-${canal}`)
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "email_replies" },
                () => void buscar(),
            )
            .on(
                "postgres_changes",
                { event: "UPDATE", schema: "public", table: "email_sends" },
                () => void buscar(),
            )
            .subscribe((status) => {
                // Sem isto a falha é muda: o canal morre e a tela só fica
                // parada, sem nada que distinga isso de "não chegou resposta".
                if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
                    console.warn(`[email] Realtime ${status} — caiu no intervalo de segurança.`);
                }
            });

        return () => { void supabase.removeChannel(canal_); };
    }, [telefone, canal, buscar]);

    /**
     * Atualização periódica + ao voltar pra aba.
     *
     * O `visibilitychange` é o que resolve o caso do dia a dia: a pessoa
     * troca de janela, volta depois de um tempo e quer ver o que chegou sem
     * ter que sair do lead e entrar de novo.
     */
    useEffect(() => {
        const timer = setInterval(() => {
            if (document.visibilityState === "visible") void buscar();
        }, INTERVALO_ATUALIZACAO_MS);

        const aoVoltar = () => {
            if (document.visibilityState === "visible") void buscar();
        };
        document.addEventListener("visibilitychange", aoVoltar);

        return () => {
            clearInterval(timer);
            document.removeEventListener("visibilitychange", aoVoltar);
        };
    }, [buscar]);

    /** Tira o destaque de não lida na hora do clique, sem esperar o refetch. */
    function marcarLidas(replyIds: string[]) {
        if (replyIds.length === 0) return;
        onLidoLocal?.(replyIds.length);
        const alvo = new Set(replyIds);
        setConversas((prev) =>
            prev.map((c) => {
                if (!c.messages.some((m) => alvo.has(m.id))) return c;
                const messages = c.messages.map((m) =>
                    alvo.has(m.id) && m.direcao === "recebido" && m.readAt === null
                        ? { ...m, readAt: new Date().toISOString() }
                        : m,
                );
                return {
                    ...c,
                    messages,
                    unreadCount: messages.filter(
                        (m) => m.direcao === "recebido" && m.readAt === null,
                    ).length,
                };
            }),
        );
    }

    async function apagar(sendIds: string[]) {
        const res = await deleteEmailConversation(sendIds);
        onToast(
            res.ok
                ? {
                      type: "success",
                      text: res.eraAgendado ? "Agendamento cancelado" : "Conversa removida",
                  }
                : { type: "error", text: res.error },
        );
        void buscar();
    }

    function focusEmailField() {
        const el = document.getElementById("lead-field-email");
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        (el as HTMLInputElement).focus({ preventScroll: true });
    }

    const totalNaoLidas = conversas.reduce((soma, c) => soma + c.unreadCount, 0);

    return (
        <div className="pt-4 border-t border-[#C7D2FE] dark:border-[#3d4a60]/60">
            <div className="flex items-center gap-1.5 mb-3">
                <Mail className="w-3.5 h-3.5 text-brand-400/70" />
                <h4 className="text-xs font-semibold text-[#37352F] dark:text-[#cbd5e1] tracking-tight flex-1">
                    E-mail
                    {totalNaoLidas > 0 && (
                        <span className="ml-1.5 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
                            {totalNaoLidas}
                        </span>
                    )}
                </h4>
                <button
                    type="button"
                    onClick={atualizarAgora}
                    disabled={atualizando}
                    title="Atualizar e-mails"
                    aria-label="Atualizar e-mails"
                    className="p-1.5 rounded-lg text-[#6366F1] dark:text-[#94a3b8] hover:bg-[#E0E7FF] dark:hover:bg-[#2d3347] transition-colors disabled:opacity-60"
                >
                    <RefreshCw className={cn("w-3.5 h-3.5", atualizando && "animate-spin")} />
                </button>
                {hasEmail && (
                    <button
                        type="button"
                        onClick={() => setComposeOpen(true)}
                        title="Enviar e-mail"
                        aria-label="Enviar e-mail"
                        className="p-1.5 rounded-lg text-orange-500 hover:text-orange-400 hover:bg-orange-500/10 transition-colors"
                    >
                        <Send className="w-4 h-4" />
                    </button>
                )}
            </div>

            {!hasEmail && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-[#EEF2FF] dark:bg-[#1e2536]/60 border border-[#C7D2FE] dark:border-[#3d4a60]">
                    <AlertCircle className="w-3.5 h-3.5 text-[#6366F1] dark:text-[#94a3b8] shrink-0 mt-0.5" />
                    <p className="text-[11px] text-[#6366F1] dark:text-[#94a3b8] leading-relaxed">
                        Nenhum e-mail cadastrado
                        {canal !== "festas" && (
                            <>
                                {" — "}
                                <button
                                    type="button"
                                    onClick={focusEmailField}
                                    className="font-semibold text-brand-400 hover:text-brand-300 underline underline-offset-2 transition-colors"
                                >
                                    adicionar
                                </button>
                            </>
                        )}
                    </p>
                </div>
            )}

            <div className="mt-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#6366F1] dark:text-[#94a3b8]">
                        Conversas
                    </span>
                    {conversas.length > 0 && (
                        <span className="text-[10px] bg-[#E0E7FF] dark:bg-[#2d3347]/80 text-[#6366F1] dark:text-[#94a3b8] px-1.5 py-0.5 rounded-full font-medium">
                            {conversas.length}
                        </span>
                    )}
                </div>

                {carregando ? (
                    <div className="flex justify-center py-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#6366F1] dark:text-[#94a3b8]" />
                    </div>
                ) : conversas.length === 0 ? (
                    <p className="text-[11px] italic text-[#9B9A97] dark:text-[#64748b]">
                        Nenhum e-mail enviado ainda.
                    </p>
                ) : (
                    <div className="space-y-1 max-h-[420px] overflow-y-auto pr-0.5">
                        {conversas.map((conversa) => (
                            <EmailConversationItem
                                key={conversa.id}
                                conversa={conversa}
                                onRead={marcarLidas}
                                onDelete={(ids) => void apagar(ids)}
                                onReplied={() => void buscar()}
                                onToast={onToast}
                            />
                        ))}
                    </div>
                )}
            </div>

            <EmailComposeModal
                open={composeOpen}
                onOpenChange={setComposeOpen}
                target={{ mode: "lead", telefone, canal, nome, emails }}
                onToast={onToast}
                onSent={() => void buscar()}
            />
        </div>
    );
}
