"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { AlertCircle, ArrowLeft, Loader2, Search, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { listLeadsByLabels, sendEmailToLeads } from "@/lib/actions/emails";
import {
    EMAIL_FIELD_LABELS,
    EMAIL_FIELD_ORDER,
    type EmailFieldKey,
    type LeadEmailRow,
} from "@/lib/types/email";
import type { Label } from "@/lib/types/labels";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

const PAGE_SIZE = 50;

/** Endereços que este lead receberá, dados os tipos marcados (sem repetir). */
function reachableEmails(lead: LeadEmailRow, fields: EmailFieldKey[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const key of EMAIL_FIELD_ORDER) {
        if (!fields.includes(key)) continue;
        const address = lead.emails[key];
        if (!address) continue;
        const dedupeKey = address.toLowerCase();
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        out.push(address);
    }
    return out;
}

export interface EmailBlastModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Tags ativas no filtro da lista — é daqui que sai o público. */
    labelIds: string[];
    availableLabels: Label[];
    /** Canal filtrado na tela; o disparo respeita o mesmo recorte. */
    canal: "todos" | "alegrando" | "festas";
    onToast: (toast: { type: "success" | "error"; text: string }) => void;
}

export function EmailBlastModal(props: EmailBlastModalProps) {
    return (
        <Dialog open={props.open} onOpenChange={props.onOpenChange}>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col gap-4 overflow-hidden">
                {/* O conteúdo desmonta ao fechar — cada abertura começa limpa. */}
                <BlastForm {...props} />
            </DialogContent>
        </Dialog>
    );
}

type LoadState =
    | { loading: true }
    | { loading: false; rows: LeadEmailRow[]; error: string };

