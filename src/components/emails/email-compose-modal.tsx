"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
    AlertCircle,
    ArrowLeft,
    CalendarClock,
    ChevronDown,
    Loader2,
    Search,
    Send,
    X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { EmailChips } from "./email-chips";
import { isGooglePickerOpen } from "./drive-picker-button";
import { ignorarSeForPortalDeEmail } from "./portal-guards";
import { listLeadsByLabels, sendEmailToLead, sendEmailToLeads } from "@/lib/actions/emails";
import {
    EMAIL_FIELD_LABELS,
    EMAIL_FIELD_ORDER,
    EMAIL_FIELD_PRIORITY,
    type EmailFieldKey,
    type LeadEmailRow,
} from "@/lib/types/email";
import { EmailBodyEditor } from "./email-body-editor";
import { useEmailAttachments } from "./use-email-attachments";
import { Checkbox } from "@/components/ui/checkbox";
import { isEditorEmpty } from "@/lib/email/editor";
import { isValidEmail } from "@/lib/email/format";
import type { Label } from "@/lib/types/labels";

const PAGE_SIZE = 50;

/** Um lead só, aberto pelo painel de detalhes. */
export type ComposeLeadTarget = {
    mode: "lead";
    telefone: string;
    canal: string;
    nome: string | null;
    emails: Partial<Record<EmailFieldKey, string | null>>;
};

/** Vários leads, filtrados pelas tags ativas na lista de Conversas. */
export type ComposeTagsTarget = {
    mode: "tags";
    labelIds: string[];
    availableLabels: Label[];
    canal: "todos" | "alegrando" | "festas";
};

/**
 * Este modal serve pra INICIAR um e-mail — pra um lead ou por tag. Responder
 * dentro de uma conversa em andamento acontece inline, no item da conversa:
 * ali o destinatário e o assunto já estão decididos, e abrir a composição
 * inteira só afastaria a resposta do que se está lendo.
 */
export type ComposeTarget = ComposeLeadTarget | ComposeTagsTarget;

export interface EmailComposeModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    target: ComposeTarget;
    onToast: (toast: { type: "success" | "error"; text: string }) => void;
    /** Chamado depois de um envio bem-sucedido (pra recarregar histórico). */
    onSent?: () => void;
}

export function EmailComposeModal(props: EmailComposeModalProps) {
    return (
        <Dialog open={props.open} onOpenChange={props.onOpenChange}>
            <DialogContent
                className="sm:max-w-2xl max-h-[92vh] flex flex-col gap-3 overflow-hidden"
                onPointerDownOutside={ignorarSeForPortalDeEmail}
                onInteractOutside={ignorarSeForPortalDeEmail}
                onFocusOutside={ignorarSeForPortalDeEmail}
                onEscapeKeyDown={(e) => {
                    // Esc com o Picker aberto é pra fechar o Picker, não a
                    // composição inteira.
                    if (isGooglePickerOpen()) e.preventDefault();
                }}
            >
                {/* Desmonta ao fechar: cada composição começa do zero. */}
                <ComposeForm {...props} />
            </DialogContent>
        </Dialog>
    );
}

function humanSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function reachableEmails(lead: LeadEmailRow, fields: EmailFieldKey[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const key of EMAIL_FIELD_ORDER) {
        if (!fields.includes(key)) continue;
        const address = lead.emails[key];
        if (!address) continue;
        if (seen.has(address.toLowerCase())) continue;
        seen.add(address.toLowerCase());
        out.push(address);
    }
    return out;
}

