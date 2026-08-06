"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
    AlertCircle,
    CheckCircle2,
    Clock,
    Loader2,
    Mail,
    Send,
    X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { listLeadEmailSends, sendEmailToLead } from "@/lib/actions/emails";
import {
    EMAIL_FIELD_LABELS,
    EMAIL_FIELD_ORDER,
    EMAIL_FIELD_PRIORITY,
    type EmailFieldKey,
    type EmailSendRecord,
} from "@/lib/types/email";
import { isValidEmail } from "@/lib/email/format";

export interface LeadEmailSectionProps {
    telefone: string;
    canal: string;
    /** Os quatro e-mails do lead, como estão no formulário do painel. */
    emails: Partial<Record<EmailFieldKey, string | null>>;
    onToast: (toast: { type: "success" | "error"; text: string }) => void;
}

/** Só os tipos com endereço preenchido e válido, na ordem de exibição. */
function availableFields(
    emails: LeadEmailSectionProps["emails"],
): { key: EmailFieldKey; address: string }[] {
    return EMAIL_FIELD_ORDER.flatMap((key) => {
        const value = (emails[key] || "").trim();
        return value && isValidEmail(value) ? [{ key, address: value }] : [];
    });
}

export function LeadEmailSection({
    telefone,
    canal,
    emails,
    onToast,
}: LeadEmailSectionProps) {
    const available = availableFields(emails);
    const hasEmail = available.length > 0;

    const [open, setOpen] = useState(false);
    const [subject, setSubject] = useState("");
    const [body, setBody] = useState("");
    /** null = ela ainda não mexeu nos checkboxes; usa o padrão por prioridade. */
    const [touchedSelection, setTouchedSelection] = useState<EmailFieldKey[] | null>(null);
    const [error, setError] = useState("");
    const [sending, startSending] = useTransition();

    const [history, setHistory] = useState<EmailSendRecord[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(true);

    // Sem setState síncrono: as atualizações acontecem nos callbacks da promise.
    const fetchHistory = useCallback(
        () =>
            listLeadEmailSends(telefone, canal)
                .then((rows) => setHistory(rows))
                .catch(() => setHistory([]))
                .finally(() => setLoadingHistory(false)),
        [telefone, canal],
    );

    useEffect(() => { void fetchHistory(); }, [fetchHistory]);

    // Pré-marca o primeiro endereço na ordem de prioridade. Derivado (e não
    // sincronizado por effect) pra que um e-mail recém-cadastrado no painel já
    // apareça marcado, sem atropelar o que ela tiver escolhido.
    const defaultField = EMAIL_FIELD_PRIORITY.find((key) =>
        available.some((a) => a.key === key),
    );
    const selected = touchedSelection ?? (defaultField ? [defaultField] : []);

    function toggleField(key: EmailFieldKey) {
        setTouchedSelection(
            selected.includes(key)
                ? selected.filter((k) => k !== key)
                : [...selected, key],
        );
    }

    function focusEmailField() {
        const el = document.getElementById("lead-email-input");
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        (el as HTMLInputElement).focus({ preventScroll: true });
    }

    const canSend =
        selected.length > 0 && subject.trim().length > 0 && body.trim().length > 0;

    function handleSend() {
        if (!canSend || sending) return;
        setError("");

        startSending(async () => {
            const result = await sendEmailToLead({
                telefone,
                canal,
                fields: selected,
                subject,
                body,
            });

            if (!result.ok) {
                // Mantém assunto e corpo — ela não pode perder o que escreveu.
                setError(result.error);
                return;
            }

            onToast({
                type: "success",
                text: result.processing ? "E-mail na fila de envio" : "E-mail enviado",
            });
            setSubject("");
            setBody("");
            setOpen(false);
            void fetchHistory();
        });
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
                        onClick={() => { setOpen((v) => !v); setError(""); }}
                        className="text-[10px] font-semibold text-brand-400 hover:text-brand-300 transition-colors"
                    >
                        {open ? "Cancelar" : "+ Enviar e-mail"}
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

            {hasEmail && open && (
                <div className="space-y-2.5 p-3 rounded-xl bg-[#EEF2FF] dark:bg-[#1e2536]/60 border border-[#C7D2FE] dark:border-[#3d4a60]">
                    {/* Destinatários */}
                    <div className="space-y-1.5">
                        <span className="text-[10px] font-semibold text-[#37352F] dark:text-[#cbd5e1] uppercase tracking-wider">
                            {available.length === 1 ? "Para" : "Enviar para"}
                        </span>

                        {available.length === 1 ? (
                            <p className="text-[11px] text-[#191918] dark:text-white">
                                <span className="font-semibold">
                                    {EMAIL_FIELD_LABELS[available[0].key]}
                                </span>
                                <span className="text-[#6366F1] dark:text-[#94a3b8]">
                                    {" — "}{available[0].address}
                                </span>
                            </p>
                        ) : (
                            <div className="space-y-1">
                                {available.map(({ key, address }) => {
                                    const checked = selected.includes(key);
                                    return (
                                        <label
                                            key={key}
                                            className="flex items-start gap-2 cursor-pointer group/email"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => toggleField(key)}
                                                className="mt-0.5 w-3.5 h-3.5 shrink-0 rounded accent-brand-500 cursor-pointer"
                                            />
                                            <span className="text-[11px] leading-snug min-w-0">
                                                <span
                                                    className={cn(
                                                        "font-semibold",
                                                        checked
                                                            ? "text-[#191918] dark:text-white"
                                                            : "text-[#37352F] dark:text-[#cbd5e1]",
                                                    )}
                                                >
                                                    {EMAIL_FIELD_LABELS[key]}
                                                </span>
                                                <span className="block text-[10px] text-[#6366F1] dark:text-[#94a3b8] break-all">
                                                    {address}
                                                </span>
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <input
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        placeholder="Assunto"
                        className="w-full rounded-lg px-2.5 py-1.5 text-xs bg-[#F7F7F5] dark:bg-[#0f1829] border border-[#A5B4FC] dark:border-[#4a5568] text-[#191918] dark:text-white placeholder:text-[#9B9A97] dark:placeholder:text-[#64748b] outline-none focus:ring-1 focus:ring-brand-400 focus:border-brand-400"
                    />

                    <textarea
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        rows={6}
                        placeholder="Escreva a mensagem..."
                        className="w-full rounded-lg px-2.5 py-1.5 text-xs leading-relaxed resize-y bg-[#F7F7F5] dark:bg-[#0f1829] border border-[#A5B4FC] dark:border-[#4a5568] text-[#191918] dark:text-white placeholder:text-[#9B9A97] dark:placeholder:text-[#64748b] outline-none focus:ring-1 focus:ring-brand-400 focus:border-brand-400"
                    />

                    {error && (
                        <div className="flex items-start gap-1.5 px-2 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30">
                            <AlertCircle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />
                            <p className="text-[10px] text-red-400 leading-snug">{error}</p>
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={handleSend}
                        disabled={!canSend || sending}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-brand-500 text-white text-xs font-semibold hover:bg-brand-600 disabled:opacity-40 disabled:hover:bg-brand-500 transition-colors"
                    >
                        {sending ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                            <Send className="w-3.5 h-3.5" />
                        )}
                        {sending ? "Enviando..." : "Enviar"}
                    </button>
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
                            <EmailHistoryRow key={row.id} row={row} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function EmailHistoryRow({ row }: { row: EmailSendRecord }) {
    const date = new Date(row.sentAt || row.createdAt);
    const dateLabel = Number.isNaN(date.getTime())
        ? ""
        : date.toLocaleString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
          });

    const status = {
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
    }[row.status];

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
        </div>
    );
}
