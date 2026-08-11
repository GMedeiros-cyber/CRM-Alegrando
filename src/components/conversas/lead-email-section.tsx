"use client";

import { useCallback, useEffect, useState } from "react";
import {
    AlertCircle,
    CalendarClock,
    CheckCircle2,
    Clock,
    Loader2,
    Mail,
    Send,
    Trash2,
    X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase/client";
import { deleteEmailSend, listLeadEmailSends } from "@/lib/actions/emails";
import {
    EMAIL_FIELD_ORDER,
    type EmailFieldKey,
    type EmailReplyRecord,
    type EmailSendRecord,
} from "@/lib/types/email";
import { isValidEmail } from "@/lib/email/format";
import { EmailComposeModal } from "@/components/emails/email-compose-modal";
import { EmailReplyList } from "@/components/emails/email-reply-list";

export interface LeadEmailSectionProps {
    telefone: string;
    canal: string;
    nome: string | null;
    /** Os quatro e-mails do lead, como estão no formulário do painel. */
    emails: Partial<Record<EmailFieldKey, string | null>>;
    onToast: (toast: { type: "success" | "error"; text: string }) => void;
}

/**
 * Bloco de e-mail no painel do lead: botão que abre a composição e o histórico
 * do que já foi mandado.
 *
 * A composição em si vive no mesmo modal do disparo por tag — a barra de
 * formatação do Gmail não caberia nos 350px da coluna, e manter duas
 * experiências de escrita diferentes seria pior pra elas e pra manutenção.
 */
export function LeadEmailSection({
    telefone,
    canal,
    nome,
    emails,
    onToast,
}: LeadEmailSectionProps) {
    const hasEmail = EMAIL_FIELD_ORDER.some((key) => {
        const value = (emails[key] || "").trim();
        return value.length > 0 && isValidEmail(value);
    });

    const [composeOpen, setComposeOpen] = useState(false);
    const [history, setHistory] = useState<EmailSendRecord[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(true);

    // Sem setState síncrono: tudo acontece nos callbacks da promise.
    const fetchHistory = useCallback(
        () =>
            listLeadEmailSends(telefone, canal)
                .then((rows) => setHistory(rows))
                .catch(() => setHistory([]))
                .finally(() => setLoadingHistory(false)),
        [telefone, canal],
    );

    useEffect(() => { void fetchHistory(); }, [fetchHistory]);

    /**
     * O n8n grava sent/failed depois que a resposta do webhook já voltou.
     * Sem escutar isso, a linha ficaria em "Na fila" até alguém recarregar —
     * era o que dava a impressão de que o envio tinha travado.
     *
     * Só faz patch de linha que JÁ está no histórico: assim não é preciso
     * saber o lead_id aqui, e evento de outro lead é ignorado de graça.
     */
    useEffect(() => {
        const channel = supabase
            .channel(`email-sends-${telefone}-${canal}`)
            .on(
                "postgres_changes",
                { event: "UPDATE", schema: "public", table: "email_sends" },
                (payload) => {
                    const row = payload.new as {
                        id: string;
                        status?: string;
                        sent_at?: string | null;
                        error?: string | null;
                    };
                    setHistory((prev) =>
                        prev.some((r) => r.id === row.id)
                            ? prev.map((r) =>
                                  r.id === row.id
                                      ? {
                                            ...r,
                                            status: (row.status || r.status) as EmailSendRecord["status"],
                                            sentAt: row.sent_at ?? r.sentAt,
                                            error: row.error ?? null,
                                        }
                                      : r,
                              )
                            : prev,
                    );
                },
            )
            .subscribe();

        return () => { void supabase.removeChannel(channel); };
    }, [telefone, canal]);

    /**
     * Resposta que chega enquanto o painel está aberto.
     *
     * Mesmo critério do bloco acima: só entra se o envio de origem já estiver
     * no histórico — assim a assinatura pode ser global (o Realtime não filtra
     * por lead) sem que resposta de outro lead apareça aqui.
     */
    useEffect(() => {
        const channel = supabase
            .channel(`email-replies-${telefone}-${canal}`)
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "email_replies" },
                (payload) => {
                    const row = payload.new as Partial<{
                        id: string;
                        email_send_id: string;
                        from_email: string;
                        from_name: string | null;
                        subject: string | null;
                        snippet: string | null;
                        body_text: string | null;
                        body_html: string | null;
                        received_at: string;
                        read_at: string | null;
                    }>;
                    if (!row?.id || !row.email_send_id) return;

                    setHistory((prev) => {
                        const envio = prev.find((r) => r.id === row.email_send_id);
                        if (!envio) return prev;

                        const nova: EmailReplyRecord = {
                            id: row.id!,
                            fromEmail: row.from_email ?? "",
                            fromName: row.from_name ?? null,
                            subject: row.subject ?? null,
                            snippet: row.snippet ?? null,
                            bodyText: row.body_text ?? null,
                            bodyHtml: row.body_html ?? null,
                            receivedAt: row.received_at ?? new Date().toISOString(),
                            readAt: row.read_at ?? null,
                        };

                        return prev.map((r) =>
                            r.id !== row.email_send_id
                                ? r
                                : {
                                      ...r,
                                      replies: r.replies.some((x) => x.id === nova.id)
                                          ? r.replies.map((x) => (x.id === nova.id ? nova : x))
                                          : [...r.replies, nova],
                                  },
                        );
                    });
                },
            )
            .subscribe();

        return () => { void supabase.removeChannel(channel); };
    }, [telefone, canal]);

    /** Marca localmente pra a linha sair do destaque na hora do clique. */
    function marcarLida(replyId: string) {
        setHistory((prev) =>
            prev.map((r) => ({
                ...r,
                replies: r.replies.map((x) =>
                    x.id === replyId && x.readAt === null
                        ? { ...x, readAt: new Date().toISOString() }
                        : x,
                ),
            })),
        );
    }

    /**
     * `respondendo` NÃO volta a null ao fechar: se o modal desmontasse na
     * hora, a animação de saída não rodaria e a resposta sumiria seca, ao
     * contrário de todos os outros modais. Quem manda no aberto/fechado é a
     * flag; o registro só é trocado na próxima abertura.
     */
    const [respondendo, setRespondendo] = useState<EmailReplyRecord | null>(null);
    const [respostaAberta, setRespostaAberta] = useState(false);

    function abrirResposta(reply: EmailReplyRecord) {
        setRespondendo(reply);
        setRespostaAberta(true);
    }

    const [confirmando, setConfirmando] = useState<string | null>(null);

    async function handleDelete(sendId: string) {
        setConfirmando(null);
        const res = await deleteEmailSend(sendId);
        onToast(
            res.ok
                ? {
                      type: "success",
                      text: res.eraAgendado
                          ? "Agendamento cancelado"
                          : "Removido do histórico",
                  }
                : { type: "error", text: res.error },
        );
        void fetchHistory();
    }

    function focusEmailField() {
        const el = document.getElementById("lead-field-email");
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        (el as HTMLInputElement).focus({ preventScroll: true });
    }

    return (
        <div className="pt-4 border-t border-[#C7D2FE] dark:border-[#3d4a60]/60">
            <div className="flex items-center gap-1.5 mb-3">
                <Mail className="w-3.5 h-3.5 text-brand-400/70" />
                <h4 className="text-xs font-semibold text-[#37352F] dark:text-[#cbd5e1] tracking-tight flex-1">
                    E-mail
                </h4>
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

            {/* Histórico */}
            <div className="mt-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#6366F1] dark:text-[#94a3b8]">
                        Enviados
                    </span>
                    {history.length > 0 && (
                        <span className="text-[10px] bg-[#E0E7FF] dark:bg-[#2d3347]/80 text-[#6366F1] dark:text-[#94a3b8] px-1.5 py-0.5 rounded-full font-medium">
                            {history.length}
                        </span>
                    )}
                </div>

                {loadingHistory ? (
                    <div className="flex justify-center py-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#6366F1] dark:text-[#94a3b8]" />
                    </div>
                ) : history.length === 0 ? (
                    <p className="text-[11px] italic text-[#9B9A97] dark:text-[#64748b]">
                        Nenhum e-mail enviado ainda.
                    </p>
                ) : (
                    <div className="space-y-1 max-h-[340px] overflow-y-auto pr-0.5">
                        {history.map((row) => (
                            <EmailHistoryRow
                                key={row.id}
                                row={row}
                                confirmando={confirmando === row.id}
                                onPedirConfirmacao={() => setConfirmando(row.id)}
                                onCancelarConfirmacao={() => setConfirmando(null)}
                                onDelete={() => void handleDelete(row.id)}
                                onLerResposta={marcarLida}
                                onResponder={abrirResposta}
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
                onSent={() => void fetchHistory()}
            />

            {respondendo && (
                <EmailComposeModal
                    open={respostaAberta}
                    onOpenChange={setRespostaAberta}
                    target={{
                        mode: "reply",
                        replyId: respondendo.id,
                        toEmail: respondendo.fromEmail,
                        toName: respondendo.fromName,
                        subject: respondendo.subject,
                    }}
                    onToast={onToast}
                    onSent={() => void fetchHistory()}
                />
            )}
        </div>
    );
}

const STATUS_UI = {
    sent: {
        icon: <CheckCircle2 className="w-3 h-3" />,
        text: "Enviado",
        className: "text-emerald-500 dark:text-emerald-400",
    },
    failed: {
        icon: <X className="w-3 h-3" />,
        text: "Falhou",
        className: "text-red-500 dark:text-red-400",
    },
    pending: {
        icon: <Clock className="w-3 h-3" />,
        text: "Na fila",
        className: "text-amber-500 dark:text-amber-400",
    },
    scheduled: {
        icon: <CalendarClock className="w-3 h-3" />,
        text: "Programado",
        className: "text-brand-500 dark:text-brand-400",
    },
} as const;

function EmailHistoryRow({
    row,
    confirmando,
    onPedirConfirmacao,
    onCancelarConfirmacao,
    onDelete,
    onLerResposta,
    onResponder,
}: {
    row: EmailSendRecord;
    confirmando: boolean;
    onPedirConfirmacao: () => void;
    onCancelarConfirmacao: () => void;
    onDelete: () => void;
    onLerResposta: (replyId: string) => void;
    onResponder: (reply: EmailReplyRecord) => void;
}) {
    const reference =
        row.status === "scheduled" ? row.scheduledFor : row.sentAt || row.createdAt;
    const date = reference ? new Date(reference) : null;
    const dateLabel =
        date && !Number.isNaN(date.getTime())
            ? date.toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
              })
            : "";

    const status = STATUS_UI[row.status] ?? STATUS_UI.pending;

    const agendado = row.status === "scheduled";

    if (confirmando) {
        return (
            <div className="px-2 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30">
                <p className="text-[10px] font-medium text-red-500 dark:text-red-400 leading-snug">
                    {agendado
                        ? "Cancelar este envio agendado? Ele não será mais disparado."
                        : "Remover do histórico?"}
                </p>
                {!agendado && (
                    // Sem isto é fácil achar que o botão "desenvia" a mensagem.
                    <p className="mt-0.5 text-[9px] text-[#6366F1] dark:text-[#94a3b8] leading-snug">
                        Apaga só o registro aqui no CRM — o e-mail já entregue continua
                        na caixa de quem recebeu.
                    </p>
                )}
                <div className="flex gap-1.5 mt-1.5">
                    <button
                        type="button"
                        onClick={onDelete}
                        className="flex-1 px-2 py-1 rounded-md bg-red-500 text-white text-[10px] font-semibold hover:bg-red-600 transition-colors"
                    >
                        {agendado ? "Cancelar envio" : "Remover"}
                    </button>
                    <button
                        type="button"
                        onClick={onCancelarConfirmacao}
                        className="flex-1 px-2 py-1 rounded-md bg-[#E0E7FF] dark:bg-[#2d3347] text-[10px] font-semibold text-[#191918] dark:text-white hover:bg-[#C7D2FE] dark:hover:bg-[#3d4a60] transition-colors"
                    >
                        Voltar
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="group/email flex items-start gap-2 px-2 py-1 rounded-lg bg-[#EEF2FF] dark:bg-[#1e2536]/60 border border-[#C7D2FE] dark:border-[#3d4a60]/60">
                <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium text-[#191918] dark:text-white truncate">
                        {/* Sem isto, a nossa resposta e o e-mail que a originou
                            ficam indistinguíveis na lista — os dois carregam o
                            mesmo assunto da conversa. */}
                        {row.origem === "resposta" && (
                            <span className="mr-1 text-[9px] font-bold uppercase tracking-wide text-brand-500 dark:text-brand-400">
                                resposta
                            </span>
                        )}
                        {row.subject}
                    </p>
                    <p className="text-[10px] text-[#6366F1] dark:text-[#94a3b8] truncate">
                        {row.recipientEmail}
                        {row.attachments.length > 0 && (
                            <span className="ml-1 whitespace-nowrap">
                                · {row.attachments.length}{" "}
                                {row.attachments.length === 1 ? "anexo" : "anexos"}
                            </span>
                        )}
                    </p>
                    {row.status === "failed" && row.error && (
                        <p className="text-[9px] text-red-400/90 leading-snug break-words">
                            {row.error}
                        </p>
                    )}
                </div>

                <div className="shrink-0 flex items-center gap-1">
                    <div className="text-right">
                        <span
                            className={cn(
                                "flex items-center gap-1 text-[10px] font-semibold justify-end",
                                status.className,
                            )}
                        >
                            {status.icon}
                            {status.text}
                        </span>
                        {dateLabel && (
                            <span className="text-[9px] text-[#9B9A97] dark:text-[#64748b]">
                                {dateLabel}
                            </span>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={onPedirConfirmacao}
                        title={agendado ? "Cancelar agendamento" : "Remover do histórico"}
                        aria-label={agendado ? "Cancelar agendamento" : "Remover do histórico"}
                        className="p-1 rounded text-[#9B9A97] dark:text-[#64748b] opacity-0 transition-opacity hover:text-red-500 group-hover/email:opacity-100 focus:opacity-100"
                    >
                        <Trash2 className="w-3 h-3" />
                    </button>
                </div>
            </div>

            <EmailReplyList
                replies={row.replies}
                onRead={onLerResposta}
                onReply={onResponder}
            />
        </div>
    );
}
