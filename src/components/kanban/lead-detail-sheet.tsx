"use client";

import { useState, useEffect, useRef, useTransition, useCallback } from "react";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    getLeadById,
    getLeadMessages,
    updateLead,
    toggleIaAtiva,
    sendMessage,
    getTransportadores,
    getKanbanColumnsForSelect,
} from "@/lib/actions/leads";
import type { LeadDetail, LeadMessage, TransportadorOption } from "@/lib/actions/leads";
import {
    Save,
    Loader2,
    Bot,
    UserRound,
    Send,
    CheckCircle2,
    AlertCircle,
    School,
    Thermometer,
    CalendarDays,
    MapPin,
    Users,
    Package,
    Truck,
    Columns3,
    MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface LeadDetailSheetProps {
    leadId: string | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSaved?: () => void;
}

const tempOptions = [
    { value: "frio", label: "🧊 Frio", color: "bg-blue-100 text-blue-700" },
    { value: "morno", label: "🔥 Morno", color: "bg-amber-100 text-amber-700" },
    { value: "quente", label: "🌋 Quente", color: "bg-red-100 text-red-700" },
];

export function LeadDetailSheet({
    leadId,
    open,
    onOpenChange,
    onSaved,
}: LeadDetailSheetProps) {
    const [lead, setLead] = useState<LeadDetail | null>(null);
    const [msgs, setMsgs] = useState<LeadMessage[]>([]);
    const [transportadoresOpts, setTransportadoresOpts] = useState<TransportadorOption[]>([]);
    const [kanbanColumnsOpts, setKanbanColumnsOpts] = useState<{ id: string; name: string }[]>([]);
    const [loadingLead, setLoadingLead] = useState(false);
    const [isPending, startTransition] = useTransition();
    const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);

    // Form state
    const [form, setForm] = useState({
        nomeEscola: "",
        telefone: "",
        email: "",
        temperatura: "frio",
        dataEvento: "",
        destino: "",
        quantidadeAlunos: "",
        pacoteEscolhido: "",
        transportadoraId: "",
        kanbanColumnId: "",
        observacoes: "",
    });

    // Chat
    const [chatMessage, setChatMessage] = useState("");
    const chatEndRef = useRef<HTMLDivElement>(null);

    // Auto-hide toast
    useEffect(() => {
        if (toast) {
            const t = setTimeout(() => setToast(null), 3000);
            return () => clearTimeout(t);
        }
    }, [toast]);

    // Load lead data when opened
    const loadLead = useCallback(async () => {
        if (!leadId) return;
        setLoadingLead(true);
        try {
            const [leadData, messagesData, transOpts, colOpts] = await Promise.all([
                getLeadById(leadId),
                getLeadMessages(leadId),
                getTransportadores(),
                getKanbanColumnsForSelect(),
            ]);

            if (leadData) {
                setLead(leadData);
                setForm({
                    nomeEscola: leadData.nomeEscola,
                    telefone: leadData.telefone || "",
                    email: leadData.email || "",
                    temperatura: leadData.temperatura,
                    dataEvento: leadData.dataEvento || "",
                    destino: leadData.destino || "",
                    quantidadeAlunos: leadData.quantidadeAlunos?.toString() || "",
                    pacoteEscolhido: leadData.pacoteEscolhido || "",
                    transportadoraId: leadData.transportadoraId || "",
                    kanbanColumnId: leadData.kanbanColumnId,
                    observacoes: leadData.observacoes || "",
                });
            }

            setMsgs(messagesData);
            setTransportadoresOpts(transOpts);
            setKanbanColumnsOpts(colOpts);
        } catch (err) {
            setToast({ type: "error", text: `Erro ao carregar lead: ${err}` });
        } finally {
            setLoadingLead(false);
        }
    }, [leadId]);

    useEffect(() => {
        if (open && leadId) loadLead();
    }, [open, leadId, loadLead]);

    // Scroll to bottom on new messages
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [msgs]);

    // Handlers
    function handleSave() {
        if (!leadId) return;
        startTransition(async () => {
            try {
                await updateLead(leadId, {
                    nomeEscola: form.nomeEscola,
                    telefone: form.telefone || null,
                    email: form.email || null,
                    temperatura: form.temperatura,
                    dataEvento: form.dataEvento || null,
                    destino: form.destino || null,
                    quantidadeAlunos: form.quantidadeAlunos
                        ? parseInt(form.quantidadeAlunos)
                        : null,
                    pacoteEscolhido: form.pacoteEscolhido || null,
                    transportadoraId: form.transportadoraId || null,
                    kanbanColumnId: form.kanbanColumnId,
                    observacoes: form.observacoes || null,
                });
                setToast({ type: "success", text: "Lead atualizado!" });
                onSaved?.();
            } catch (err) {
                setToast({ type: "error", text: `Erro ao salvar: ${err}` });
            }
        });
    }

    function handleToggleIA() {
        if (!leadId || !lead) return;
        const newVal = !lead.iaAtiva;
        startTransition(async () => {
            try {
                await toggleIaAtiva(leadId, newVal);
                setLead((prev) => (prev ? { ...prev, iaAtiva: newVal } : null));
                setToast({
                    type: "success",
                    text: newVal
                        ? "IA reativada — n8n voltará a responder automaticamente."
                        : "IA pausada — equipe assumiu o atendimento.",
                });
            } catch (err) {
                setToast({ type: "error", text: `Erro ao alterar IA: ${err}` });
            }
        });
    }

    function handleSendMessage() {
        if (!leadId || !chatMessage.trim()) return;
        const text = chatMessage.trim();
        setChatMessage("");

        // Optimistic UI
        const optimisticMsg: LeadMessage = {
            id: `temp-${Date.now()}`,
            senderType: "equipe",
            senderName: "Equipe Alegrando",
            content: text,
            createdAt: new Date(),
        };
        setMsgs((prev) => [...prev, optimisticMsg]);

        startTransition(async () => {
            try {
                await sendMessage(leadId, text);
                // Reload messages for proper IDs
                const fresh = await getLeadMessages(leadId);
                setMsgs(fresh);
            } catch (err) {
                setToast({ type: "error", text: `Erro ao enviar: ${err}` });
            }
        });
    }

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="right"
                className="w-full sm:max-w-[900px] p-0 overflow-hidden flex flex-col"
            >
                {/* Header */}
                <SheetHeader className="px-6 pt-6 pb-4 border-b border-border/50 shrink-0">
                    <div className="flex items-center justify-between">
                        <SheetTitle className="font-display text-xl font-bold text-foreground">
                            {lead?.nomeEscola || "Carregando..."}
                        </SheetTitle>
                        {lead && (
                            <span
                                className={cn(
                                    "text-xs font-bold uppercase px-3 py-1 rounded-full border",
                                    tempOptions.find((t) => t.value === lead.temperatura)?.color ||
                                    "bg-gray-100 text-gray-600"
                                )}
                            >
                                {lead.temperatura}
                            </span>
                        )}
                    </div>
                </SheetHeader>

                {/* Toast */}
                {toast && (
                    <div
                        className={cn(
                            "mx-6 mt-3 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border shrink-0",
                            toast.type === "success"
                                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                : "bg-red-50 text-red-800 border-red-200"
                        )}
                    >
                        {toast.type === "success" ? (
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                        ) : (
                            <AlertCircle className="w-4 h-4 shrink-0" />
                        )}
                        {toast.text}
                    </div>
                )}

                {loadingLead ? (
                    <div className="flex-1 flex items-center justify-center">
                        <Loader2 className="w-8 h-8 animate-spin text-brand-400" />
                    </div>
                ) : lead ? (
                    <div className="flex-1 flex overflow-hidden">
                        {/* =================== LEFT SIDE: FORM =================== */}
                        <div className="w-[55%] border-r border-border/30 overflow-y-auto p-6 space-y-5">
                            {/* Nome da Escola */}
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                                    <School className="w-3.5 h-3.5" />
                                    Nome da Escola
                                </Label>
                                <Input
                                    value={form.nomeEscola}
                                    onChange={(e) =>
                                        setForm((f) => ({ ...f, nomeEscola: e.target.value }))
                                    }
                                    className="rounded-xl"
                                />
                            </div>

                            {/* Temperatura + Coluna Kanban */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                                        <Thermometer className="w-3.5 h-3.5" />
                                        Temperatura
                                    </Label>
                                    <Select
                                        value={form.temperatura}
                                        onValueChange={(v) =>
                                            setForm((f) => ({ ...f, temperatura: v }))
                                        }
                                    >
                                        <SelectTrigger className="rounded-xl">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {tempOptions.map((t) => (
                                                <SelectItem key={t.value} value={t.value}>
                                                    {t.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                                        <Columns3 className="w-3.5 h-3.5" />
                                        Etapa Kanban
                                    </Label>
                                    <Select
                                        value={form.kanbanColumnId}
                                        onValueChange={(v) =>
                                            setForm((f) => ({ ...f, kanbanColumnId: v }))
                                        }
                                    >
                                        <SelectTrigger className="rounded-xl">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {kanbanColumnsOpts.map((col) => (
                                                <SelectItem key={col.id} value={col.id}>
                                                    {col.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {/* Data + Destino */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                                        <CalendarDays className="w-3.5 h-3.5" />
                                        Data do Evento
                                    </Label>
                                    <Input
                                        type="date"
                                        value={form.dataEvento}
                                        onChange={(e) =>
                                            setForm((f) => ({ ...f, dataEvento: e.target.value }))
                                        }
                                        className="rounded-xl"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                                        <MapPin className="w-3.5 h-3.5" />
                                        Destino
                                    </Label>
                                    <Input
                                        value={form.destino}
                                        onChange={(e) =>
                                            setForm((f) => ({ ...f, destino: e.target.value }))
                                        }
                                        placeholder="Ex: Museu Imperial, Petrópolis"
                                        className="rounded-xl"
                                    />
                                </div>
                            </div>

                            {/* Alunos + Pacote */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                                        <Users className="w-3.5 h-3.5" />
                                        Qtd Alunos
                                    </Label>
                                    <Input
                                        type="number"
                                        min={0}
                                        value={form.quantidadeAlunos}
                                        onChange={(e) =>
                                            setForm((f) => ({
                                                ...f,
                                                quantidadeAlunos: e.target.value,
                                            }))
                                        }
                                        className="rounded-xl"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                                        <Package className="w-3.5 h-3.5" />
                                        Pacote Escolhido
                                    </Label>
                                    <Input
                                        value={form.pacoteEscolhido}
                                        onChange={(e) =>
                                            setForm((f) => ({
                                                ...f,
                                                pacoteEscolhido: e.target.value,
                                            }))
                                        }
                                        placeholder="Ex: Premium, Básico"
                                        className="rounded-xl"
                                    />
                                </div>
                            </div>

                            {/* Telefone + Email */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                        📱 Telefone
                                    </Label>
                                    <Input
                                        value={form.telefone}
                                        onChange={(e) =>
                                            setForm((f) => ({ ...f, telefone: e.target.value }))
                                        }
                                        placeholder="(21) 99999-9999"
                                        className="rounded-xl"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                        ✉️ Email
                                    </Label>
                                    <Input
                                        value={form.email}
                                        onChange={(e) =>
                                            setForm((f) => ({ ...f, email: e.target.value }))
                                        }
                                        placeholder="contato@escola.com"
                                        className="rounded-xl"
                                    />
                                </div>
                            </div>

                            {/* Transportadora */}
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                                    <Truck className="w-3.5 h-3.5" />
                                    Transportadora
                                </Label>
                                <Select
                                    value={form.transportadoraId || "none"}
                                    onValueChange={(v) =>
                                        setForm((f) => ({
                                            ...f,
                                            transportadoraId: v === "none" ? "" : v,
                                        }))
                                    }
                                >
                                    <SelectTrigger className="rounded-xl">
                                        <SelectValue placeholder="Nenhuma selecionada" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">Nenhuma selecionada</SelectItem>
                                        {transportadoresOpts.map((t) => (
                                            <SelectItem key={t.id} value={t.id}>
                                                {t.nome}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Observações */}
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                    📝 Observações
                                </Label>
                                <Textarea
                                    value={form.observacoes}
                                    onChange={(e) =>
                                        setForm((f) => ({ ...f, observacoes: e.target.value }))
                                    }
                                    placeholder="Notas internas sobre esse lead..."
                                    rows={3}
                                    className="rounded-xl resize-none"
                                />
                            </div>

                            {/* Save button */}
                            <button
                                onClick={handleSave}
                                disabled={isPending}
                                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-brand-500 text-white font-medium text-sm hover:bg-brand-600 disabled:opacity-50 transition-colors shadow-md shadow-brand-500/20"
                            >
                                {isPending ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Save className="w-4 h-4" />
                                )}
                                Salvar Alterações
                            </button>
                        </div>

                        {/* =================== RIGHT SIDE: CHAT =================== */}
                        <div className="w-[45%] flex flex-col bg-surface-subtle/30">
                            {/* AI Toggle - Top bar */}
                            <div className="px-4 py-3 border-b border-border/30 shrink-0">
                                <div
                                    className={cn(
                                        "flex items-center justify-between p-3 rounded-xl border transition-colors",
                                        lead.iaAtiva
                                            ? "bg-emerald-50/80 border-emerald-200"
                                            : "bg-orange-50/80 border-orange-200"
                                    )}
                                >
                                    <div className="flex items-center gap-2.5">
                                        {lead.iaAtiva ? (
                                            <Bot className="w-5 h-5 text-emerald-600" />
                                        ) : (
                                            <UserRound className="w-5 h-5 text-orange-600" />
                                        )}
                                        <div>
                                            <p
                                                className={cn(
                                                    "text-sm font-semibold",
                                                    lead.iaAtiva ? "text-emerald-800" : "text-orange-800"
                                                )}
                                            >
                                                {lead.iaAtiva ? "IA Ativa" : "Atendimento Manual"}
                                            </p>
                                            <p
                                                className={cn(
                                                    "text-[11px]",
                                                    lead.iaAtiva
                                                        ? "text-emerald-600"
                                                        : "text-orange-600"
                                                )}
                                            >
                                                {lead.iaAtiva
                                                    ? "n8n responde automaticamente"
                                                    : "Equipe assumiu o chat"}
                                            </p>
                                        </div>
                                    </div>
                                    <Switch
                                        checked={lead.iaAtiva}
                                        onCheckedChange={handleToggleIA}
                                        disabled={isPending}
                                        className="data-[state=checked]:bg-emerald-500"
                                    />
                                </div>
                            </div>

                            {/* Chat messages */}
                            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                                {msgs.length === 0 ? (
                                    <div className="flex-1 flex flex-col items-center justify-center py-16 text-center">
                                        <MessageSquare className="w-10 h-10 text-muted-foreground/20 mb-3" />
                                        <p className="text-sm font-medium text-muted-foreground/50">
                                            Nenhuma mensagem ainda
                                        </p>
                                        <p className="text-xs text-muted-foreground/40 mt-1 max-w-[200px]">
                                            Mensagens aparecerão aqui quando o chat estiver ativo.
                                        </p>
                                    </div>
                                ) : (
                                    msgs.map((msg) => (
                                        <div
                                            key={msg.id}
                                            className={cn(
                                                "flex",
                                                msg.senderType === "equipe"
                                                    ? "justify-end"
                                                    : "justify-start"
                                            )}
                                        >
                                            <div
                                                className={cn(
                                                    "max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm",
                                                    msg.senderType === "equipe"
                                                        ? "bg-brand-500 text-white rounded-br-md"
                                                        : msg.senderType === "ia"
                                                            ? "bg-violet-100 text-violet-900 rounded-bl-md"
                                                            : "bg-white border border-border/50 text-foreground rounded-bl-md"
                                                )}
                                            >
                                                {msg.senderType !== "equipe" && (
                                                    <p
                                                        className={cn(
                                                            "text-[10px] font-semibold mb-0.5",
                                                            msg.senderType === "ia"
                                                                ? "text-violet-600"
                                                                : "text-muted-foreground"
                                                        )}
                                                    >
                                                        {msg.senderType === "ia"
                                                            ? "🤖 IA"
                                                            : msg.senderName || "Lead"}
                                                    </p>
                                                )}
                                                <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                                                <p
                                                    className={cn(
                                                        "text-[10px] mt-1 text-right",
                                                        msg.senderType === "equipe"
                                                            ? "text-white/60"
                                                            : "text-muted-foreground/50"
                                                    )}
                                                >
                                                    {msg.createdAt
                                                        ? new Date(msg.createdAt).toLocaleTimeString("pt-BR", {
                                                            hour: "2-digit",
                                                            minute: "2-digit",
                                                        })
                                                        : ""}
                                                </p>
                                            </div>
                                        </div>
                                    ))
                                )}
                                <div ref={chatEndRef} />
                            </div>

                            {/* Chat input */}
                            <div className="px-4 py-3 border-t border-border/30 shrink-0">
                                <div className="flex gap-2">
                                    <Input
                                        value={chatMessage}
                                        onChange={(e) => setChatMessage(e.target.value)}
                                        placeholder={
                                            lead.iaAtiva
                                                ? "Pausar IA antes de enviar..."
                                                : "Digite uma mensagem..."
                                        }
                                        className="rounded-xl flex-1"
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" && !e.shiftKey) {
                                                e.preventDefault();
                                                handleSendMessage();
                                            }
                                        }}
                                    />
                                    <button
                                        onClick={handleSendMessage}
                                        disabled={isPending || !chatMessage.trim()}
                                        className="flex items-center justify-center w-10 h-10 rounded-xl bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50 transition-colors shadow-sm shrink-0"
                                    >
                                        {isPending ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Send className="w-4 h-4" />
                                        )}
                                    </button>
                                </div>
                                <p className="text-[10px] text-muted-foreground/50 mt-1.5 text-center">
                                    Mensagens são disparadas via n8n → WhatsApp
                                </p>
                            </div>
                        </div>
                    </div>
                ) : null}
            </SheetContent>
        </Sheet>
    );
}
