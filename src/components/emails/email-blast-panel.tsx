"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
    AlertCircle,
    CheckCircle2,
    Loader2,
    Mail,
    Search,
    Send,
    Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { listLabels } from "@/lib/actions/labels";
import { listLeadsByLabels, sendEmailToLeads } from "@/lib/actions/emails";
import {
    EMAIL_FIELD_LABELS,
    EMAIL_FIELD_ORDER,
    type EmailFieldKey,
    type LeadEmailRow,
} from "@/lib/types/email";
import { LABEL_COLOR_CLASSES, type Label } from "@/lib/types/labels";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

const PAGE_SIZE = 50;

/** Referências estáveis pra quando a seleção de tags mudou (evita re-render). */
const EMPTY_IDS: ReadonlySet<string> = new Set();
const EMPTY_ROWS: LeadEmailRow[] = [];

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

export function EmailBlastPanel() {
    const [labels, setLabels] = useState<Label[]>([]);
    const [loadingLabels, setLoadingLabels] = useState(true);
    const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);

    /**
     * Chave da seleção de tags. Tudo que depende da população de leads é
     * derivado dela — assim trocar de tag zera lista e seleção sem effect de
     * reset (o lint proíbe setState síncrono dentro de effect).
     */
    const labelKey = useMemo(
        () => [...selectedLabelIds].sort().join(","),
        [selectedLabelIds],
    );

    const [loaded, setLoaded] = useState<{
        key: string;
        rows: LeadEmailRow[];
        error: string;
    }>({ key: "", rows: [], error: "" });

    const [fields, setFields] = useState<EmailFieldKey[]>(["email"]);

    /** Exclusões explícitas. O padrão é enviar pra todos — ela desmarca exceções. */
    const [excluded, setExcluded] = useState<{ key: string; ids: Set<string> }>({
        key: "",
        ids: new Set(),
    });

    const [search, setSearch] = useState("");
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

    const [subject, setSubject] = useState("");
    const [body, setBody] = useState("");

    const [confirmOpen, setConfirmOpen] = useState(false);
    const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [sending, startSending] = useTransition();

    // Tags sempre do banco — tag nova aparece sem deploy.
    useEffect(() => {
        let cancelled = false;
        listLabels()
            .then((rows) => {
                if (cancelled) return;
                setLabels(rows);
                setLoadingLabels(false);
            })
            .catch(() => { if (!cancelled) setLoadingLabels(false); });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        if (!labelKey) return;
        let cancelled = false;
        listLeadsByLabels(labelKey.split(","))
            .then((rows) => {
                if (!cancelled) setLoaded({ key: labelKey, rows, error: "" });
            })
            .catch((err: unknown) => {
                if (cancelled) return;
                setLoaded({
                    key: labelKey,
                    rows: [],
                    error: err instanceof Error ? err.message : "Erro ao carregar leads.",
                });
            });
        return () => { cancelled = true; };
    }, [labelKey]);

    const upToDate = loaded.key === labelKey;
    const leads = useMemo(
        () => (upToDate ? loaded.rows : EMPTY_ROWS),
        [upToDate, loaded.rows],
    );
    const leadsError = upToDate ? loaded.error : "";
    const loadingLeads = labelKey !== "" && !upToDate;
    const deselected = excluded.key === labelKey ? excluded.ids : EMPTY_IDS;

    const withEmails = useMemo(
        () => leads.map((lead) => ({ lead, addresses: reachableEmails(lead, fields) })),
        [leads, fields],
    );

    const reachable = useMemo(
        () => withEmails.filter((r) => r.addresses.length > 0),
        [withEmails],
    );

    const selectedIds = useMemo(
        () => reachable.filter((r) => !deselected.has(r.lead.leadId)).map((r) => r.lead.leadId),
        [reachable, deselected],
    );

    // A busca é só uma lente sobre a lista — não altera a seleção por si só.
    const term = search.trim().toLowerCase();
    const filtered = useMemo(() => {
        if (!term) return withEmails;
        return withEmails.filter(({ lead }) => {
            const haystack = [
                lead.nome || "",
                lead.telefone,
                ...Object.values(lead.emails),
            ]
                .join(" ")
                .toLowerCase();
            return haystack.includes(term);
        });
    }, [withEmails, term]);

    const filteredReachableIds = useMemo(
        () => filtered.filter((r) => r.addresses.length > 0).map((r) => r.lead.leadId),
        [filtered],
    );

    const visible = filtered.slice(0, visibleCount);
    const semEmail = leads.length - reachable.length;
    const desmarcados = reachable.length - selectedIds.length;

    function toggleLabel(id: string) {
        setSelectedLabelIds((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
        );
        setSearch("");
        setVisibleCount(PAGE_SIZE);
    }

    function toggleField(key: EmailFieldKey) {
        setFields((prev) =>
            prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
        );
    }

    /** Exclusões sempre carimbadas com a seleção de tags atual. */
    function updateExcluded(mutate: (ids: Set<string>) => void) {
        setExcluded((prev) => {
            const next = new Set(prev.key === labelKey ? prev.ids : []);
            mutate(next);
            return { key: labelKey, ids: next };
        });
    }

    function toggleLead(leadId: string) {
        updateExcluded((ids) => {
            if (ids.has(leadId)) ids.delete(leadId);
            else ids.add(leadId);
        });
    }

    /** Marca/desmarca o CONJUNTO FILTRADO inteiro, não só o que está na tela. */
    function setAllFiltered(checked: boolean) {
        updateExcluded((ids) => {
            for (const id of filteredReachableIds) {
                if (checked) ids.delete(id);
                else ids.add(id);
            }
        });
    }

    const canSend =
        selectedIds.length > 0 && subject.trim().length > 0 && body.trim().length > 0;

    function handleConfirmSend() {
        startSending(async () => {
            const result = await sendEmailToLeads({
                leadIds: selectedIds,
                fields,
                subject,
                body,
            });

            setConfirmOpen(false);

            if (!result.ok) {
                setFeedback({ type: "error", text: result.error });
                return;
            }

            setFeedback({
                type: "success",
                text: result.processing
                    ? `${result.count} ${result.count === 1 ? "e-mail entrou" : "e-mails entraram"} na fila de envio. O status de cada um aparece no painel do lead.`
                    : `${result.count} ${result.count === 1 ? "e-mail enviado" : "e-mails enviados"} com sucesso.`,
            });
            setSubject("");
            setBody("");
        });
    }

    const selectedLabels = labels.filter((l) => selectedLabelIds.includes(l.id));

    return (
        <div className="space-y-6 max-w-5xl">
            <div className="bento-enter">
                <h1 className="text-2xl font-bold tracking-tight text-[#191918] dark:text-white">
                    E-mails
                </h1>
                <p className="text-muted-foreground mt-1">
                    Filtre os leads por tag, escolha quem recebe e dispare o e-mail.
                </p>
            </div>

            {feedback && (
                <div
                    className={cn(
                        "flex items-start gap-2 rounded-xl border p-4 bento-enter",
                        feedback.type === "success"
                            ? "border-emerald-500/40 bg-emerald-500/10"
                            : "border-red-500/40 bg-red-500/10",
                    )}
                >
                    {feedback.type === "success" ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    ) : (
                        <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    )}
                    <p
                        className={cn(
                            "text-sm font-medium",
                            feedback.type === "success"
                                ? "text-emerald-700 dark:text-emerald-300"
                                : "text-red-700 dark:text-red-300",
                        )}
                    >
                        {feedback.text}
                    </p>
                    <button
                        type="button"
                        onClick={() => setFeedback(null)}
                        className="ml-auto text-xs text-muted-foreground hover:text-foreground shrink-0"
                    >
                        Fechar
                    </button>
                </div>
            )}

            {/* 1. Tags */}
            <section className="rounded-xl border bg-card p-6 space-y-3 bento-enter [animation-delay:100ms]">
                <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-brand-400" />
                    <h2 className="text-sm font-semibold text-[#191918] dark:text-white">
                        1. Filtrar por tag
                    </h2>
                </div>
                <p className="text-xs text-muted-foreground">
                    A tag serve pra filtrar a lista — quem recebe você escolhe contato
                    por contato abaixo. Marcar mais de uma tag junta os leads das duas.
                </p>

                {loadingLabels ? (
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                ) : labels.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">
                        Nenhuma tag criada ainda. Crie tags no painel do cliente, em Conversas.
                    </p>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {labels.map((label) => {
                            const active = selectedLabelIds.includes(label.id);
                            const colors = LABEL_COLOR_CLASSES[label.color];
                            return (
                                <button
                                    key={label.id}
                                    type="button"
                                    onClick={() => toggleLabel(label.id)}
                                    className={cn(
                                        "flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all",
                                        active
                                            ? cn(colors.bg, colors.text, colors.border, "ring-2 ring-brand-500/30")
                                            : "border-border text-muted-foreground hover:border-brand-500/50 hover:text-foreground",
                                    )}
                                >
                                    <span className={cn("w-2 h-2 rounded-full", colors.dotBg)} />
                                    {label.name}
                                </button>
                            );
                        })}
                    </div>
                )}
            </section>

            {/* 2. Tipos de e-mail */}
            <section className="rounded-xl border bg-card p-6 space-y-3 bento-enter [animation-delay:150ms]">
                <h2 className="text-sm font-semibold text-[#191918] dark:text-white">
                    2. Quais e-mails usar
                </h2>
                <p className="text-xs text-muted-foreground">
                    Vale pra todos os leads selecionados. Marcar mais tipos alcança mais gente.
                </p>
                <div className="flex flex-wrap gap-4">
                    {EMAIL_FIELD_ORDER.map((key) => (
                        <label key={key} className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={fields.includes(key)}
                                onChange={() => toggleField(key)}
                                className="w-4 h-4 rounded accent-brand-500 cursor-pointer"
                            />
                            <span className="text-sm text-[#191918] dark:text-white">
                                {EMAIL_FIELD_LABELS[key]}
                            </span>
                        </label>
                    ))}
                </div>
            </section>

            {/* 3. Contatos */}
            <section className="rounded-xl border bg-card p-6 space-y-4 bento-enter [animation-delay:200ms]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-sm font-semibold text-[#191918] dark:text-white">
                        3. Quem recebe
                    </h2>
                    {leads.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                            <strong className="text-foreground">{leads.length}</strong>
                            {leads.length === 1 ? " lead na tag" : " leads nas tags"} ·{" "}
                            <strong className="text-foreground">{reachable.length}</strong> com e-mail ·{" "}
                            <strong className="text-brand-500 dark:text-brand-400">
                                {selectedIds.length}
                            </strong>{" "}
                            {selectedIds.length === 1 ? "selecionado" : "selecionados"}
                        </span>
                    )}
                </div>

                {selectedLabelIds.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">
                        Escolha ao menos uma tag para ver os contatos.
                    </p>
                ) : loadingLeads ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Carregando leads...
                    </div>
                ) : leadsError ? (
                    <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3">
                        <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                        <p className="text-sm text-red-700 dark:text-red-300">{leadsError}</p>
                    </div>
                ) : leads.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">
                        Nenhum lead com essas tags.
                    </p>
                ) : (
                    <>
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="relative flex-1 min-w-[200px]">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                                <input
                                    value={search}
                                    onChange={(e) => {
                                        setSearch(e.target.value);
                                        setVisibleCount(PAGE_SIZE);
                                    }}
                                    placeholder="Buscar por nome, telefone ou e-mail..."
                                    className="w-full rounded-lg border border-border bg-background pl-8 pr-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-500/40"
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setAllFiltered(true)}
                                    disabled={filteredReachableIds.length === 0}
                                    className="text-xs font-semibold text-brand-500 dark:text-brand-400 hover:underline disabled:opacity-40 disabled:no-underline"
                                >
                                    Marcar todos ({filteredReachableIds.length})
                                </button>
                                <span className="text-muted-foreground">·</span>
                                <button
                                    type="button"
                                    onClick={() => setAllFiltered(false)}
                                    disabled={filteredReachableIds.length === 0}
                                    className="text-xs font-semibold text-muted-foreground hover:text-foreground hover:underline disabled:opacity-40 disabled:no-underline"
                                >
                                    Desmarcar todos
                                </button>
                            </div>
                        </div>
                        {term && (
                            <p className="text-[11px] text-muted-foreground -mt-2">
                                Marcar/desmarcar age sobre os {filteredReachableIds.length} resultados
                                da busca, não só sobre os visíveis.
                            </p>
                        )}

                        <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                            {visible.length === 0 ? (
                                <p className="text-sm text-muted-foreground italic p-4">
                                    Nenhum lead encontrado para &quot;{search}&quot;.
                                </p>
                            ) : (
                                visible.map(({ lead, addresses }) => {
                                    const unreachable = addresses.length === 0;
                                    const checked = !unreachable && !deselected.has(lead.leadId);
                                    return (
                                        <label
                                            key={lead.leadId}
                                            className={cn(
                                                "flex items-start gap-3 p-3 transition-colors",
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
                                                className="mt-0.5 w-4 h-4 rounded accent-brand-500 disabled:cursor-not-allowed"
                                            />
                                            <div className="min-w-0 flex-1">
                                                <p
                                                    className={cn(
                                                        "text-sm font-medium truncate",
                                                        unreachable
                                                            ? "text-muted-foreground"
                                                            : "text-[#191918] dark:text-white",
                                                    )}
                                                >
                                                    {lead.nome || lead.telefone || "Sem nome"}
                                                </p>
                                                {unreachable ? (
                                                    <p className="text-xs text-muted-foreground italic">
                                                        sem e-mail cadastrado
                                                    </p>
                                                ) : (
                                                    <p className="text-xs text-muted-foreground break-all">
                                                        {addresses.join(", ")}
                                                    </p>
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
                                className="w-full rounded-lg border border-border py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-brand-500/50 transition-colors"
                            >
                                Mostrar mais ({filtered.length - visibleCount} restantes)
                            </button>
                        )}
                    </>
                )}
            </section>

            {/* 4. Mensagem */}
            <section className="rounded-xl border bg-card p-6 space-y-3 bento-enter [animation-delay:250ms]">
                <h2 className="text-sm font-semibold text-[#191918] dark:text-white">
                    4. Mensagem
                </h2>
                <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Assunto"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500/40"
                />
                <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={10}
                    placeholder="Escreva a mensagem..."
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm leading-relaxed resize-y outline-none focus:ring-2 focus:ring-brand-500/40"
                />
                <p className="text-[11px] text-muted-foreground">
                    Texto simples — as quebras de linha são mantidas no e-mail.
                </p>
            </section>

            {/* 5. Enviar */}
            <div className="flex items-center gap-4 bento-enter [animation-delay:300ms]">
                <button
                    type="button"
                    onClick={() => setConfirmOpen(true)}
                    disabled={!canSend || sending}
                    className="flex items-center gap-2 rounded-lg bg-brand-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 transition-colors disabled:opacity-40 disabled:hover:bg-brand-500"
                >
                    <Mail className="w-4 h-4" />
                    {selectedIds.length > 0
                        ? `Enviar para ${selectedIds.length} ${selectedIds.length === 1 ? "lead" : "leads"}`
                        : "Enviar"}
                </button>
                {!canSend && selectedLabelIds.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                        {selectedIds.length === 0
                            ? "Selecione ao menos um contato."
                            : "Preencha assunto e mensagem."}
                    </span>
                )}
            </div>

            <Dialog open={confirmOpen} onOpenChange={(open) => { if (!sending) setConfirmOpen(open); }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>
                            Enviar para {selectedIds.length}{" "}
                            {selectedIds.length === 1 ? "lead" : "leads"}?
                        </DialogTitle>
                        <DialogDescription>
                            Confira antes de disparar — o envio não pode ser desfeito.
                        </DialogDescription>
                    </DialogHeader>

                    <dl className="space-y-2.5 text-sm">
                        <ConfirmRow label="Tags usadas como filtro">
                            {selectedLabels.length > 0
                                ? selectedLabels.map((l) => l.name).join(", ")
                                : "—"}
                        </ConfirmRow>
                        <ConfirmRow label="E-mails que serão usados">
                            {fields.map((f) => EMAIL_FIELD_LABELS[f]).join(", ") || "—"}
                        </ConfirmRow>
                        <ConfirmRow label="Fora do disparo">
                            {semEmail === 0 && desmarcados === 0 ? (
                                "ninguém — todos os leads da tag entram"
                            ) : (
                                [
                                    semEmail > 0 ? `${semEmail} sem e-mail cadastrado` : null,
                                    desmarcados > 0 ? `${desmarcados} desmarcado${desmarcados === 1 ? "" : "s"}` : null,
                                ]
                                    .filter(Boolean)
                                    .join(" · ")
                            )}
                        </ConfirmRow>
                        <ConfirmRow label="Assunto">
                            <span className="text-foreground font-medium">{subject}</span>
                        </ConfirmRow>
                    </dl>

                    <DialogFooter>
                        <button
                            type="button"
                            onClick={() => setConfirmOpen(false)}
                            disabled={sending}
                            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-40"
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={handleConfirmSend}
                            disabled={sending}
                            className="flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 transition-colors disabled:opacity-40"
                        >
                            {sending ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Send className="w-4 h-4" />
                            )}
                            {sending
                                ? "Enviando..."
                                : `Enviar para ${selectedIds.length} ${selectedIds.length === 1 ? "lead" : "leads"}`}
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
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
