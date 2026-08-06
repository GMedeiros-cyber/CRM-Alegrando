"use client";

import { useCallback, useEffect, useState } from "react";
import {
    AlertCircle,
    CalendarClock,
    CheckCircle2,
    Clock,
    Loader2,
    Mail,
    Paperclip,
    X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { cancelScheduledEmail, listLeadEmailSends } from "@/lib/actions/emails";
import {
    EMAIL_FIELD_ORDER,
    type EmailFieldKey,
    type EmailSendRecord,
} from "@/lib/types/email";
import { isValidEmail } from "@/lib/email/format";
import { EmailComposeModal } from "@/components/emails/email-compose-modal";

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

    async function handleCancel(sendId: string) {
        const res = await cancelScheduledEmail(sendId);
        onToast(
            res.ok
                ? { type: "success", text: "Agendamento cancelado" }
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
                        className="text-[10px] font-semibold text-brand-400 hover:text-brand-300 transition-colors"
                    >
                        + Enviar e-mail
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
                    <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
                        {history.map((row) => (
                            <EmailHistoryRow
                                key={row.id}
                                row={row}
                                onCancel={() => void handleCancel(row.id)}
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
    onCancel,
}: {
    row: EmailSendRecord;
    onCancel: () => void;
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

    return (
        <div className="px-2 py-1.5 rounded-lg bg-[#EEF2FF] dark:bg-[#1e2536]/60 border border-[#C7D2FE] dark:border-[#3d4a60]/60">
            <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium text-[#191918] dark:text-white truncate">
                        {row.subject}
                    </p>
                    <p className="text-[10px] text-[#6366F1] dark:text-[#94a3b8] truncate">
                        {row.recipientEmail}
                    </p>
                    {row.attachments.length > 0 && (
                        <p className="flex items-center gap-1 text-[10px] text-[#6366F1] dark:text-[#94a3b8]">
                            <Paperclip className="w-2.5 h-2.5" />
                            {row.attachments.length}{" "}
                            {row.attachments.length === 1 ? "anexo" : "anexos"}
                        </p>
                    )}
                </div>
                <div className="shrink-0 text-right">
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
            </div>
            {row.status === "failed" && row.error && (
                <p className="mt-1 text-[9px] text-red-400/90 leading-snug break-words">
                    {row.error}
                </p>
            )}
            {row.status === "scheduled" && (
                <button
                    type="button"
                    onClick={onCancel}
                    className="mt-1 text-[10px] font-semibold text-red-400 hover:text-red-300 transition-colors"
                >
                    Cancelar agendamento
                </button>
            )}
        </div>
    );
}
