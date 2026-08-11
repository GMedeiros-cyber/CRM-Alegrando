"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, Mail, RefreshCw, Send } from "lucide-react";
import { cn } from "@/lib/utils";
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
 * De quanto em quanto tempo a seção se atualiza sozinha enquanto está aberta.
 *
 * O ideal seria Realtime, mas ele não chega: o navegador fala com o Supabase
 * pela chave anon, e `email_replies`/`email_sends` só liberam leitura pra
 * `authenticated` — o Postgres filtra o evento antes de mandar. Abrir essas
 * tabelas pro `anon` resolveria o sintoma e vazaria o conteúdo de todos os
 * e-mails, porque essa chave vai no pacote do navegador.
 *
 * 30s não é arbitrário: o worker que traz as respostas roda de 5 em 5 minutos,
 * então esse é o piso real de frescor do dado. Puxar mais rápido que isso não
 * mostraria nada mais novo.
 */
const INTERVALO_ATUALIZACAO_MS = 30_000;

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
     * Serve pro card do lead na lista lateral baixar o badge verde na hora.
     * Sem isso ele só sumiria no próximo carregamento da lista — e como o
     * Realtime dessas tabelas não chega ao navegador (a chave anon não
     * enxerga `email_replies`), esse "próximo carregamento" pode demorar.
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

    // Sem setState síncrono aqui: tudo acontece nos callbacks da promise, pra
    // esta função poder ser chamada direto de dentro de um efeito.
    const buscar = useCallback(
        (aoFalhar?: () => void) => {
            if (emVoo.current) return Promise.resolve();
            emVoo.current = true;

            return listLeadEmailConversations(telefone, canal)
                .then((rows) => setConversas(rows))
                .catch(() => aoFalhar?.())
                .finally(() => {
                    emVoo.current = false;
                    setCarregando(false);
                });
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