function BlastForm({
    labelIds,
    availableLabels,
    canal,
    onOpenChange,
    onToast,
}: EmailBlastModalProps) {
    const labelKey = labelIds.join(",");
    const [state, setState] = useState<LoadState>({ loading: true });

    const [fields, setFields] = useState<EmailFieldKey[]>(["email"]);
    /** Exclusões explícitas: o padrão é mandar pra todos, ela tira as exceções. */
    const [excluded, setExcluded] = useState<Set<string>>(new Set());
    const [search, setSearch] = useState("");
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

    const [subject, setSubject] = useState("");
    const [body, setBody] = useState("");
    const [view, setView] = useState<"compose" | "confirm">("compose");
    const [error, setError] = useState("");
    const [sending, startSending] = useTransition();

    useEffect(() => {
        let cancelled = false;
        listLeadsByLabels(labelKey.split(","))
            .then((rows) => {
                if (!cancelled) setState({ loading: false, rows, error: "" });
            })
            .catch((err: unknown) => {
                if (cancelled) return;
                setState({
                    loading: false,
                    rows: [],
                    error: err instanceof Error ? err.message : "Erro ao carregar leads.",
                });
            });
        return () => { cancelled = true; };
    }, [labelKey]);

    // Respeita o filtro de canal da tela: ela não pode disparar pra quem não
    // está vendo na lista.
    const leads = useMemo(() => {
        if (state.loading) return [];
        return canal === "todos"
            ? state.rows
            : state.rows.filter((r) => r.canal === canal);
    }, [state, canal]);

    const withEmails = useMemo(
        () => leads.map((lead) => ({ lead, addresses: reachableEmails(lead, fields) })),
        [leads, fields],
    );
    const reachable = useMemo(
        () => withEmails.filter((r) => r.addresses.length > 0),
        [withEmails],
    );
    const selectedIds = useMemo(
        () => reachable.filter((r) => !excluded.has(r.lead.leadId)).map((r) => r.lead.leadId),
        [reachable, excluded],
    );

    const term = search.trim().toLowerCase();
    const filtered = useMemo(() => {
        if (!term) return withEmails;
        return withEmails.filter(({ lead }) =>
            [lead.nome || "", lead.telefone, ...Object.values(lead.emails)]
                .join(" ")
                .toLowerCase()
                .includes(term),
        );
    }, [withEmails, term]);

    const filteredReachableIds = useMemo(
        () => filtered.filter((r) => r.addresses.length > 0).map((r) => r.lead.leadId),
        [filtered],
    );

    const visible = filtered.slice(0, visibleCount);
    const semEmail = leads.length - reachable.length;
    const desmarcados = reachable.length - selectedIds.length;
    const selectedLabels = availableLabels.filter((l) => labelIds.includes(l.id));

    function toggleField(key: EmailFieldKey) {
        setFields((prev) =>
            prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
        );
    }

    function toggleLead(leadId: string) {
        setExcluded((prev) => {
            const next = new Set(prev);
            if (next.has(leadId)) next.delete(leadId);
            else next.add(leadId);
            return next;
        });
    }

    /** Age sobre o CONJUNTO FILTRADO inteiro, não só sobre o que está na tela. */
    function setAllFiltered(checked: boolean) {
        setExcluded((prev) => {
            const next = new Set(prev);
            for (const id of filteredReachableIds) {
                if (checked) next.delete(id);
                else next.add(id);
            }
            return next;
        });
    }

    const canSend =
        selectedIds.length > 0 && subject.trim().length > 0 && body.trim().length > 0;

    function handleSend() {
        setError("");
        startSending(async () => {
            const result = await sendEmailToLeads({
                leadIds: selectedIds,
                fields,
                subject,
                body,
            });

            if (!result.ok) {
                setError(result.error);
                setView("compose");
                return;
            }

            onToast({
                type: "success",
                text: result.processing
                    ? `${result.count} e-mails na fila de envio`
                    : `${result.count} ${result.count === 1 ? "e-mail enviado" : "e-mails enviados"}`,
            });
            onOpenChange(false);
        });
    }

    const countLabel = `${selectedIds.length} ${selectedIds.length === 1 ? "lead" : "leads"}`;

    // ---------------------------------------------------------------- CONFIRM
    if (view === "confirm") {
        return (
            <>
                <DialogHeader>
                    <DialogTitle>Enviar para {countLabel}?</DialogTitle>
                    <DialogDescription>
                        Confira antes de disparar — o envio não pode ser desfeito.
                    </DialogDescription>
                </DialogHeader>

                <dl className="space-y-3 overflow-y-auto">
                    <ConfirmRow label="Tags usadas como filtro">
                        {selectedLabels.map((l) => l.name).join(", ") || "—"}
                    </ConfirmRow>
                    {canal !== "todos" && (
                        <ConfirmRow label="Canal">
                            {canal === "festas" ? "Festas" : "Alegrando"}
                        </ConfirmRow>
                    )}
                    <ConfirmRow label="E-mails que serão usados">
                        {fields.map((f) => EMAIL_FIELD_LABELS[f]).join(", ") || "—"}
                    </ConfirmRow>
                    <ConfirmRow label="Fora do disparo">
                        {semEmail === 0 && desmarcados === 0
                            ? "ninguém — todos os leads das tags entram"
                            : [
                                  semEmail > 0 ? `${semEmail} sem e-mail cadastrado` : null,
                                  desmarcados > 0
                                      ? `${desmarcados} desmarcado${desmarcados === 1 ? "" : "s"}`
                                      : null,
                              ]
                                  .filter(Boolean)
                                  .join(" · ")}
                    </ConfirmRow>
                    <ConfirmRow label="Assunto">
                        <span className="text-foreground font-medium">{subject}</span>
                    </ConfirmRow>
                </dl>

                <div className="flex justify-end gap-2 pt-2 border-t border-border">
                    <button
                        type="button"
                        onClick={() => setView("compose")}
                        disabled={sending}
                        className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-40"
                    >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        Voltar
                    </button>
                    <button
                        type="button"
                        onClick={handleSend}
                        disabled={sending}
                        className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 transition-colors disabled:opacity-40"
                    >
                        {sending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Send className="w-4 h-4" />
                        )}
                        {sending ? "Enviando..." : `Enviar para ${countLabel}`}
                    </button>
                </div>
            </>
        );
    }

    // ---------------------------------------------------------------- COMPOSE
    return (
        <>
            <DialogHeader>
                <DialogTitle>Enviar e-mail</DialogTitle>
                <DialogDescription>
                    {selectedLabels.length > 0
                        ? `Leads de ${selectedLabels.map((l) => l.name).join(", ")}`
                        : "Leads filtrados"}
                    {canal !== "todos" && ` · canal ${canal === "festas" ? "Festas" : "Alegrando"}`}
                </DialogDescription>
            </DialogHeader>

            {state.loading ? (
                <div className="flex items-center gap-2 justify-center py-10 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Carregando leads...
                </div>
            ) : state.error ? (
                <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700 dark:text-red-300">{state.error}</p>
                </div>
            ) : leads.length === 0 ? (
                <p className="text-sm text-muted-foreground italic py-6 text-center">
                    Nenhum lead nessas tags.
                </p>
            ) : (
                <div className="flex flex-col gap-3 min-h-0 overflow-y-auto pr-1">
                    {/* Tipos de e-mail */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Usar
                        </span>
                        {EMAIL_FIELD_ORDER.map((key) => (
                            <label key={key} className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={fields.includes(key)}
                                    onChange={() => toggleField(key)}
                                    className="w-3.5 h-3.5 rounded accent-brand-500 cursor-pointer"
                                />
                                <span className="text-xs text-foreground">
                                    {EMAIL_FIELD_LABELS[key]}
                                </span>
                            </label>
                        ))}
                    </div>

                    {/* Contagem */}
                    <p className="text-xs text-muted-foreground">
                        <strong className="text-foreground">{leads.length}</strong>
                        {leads.length === 1 ? " lead" : " leads"} ·{" "}
                        <strong className="text-foreground">{reachable.length}</strong> com e-mail ·{" "}
                        <strong className="text-brand-500 dark:text-brand-400">
                            {selectedIds.length}
                        </strong>{" "}
                        {selectedIds.length === 1 ? "selecionado" : "selecionados"}
                    </p>

                    {/* Busca + marcar todos */}
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative flex-1 min-w-[180px]">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                            <input
                                value={search}
                                onChange={(e) => {
                                    setSearch(e.target.value);
                                    setVisibleCount(PAGE_SIZE);
                                }}
                                placeholder="Buscar nesta lista..."
                                className="w-full rounded-lg border border-border bg-background pl-8 pr-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand-500/40"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={() => setAllFiltered(true)}
                            disabled={filteredReachableIds.length === 0}
                            className="text-xs font-semibold text-brand-500 dark:text-brand-400 hover:underline disabled:opacity-40"
                        >
                            Marcar {term ? `os ${filteredReachableIds.length} da busca` : "todos"}
                        </button>
                        <span className="text-muted-foreground text-xs">·</span>
                        <button
                            type="button"
                            onClick={() => setAllFiltered(false)}
                            disabled={filteredReachableIds.length === 0}
                            className="text-xs font-semibold text-muted-foreground hover:text-foreground hover:underline disabled:opacity-40"
                        >
                            Desmarcar
                        </button>
                    </div>

                    {/* Lista */}
                    <div className="divide-y divide-border rounded-lg border border-border max-h-[240px] overflow-y-auto">
                        {visible.length === 0 ? (
                            <p className="text-xs text-muted-foreground italic p-3">
                                Nenhum lead encontrado.
                            </p>
                        ) : (
                            visible.map(({ lead, addresses }) => {
                                const unreachable = addresses.length === 0;
                                const checked = !unreachable && !excluded.has(lead.leadId);
                                return (
                                    <label
                                        key={lead.leadId}
                                        className={cn(
                                            "flex items-start gap-2.5 px-3 py-2 transition-colors",
                                            unreachable
                                                ? "bg-muted/40 cursor-not-allowed"
                                                : "cursor-pointer hover:bg-muted/50",
                                        )}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            disabled={unreachable}
                                            onChange={() => toggleLead(lead.leadId)}
                                            className="mt-0.5 w-3.5 h-3.5 rounded accent-brand-500 disabled:cursor-not-allowed"
                                        />
                                        <div className="min-w-0 flex-1">
                                            <p
                                                className={cn(
                                                    "text-xs font-medium truncate",
                                                    unreachable ? "text-muted-foreground" : "text-foreground",
                                                )}
                                            >
                                                {lead.nome || lead.telefone || "Sem nome"}
                                            </p>
                                            <p
                                                className={cn(
                                                    "text-[11px] break-all",
                                                    unreachable
                                                        ? "text-muted-foreground italic"
                                                        : "text-muted-foreground",
                                                )}
                                            >
                                                {unreachable ? "sem e-mail cadastrado" : addresses.join(", ")}
                                            </p>
                                        </div>
                                    </label>
                                );
                            })
                        )}
                    </div>

                    {visibleCount < filtered.length && (
                        <button
                            type="button"
                            onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
                            className="w-full rounded-lg border border-border py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                        >
                            Mostrar mais ({filtered.length - visibleCount} restantes)
                        </button>
                    )}

                    {/* Mensagem */}
                    <input
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        placeholder="Assunto"
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500/40"
                    />
                    <textarea
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        rows={6}
                        placeholder="Escreva a mensagem..."
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm leading-relaxed resize-y outline-none focus:ring-2 focus:ring-brand-500/40"
                    />

                    {error && (
                        <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-2.5">
                            <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                            <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
                        </div>
                    )}
                </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
                >
                    Cancelar
                </button>
                <button
                    type="button"
                    onClick={() => setView("confirm")}
                    disabled={!canSend}
                    className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 transition-colors disabled:opacity-40"
                >
                    <Send className="w-4 h-4" />
                    {selectedIds.length > 0 ? `Enviar para ${countLabel}` : "Enviar"}
                </button>
            </div>
        </>
    );
}

function ConfirmRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-0.5">
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {label}
            </dt>
            <dd className="text-sm text-muted-foreground break-words">{children}</dd>
        </div>
    );
}