function ComposeForm({ target, onOpenChange, onToast, onSent }: EmailComposeModalProps) {
    const [subject, setSubject] = useState("");
    const [body, setBody] = useState("");

    const [scheduleOpen, setScheduleOpen] = useState(false);
    const [scheduleDate, setScheduleDate] = useState("");
    const [scheduleTime, setScheduleTime] = useState("09:00");

    const [view, setView] = useState<"compose" | "confirm">("compose");
    const [error, setError] = useState("");
    const [sending, startSending] = useTransition();

    const anexos = useEmailAttachments(setError);
    const { attachments, uploading } = anexos;

    // ---------------------------------------------------------- destinatários
    const leadAvailable = useMemo(() => {
        if (target.mode !== "lead") return [];
        return EMAIL_FIELD_ORDER.flatMap((key) => {
            const value = (target.emails[key] || "").trim();
            return value && isValidEmail(value) ? [{ key, address: value }] : [];
        });
    }, [target]);

    const [touchedFields, setTouchedFields] = useState<EmailFieldKey[] | null>(null);
    const defaultLeadField = EMAIL_FIELD_PRIORITY.find((key) =>
        leadAvailable.some((a) => a.key === key),
    );
    const [tagFields, setTagFields] = useState<EmailFieldKey[]>(["email"]);

    const fields = useMemo(
        () =>
            target.mode === "lead"
                ? touchedFields ?? (defaultLeadField ? [defaultLeadField] : [])
                : tagFields,
        [target.mode, touchedFields, defaultLeadField, tagFields],
    );

    function toggleField(key: EmailFieldKey) {
        if (target.mode === "lead") {
            setTouchedFields(
                fields.includes(key) ? fields.filter((k) => k !== key) : [...fields, key],
            );
        } else {
            setTagFields((prev) =>
                prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
            );
        }
    }

    // ------------------------------------------------------- lista (modo tags)
    type LoadState = { loading: true } | { loading: false; rows: LeadEmailRow[]; error: string };
    const [state, setState] = useState<LoadState>(
        target.mode === "tags" ? { loading: true } : { loading: false, rows: [], error: "" },
    );
    const [excluded, setExcluded] = useState<Set<string>>(new Set());
    const [search, setSearch] = useState("");
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

    const labelKey = target.mode === "tags" ? target.labelIds.join(",") : "";
    useEffect(() => {
        if (!labelKey) return;
        let cancelled = false;
        listLeadsByLabels(labelKey.split(","))
            .then((rows) => { if (!cancelled) setState({ loading: false, rows, error: "" }); })
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

    const leads = useMemo(() => {
        if (target.mode !== "tags" || state.loading) return [];
        return target.canal === "todos"
            ? state.rows
            : state.rows.filter((r) => r.canal === target.canal);
    }, [state, target]);

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

    const semEmail = leads.length - reachable.length;
    const desmarcados = reachable.length - selectedIds.length;

    function toggleLead(leadId: string) {
        setExcluded((prev) => {
            const next = new Set(prev);
            if (next.has(leadId)) next.delete(leadId);
            else next.add(leadId);
            return next;
        });
    }

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

    // ------------------------------------------------------------------ envio
    const scheduledFor = useMemo(() => {
        if (!scheduleOpen || !scheduleDate) return null;
        const iso = new Date(`${scheduleDate}T${scheduleTime || "09:00"}:00`);
        return Number.isNaN(iso.getTime()) ? null : iso.toISOString();
    }, [scheduleOpen, scheduleDate, scheduleTime]);

    const recipientCount = target.mode === "lead" ? (fields.length > 0 ? 1 : 0) : selectedIds.length;
    const canSend =
        recipientCount > 0 &&
        subject.trim().length > 0 &&
        !isEditorEmpty(body) &&
        !uploading &&
        (!scheduleOpen || Boolean(scheduledFor));

    function doSend() {
        setError("");
        startSending(async () => {
            const result =
                target.mode === "lead"
                    ? await sendEmailToLead({
                          telefone: target.telefone,
                          canal: target.canal,
                          fields,
                          subject,
                          body,
                          attachments,
                          scheduledFor,
                      })
                    : await sendEmailToLeads({
                          leadIds: selectedIds,
                          fields,
                          subject,
                          body,
                          attachments,
                          scheduledFor,
                      });

            if (!result.ok) {
                setError(result.error);
                setView("compose");
                return;
            }

            const when = result.scheduled
                ? `programado para ${new Date(scheduledFor!).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
                : result.processing
                  ? "na fila de envio"
                  : "enviado";

            onToast({
                type: "success",
                text:
                    result.count === 1
                        ? `E-mail ${when}`
                        : `${result.count} e-mails — ${when}`,
            });
            onSent?.();
            onOpenChange(false);
        });
    }

    /** Individual vai direto; disparo em massa passa pela confirmação. */
    function handlePrimary() {
        if (target.mode === "lead") doSend();
        else setView("confirm");
    }

    const sendLabel = scheduleOpen
        ? "Programar envio"
        : target.mode === "lead"
          ? "Enviar"
          : `Enviar para ${recipientCount} ${recipientCount === 1 ? "lead" : "leads"}`;

    // ---------------------------------------------------------------- CONFIRM
    if (view === "confirm" && target.mode === "tags") {
        const selectedLabels = target.availableLabels.filter((l) =>
            target.labelIds.includes(l.id),
        );
        return (
            <>
                <DialogHeader>
                    <DialogTitle>
                        {scheduleOpen ? "Programar" : "Enviar"} para {recipientCount}{" "}
                        {recipientCount === 1 ? "lead" : "leads"}?
                    </DialogTitle>
                    <DialogDescription>
                        Confira antes de disparar — o envio não pode ser desfeito.
                    </DialogDescription>
                </DialogHeader>

                <dl className="space-y-3 overflow-y-auto">
                    <ConfirmRow label="Tags usadas como filtro">
                        {selectedLabels.map((l) => l.name).join(", ") || "—"}
                    </ConfirmRow>
                    {target.canal !== "todos" && (
                        <ConfirmRow label="Canal">
                            {target.canal === "festas" ? "Festas" : "Alegrando"}
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
                    {attachments.length > 0 && (
                        <ConfirmRow label="Anexos">
                            {attachments.map((a) => a.filename).join(", ")} (
                            {humanSize(attachments.reduce((soma, a) => soma + a.size, 0))})
                        </ConfirmRow>
                    )}
                    {scheduledFor && (
                        <ConfirmRow label="Sai em">
                            <span className="text-foreground font-medium">
                                {new Date(scheduledFor).toLocaleString("pt-BR")}
                            </span>
                        </ConfirmRow>
                    )}
                </dl>

                {error && <ErrorBox message={error} />}

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
                        onClick={doSend}
                        disabled={sending}
                        className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 transition-colors disabled:opacity-40"
                    >
                        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        {sending ? "Enviando..." : sendLabel}
                    </button>
                </div>
            </>
        );
    }

    // ---------------------------------------------------------------- COMPOSE
    return (
        <>
            <DialogHeader>
                <DialogTitle>{scheduleOpen ? "Programar e-mail" : "Enviar e-mail"}</DialogTitle>
                <DialogDescription>
                    {target.mode === "lead"
                        ? target.nome || target.telefone
                        : (() => {
                              const names = target.availableLabels
                                  .filter((l) => target.labelIds.includes(l.id))
                                  .map((l) => l.name)
                                  .join(", ");
                              const canalSuffix =
                                  target.canal !== "todos"
                                      ? ` · canal ${target.canal === "festas" ? "Festas" : "Alegrando"}`
                                      : "";
                              return `${names || "Leads filtrados"}${canalSuffix}`;
                          })()}
                </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-3 min-h-0 overflow-y-auto pr-1">
                {/* ---- destinatários ---- */}
                {target.mode === "lead" ? (
                    leadAvailable.length === 0 ? (
                        <p className="text-sm text-muted-foreground italic">
                            Este lead não tem e-mail cadastrado.
                        </p>
                    ) : (
                        <div className="space-y-1.5">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Para
                            </span>
                            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                                {leadAvailable.map(({ key, address }) => (
                                    <label
                                        key={key}
                                        className="flex items-center gap-2 cursor-pointer"
                                    >
                                        <Checkbox
                                            checked={fields.includes(key)}
                                            onChange={() => toggleField(key)}
                                        />
                                        <span className="text-xs">
                                            <span className="font-semibold text-foreground">
                                                {EMAIL_FIELD_LABELS[key]}
                                            </span>
                                            <span className="text-muted-foreground"> — {address}</span>
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )
                ) : (
                    <TagRecipients
                        state={state}
                        leads={leads}
                        filtered={filtered}
                        visibleCount={visibleCount}
                        setVisibleCount={setVisibleCount}
                        reachableCount={reachable.length}
                        selectedCount={selectedIds.length}
                        excluded={excluded}
                        toggleLead={toggleLead}
                        setAllFiltered={setAllFiltered}
                        filteredReachableIds={filteredReachableIds}
                        search={search}
                        setSearch={setSearch}
                        fields={fields}
                        toggleField={toggleField}
                    />
                )}

                {/* ---- assunto ---- */}
                <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Assunto"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500/40"
                />

                {/* ---- corpo ---- */}
                <EmailBodyEditor
                    anexos={anexos}
                    onChange={setBody}
                    onError={setError}
                    placeholder="Escreva a mensagem..."
                />

                {/* ---- agendamento ---- */}
                {scheduleOpen && (
                    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-brand-500/40 bg-brand-500/5 p-2.5">
                        <CalendarClock className="w-4 h-4 text-brand-500 dark:text-brand-400" />
                        <span className="text-xs font-medium">Sai em</span>
                        <DatePicker
                            value={scheduleDate}
                            onChange={setScheduleDate}
                            placeholder="Escolher data"
                            minDate={new Date()}
                            className="w-[160px]"
                        />
                        <TimePicker value={scheduleTime} onChange={setScheduleTime} className="w-[110px]" />
                        <button
                            type="button"
                            onClick={() => { setScheduleOpen(false); setScheduleDate(""); }}
                            className="ml-auto text-xs font-semibold text-muted-foreground hover:text-foreground"
                        >
                            Cancelar agendamento
                        </button>
                    </div>
                )}

            </div>

            {/* Erro FORA da área rolável: dentro dela, uma falha de upload
                ficava abaixo da dobra e o arquivo simplesmente "sumia" sem
                explicação nenhuma. */}
            {error && <ErrorBox message={error} onDismiss={() => setError("")} />}

            {/* ---- rodapé ---- */}
            <div className="flex items-center gap-2 pt-3 border-t border-border">
                <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
                >
                    Cancelar
                </button>
                <div className="ml-auto flex items-stretch">
                    <button
                        type="button"
                        onClick={handlePrimary}
                        disabled={!canSend || sending}
                        className="flex items-center gap-2 rounded-l-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 transition-colors disabled:opacity-40"
                    >
                        {sending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : scheduleOpen ? (
                            <CalendarClock className="w-4 h-4" />
                        ) : (
                            <Send className="w-4 h-4" />
                        )}
                        {sending ? "Enviando..." : sendLabel}
                    </button>
                    <ScheduleMenu
                        scheduling={scheduleOpen}
                        onPickNow={() => { setScheduleOpen(false); setScheduleDate(""); }}
                        onPickSchedule={() => setScheduleOpen(true)}
                    />
                </div>
            </div>

        </>
    );
}

function ScheduleMenu({
    scheduling,
    onPickNow,
    onPickSchedule,
}: {
    scheduling: boolean;
    onPickNow: () => void;
    onPickSchedule: () => void;
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        function onDoc(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        }
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, [open]);

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                title="Mais opções de envio"
                aria-label="Mais opções de envio"
                className="h-full rounded-r-lg border-l border-white/25 bg-brand-500 px-2 text-white hover:bg-brand-600 transition-colors"
            >
                <ChevronDown className="w-4 h-4" />
            </button>
            {open && (
                <div className="absolute bottom-full right-0 z-50 mb-1 w-52 rounded-lg border border-border bg-popover py-1 shadow-lg">
                    <button
                        type="button"
                        onClick={() => { onPickNow(); setOpen(false); }}
                        className={cn(
                            "w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors",
                            !scheduling && "font-semibold",
                        )}
                    >
                        Enviar agora
                    </button>
                    <button
                        type="button"
                        onClick={() => { onPickSchedule(); setOpen(false); }}
                        className={cn(
                            "w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors",
                            scheduling && "font-semibold",
                        )}
                    >
                        Programar envio
                    </button>
                </div>
            )}
        </div>
    );
}

function TagRecipients({
    state,
    leads,
    filtered,
    visibleCount,
    setVisibleCount,
    reachableCount,
    selectedCount,
    excluded,
    toggleLead,
    setAllFiltered,
    filteredReachableIds,
    search,
    setSearch,
    fields,
    toggleField,
}: {
    state: { loading: true } | { loading: false; rows: LeadEmailRow[]; error: string };
    leads: LeadEmailRow[];
    filtered: { lead: LeadEmailRow; addresses: string[] }[];
    visibleCount: number;
    setVisibleCount: (fn: (v: number) => number) => void;
    reachableCount: number;
    selectedCount: number;
    excluded: Set<string>;
    toggleLead: (id: string) => void;
    setAllFiltered: (checked: boolean) => void;
    filteredReachableIds: string[];
    search: string;
    setSearch: (v: string) => void;
    fields: EmailFieldKey[];
    toggleField: (key: EmailFieldKey) => void;
}) {
    const term = search.trim();
    const visible = filtered.slice(0, visibleCount);

    if (state.loading) {
        return (
            <div className="flex items-center gap-2 justify-center py-8 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Carregando leads...
            </div>
        );
    }
    if (state.error) return <ErrorBox message={state.error} />;
    if (leads.length === 0) {
        return (
            <p className="text-sm text-muted-foreground italic py-4 text-center">
                Nenhum lead nessas tags.
            </p>
        );
    }

    return (
        <div className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Usar
                </span>
                {EMAIL_FIELD_ORDER.map((key) => (
                    <label key={key} className="flex items-center gap-1.5 cursor-pointer">
                        <Checkbox
                            checked={fields.includes(key)}
                            onChange={() => toggleField(key)}
                        />
                        <span className="text-xs text-foreground">{EMAIL_FIELD_LABELS[key]}</span>
                    </label>
                ))}
            </div>

            <p className="text-xs text-muted-foreground">
                <strong className="text-foreground">{leads.length}</strong>
                {leads.length === 1 ? " lead" : " leads"} ·{" "}
                <strong className="text-foreground">{reachableCount}</strong> com e-mail ·{" "}
                <strong className="text-brand-500 dark:text-brand-400">{selectedCount}</strong>{" "}
                {selectedCount === 1 ? "selecionado" : "selecionados"}
            </p>

            <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[180px]">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setVisibleCount(() => PAGE_SIZE); }}
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

            <div className="divide-y divide-border rounded-lg border border-border max-h-[220px] overflow-y-auto">
                {visible.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic p-3">
                        Nenhum lead encontrado.
                    </p>
                ) : (
                    visible.map(({ lead, addresses }) => {
                        const unreachable = addresses.length === 0;
                        const checked = !unreachable && !excluded.has(lead.leadId);
                        const entries = EMAIL_FIELD_ORDER.filter(
                            (k) => fields.includes(k) && lead.emails[k],
                        ).map((k) => ({ key: k, address: lead.emails[k]! }));

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
                                <Checkbox
                                    className="mt-0.5"
                                    checked={checked}
                                    disabled={unreachable}
                                    onChange={() => toggleLead(lead.leadId)}
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
                                    {unreachable ? (
                                        <p className="text-[11px] text-muted-foreground italic">
                                            sem e-mail cadastrado
                                        </p>
                                    ) : (
                                        <EmailChips
                                            entries={entries}
                                            telefone={lead.telefone}
                                            canal={lead.canal}
                                        />
                                    )}
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
        </div>
    );
}

function ErrorBox({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
    return (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-2.5">
            <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
            <p className="flex-1 text-xs text-red-700 dark:text-red-300">{message}</p>
            {onDismiss && (
                <button
                    type="button"
                    onClick={onDismiss}
                    aria-label="Fechar aviso"
                    className="shrink-0 text-red-500/70 hover:text-red-500 transition-colors"
                >
                    <X className="w-3.5 h-3.5" />
                </button>
            )}
        </div>
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
