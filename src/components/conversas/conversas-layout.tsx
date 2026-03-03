"use client";

import { useState, useEffect, useRef, useTransition, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
    listLeads,
    getLeadById,
    getLeadMessages,
    updateLead,
    toggleIaAtiva,
    sendMessage,
    getTransportadores,
    getKanbanColumnsForSelect,
    getAvailableDestinations,
} from "@/lib/actions/leads";
import type {
    LeadListItem,
    LeadDetail,
    LeadMessage,
    TransportadorOption,
} from "@/lib/actions/leads";
import {
    Search,
    Bot,
    UserRound,
    Send,
    Loader2,
    Save,
    MessageSquare,
    CalendarDays,
    MapPin,
    Users,
    Package,
    Truck,
    Columns3,
    Thermometer,
    School,
    CheckCircle2,
    AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// =============================================
// TEMPERATURE STYLES (dark mode adapted)
// =============================================
const tempStyles: Record<string, string> = {
    frio: "bg-blue-500/20 text-blue-300 border-blue-500/40",
    morno: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    quente: "bg-red-500/20 text-red-300 border-red-500/40",
};

const tempOptions = [
    { value: "frio", label: "🧊 Frio" },
    { value: "morno", label: "🔥 Morno" },
    { value: "quente", label: "🌋 Quente" },
];

// =============================================
// MAIN COMPONENT
// =============================================
export function ConversasLayout() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const initialLeadId = searchParams.get("leadId");

    // State
    const [leadsList, setLeadsList] = useState<LeadListItem[]>([]);
    const [selectedLeadId, setSelectedLeadId] = useState<string | null>(
        initialLeadId
    );
    const [lead, setLead] = useState<LeadDetail | null>(null);
    const [msgs, setMsgs] = useState<LeadMessage[]>([]);
    const [transportadoresOpts, setTransportadoresOpts] = useState<TransportadorOption[]>([]);
    const [kanbanColumnsOpts, setKanbanColumnsOpts] = useState<{ id: string; name: string }[]>([]);
    const [destinosOpts, setDestinosOpts] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [loading, setLoading] = useState(true);
    const [loadingLead, setLoadingLead] = useState(false);
    const [isPending, startTransition] = useTransition();
    const [toast, setToast] = useState<{
        type: "success" | "error";
        text: string;
    } | null>(null);

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

    // Load leads list
    const loadList = useCallback(async () => {
        try {
            const data = await listLeads(searchTerm || undefined);
            setLeadsList(data);
        } catch (err) {
            console.error("Erro ao carregar leads:", err);
        } finally {
            setLoading(false);
        }
    }, [searchTerm]);

    useEffect(() => {
        loadList();
    }, [loadList]);

    // Load selected lead
    const loadLead = useCallback(async (id: string) => {
        setLoadingLead(true);
        try {
            const [leadData, messagesData, transOpts, colOpts, destOpts] = await Promise.all([
                getLeadById(id),
                getLeadMessages(id),
                getTransportadores(),
                getKanbanColumnsForSelect(),
                getAvailableDestinations(),
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
            setDestinosOpts(destOpts);
        } catch (err) {
            setToast({ type: "error", text: `Erro ao carregar lead: ${err}` });
        } finally {
            setLoadingLead(false);
        }
    }, []);

    useEffect(() => {
        if (selectedLeadId) loadLead(selectedLeadId);
    }, [selectedLeadId, loadLead]);

    // Scroll to bottom
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [msgs]);

    // Handlers
    function selectLead(id: string) {
        setSelectedLeadId(id);
        router.replace(`/conversas?leadId=${id}`, { scroll: false });
    }

    function handleSave() {
        if (!selectedLeadId) return;
        startTransition(async () => {
            try {
                await updateLead(selectedLeadId, {
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
                loadList();
            } catch (err) {
                setToast({ type: "error", text: `Erro ao salvar: ${err}` });
            }
        });
    }

    function handleToggleIA() {
        if (!selectedLeadId || !lead) return;
        const newVal = !lead.iaAtiva;
        startTransition(async () => {
            try {
                await toggleIaAtiva(selectedLeadId, newVal);
                setLead((prev) => (prev ? { ...prev, iaAtiva: newVal } : null));
                setToast({
                    type: "success",
                    text: newVal
                        ? "IA reativada — n8n voltará a responder."
                        : "IA pausada — equipe assumiu o atendimento.",
                });
            } catch (err) {
                setToast({ type: "error", text: `Erro: ${err}` });
            }
        });
    }

    function handleSendMessage() {
        if (!selectedLeadId || !chatMessage.trim()) return;
        const text = chatMessage.trim();
        setChatMessage("");

        // Optimistic
        const optimistic: LeadMessage = {
            id: `temp-${Date.now()}`,
            senderType: "equipe",
            senderName: "Equipe Alegrando",
            content: text,
            createdAt: new Date(),
        };
        setMsgs((prev) => [...prev, optimistic]);

        startTransition(async () => {
            try {
                await sendMessage(selectedLeadId, text);
                const fresh = await getLeadMessages(selectedLeadId);
                setMsgs(fresh);
            } catch (err) {
                setToast({ type: "error", text: `Erro ao enviar: ${err}` });
            }
        });
    }

    // =============================================
    // RENDER
    // =============================================
    return (
        <div className="flex h-[calc(100vh-2rem)] -m-6 lg:-m-8 rounded-2xl overflow-hidden bg-slate-900">
            {/* =================== LEFT: LEAD LIST =================== */}
            <div className="w-[280px] min-w-[280px] border-r-2 border-slate-700 flex flex-col bg-slate-900">
                {/* Header */}
                <div className="px-4 pt-5 pb-3 shrink-0 border-b-2 border-slate-700">
                    <h2 className="font-display text-lg font-bold text-white tracking-tight">
                        Conversas
                    </h2>
                    <div className="relative mt-3">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Buscar escola..."
                            className="pl-9 rounded-xl bg-slate-800 border-slate-600 h-9 text-sm text-white placeholder:text-slate-500 focus:border-brand-500 focus:ring-brand-500/20"
                        />
                    </div>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto px-2 py-2">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
                        </div>
                    ) : leadsList.length === 0 ? (
                        <div className="text-center py-12 text-sm text-slate-500">
                            Nenhum lead encontrado
                        </div>
                    ) : (
                        <div className="space-y-1.5">
                            {leadsList.map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => selectLead(item.id)}
                                    className={cn(
                                        "w-full text-left px-3 py-3 rounded-xl transition-all duration-150 border-2",
                                        selectedLeadId === item.id
                                            ? "bg-slate-800 border-brand-500 shadow-lg shadow-brand-500/15"
                                            : "bg-slate-800/60 border-slate-700/50 hover:bg-slate-800 hover:border-slate-600"
                                    )}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <p
                                            className={cn(
                                                "text-sm font-semibold truncate",
                                                selectedLeadId === item.id
                                                    ? "text-brand-400"
                                                    : "text-slate-200"
                                            )}
                                        >
                                            {item.nomeEscola}
                                        </p>
                                        <span
                                            className={cn(
                                                "text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full shrink-0 border",
                                                tempStyles[item.temperatura] || tempStyles.frio
                                            )}
                                        >
                                            {item.temperatura}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 mt-1.5">
                                        <span
                                            className="w-1.5 h-1.5 rounded-full shrink-0"
                                            style={{
                                                backgroundColor: item.kanbanColumnColor || "#6366f1",
                                            }}
                                        />
                                        <span className="text-[11px] text-slate-400 truncate">
                                            {item.kanbanColumnName}
                                        </span>
                                        {!item.iaAtiva && (
                                            <span className="ml-auto text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">
                                                Manual
                                            </span>
                                        )}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* =================== CENTER: CHAT =================== */}
            <div className="flex-1 flex flex-col min-w-0 bg-[#0f172a]">
                {!selectedLeadId ? (
                    // Empty state
                    <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
                        <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center mb-4">
                            <MessageSquare className="w-8 h-8 text-slate-600" />
                        </div>
                        <h3 className="font-display text-lg font-semibold text-slate-400">
                            Selecione uma conversa
                        </h3>
                        <p className="text-sm text-slate-500 mt-1 max-w-xs">
                            Clique em um lead na lista à esquerda para iniciar o atendimento.
                        </p>
                    </div>
                ) : loadingLead ? (
                    <div className="flex-1 flex items-center justify-center">
                        <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
                    </div>
                ) : lead ? (
                    <>
                        {/* Chat Header */}
                        <div className="px-5 py-3.5 border-b-2 border-slate-700 shrink-0 flex items-center justify-between bg-slate-900/80">
                            <div>
                                <h3 className="font-display text-base font-bold text-white">
                                    {lead.nomeEscola}
                                </h3>
                                {lead.telefone && (
                                    <p className="text-xs text-slate-400">{lead.telefone}</p>
                                )}
                            </div>

                            {/* AI Toggle - prominent */}
                            <div
                                className={cn(
                                    "flex items-center gap-3 px-3 py-2 rounded-xl border-2 transition-colors",
                                    lead.iaAtiva
                                        ? "bg-emerald-500/15 border-emerald-500/50"
                                        : "bg-orange-500/15 border-orange-500/50"
                                )}
                            >
                                <div className="flex items-center gap-2">
                                    {lead.iaAtiva ? (
                                        <Bot className="w-4 h-4 text-emerald-400" />
                                    ) : (
                                        <UserRound className="w-4 h-4 text-orange-400" />
                                    )}
                                    <span
                                        className={cn(
                                            "text-xs font-semibold",
                                            lead.iaAtiva ? "text-emerald-300" : "text-orange-300"
                                        )}
                                    >
                                        {lead.iaAtiva ? "IA Ativa" : "Manual"}
                                    </span>
                                </div>
                                <Switch
                                    checked={lead.iaAtiva}
                                    onCheckedChange={handleToggleIA}
                                    disabled={isPending}
                                    className="data-[state=checked]:bg-emerald-500 scale-90"
                                />
                            </div>
                        </div>

                        {/* Toast inside chat */}
                        {toast && (
                            <div
                                className={cn(
                                    "mx-5 mt-2 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium border shrink-0",
                                    toast.type === "success"
                                        ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                                        : "bg-red-500/15 text-red-300 border-red-500/30"
                                )}
                            >
                                {toast.type === "success" ? (
                                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                ) : (
                                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                )}
                                {toast.text}
                            </div>
                        )}

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-[#0b1120]">
                            {msgs.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-center">
                                    <MessageSquare className="w-12 h-12 text-slate-700 mb-3" />
                                    <p className="text-sm font-medium text-slate-500">
                                        Nenhuma mensagem ainda
                                    </p>
                                    <p className="text-xs text-slate-600 mt-1 max-w-[250px]">
                                        Envie a primeira mensagem para iniciar o atendimento via WhatsApp.
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
                                                "max-w-[70%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed",
                                                msg.senderType === "equipe"
                                                    ? "bg-brand-500 text-white rounded-br-md shadow-lg shadow-brand-500/20"
                                                    : msg.senderType === "ia"
                                                        ? "bg-violet-500/20 text-violet-200 border border-violet-500/30 rounded-bl-md"
                                                        : "bg-slate-800 border border-slate-700 text-slate-200 rounded-bl-md"
                                            )}
                                        >
                                            {msg.senderType !== "equipe" && (
                                                <p
                                                    className={cn(
                                                        "text-[10px] font-bold mb-0.5",
                                                        msg.senderType === "ia"
                                                            ? "text-violet-400"
                                                            : "text-slate-400"
                                                    )}
                                                >
                                                    {msg.senderType === "ia"
                                                        ? "🤖 IA"
                                                        : msg.senderName || "Lead"}
                                                </p>
                                            )}
                                            <p className="whitespace-pre-wrap">{msg.content}</p>
                                            <p
                                                className={cn(
                                                    "text-[10px] mt-1 text-right",
                                                    msg.senderType === "equipe"
                                                        ? "text-white/50"
                                                        : "text-slate-500"
                                                )}
                                            >
                                                {msg.createdAt
                                                    ? new Date(msg.createdAt).toLocaleTimeString(
                                                        "pt-BR",
                                                        { hour: "2-digit", minute: "2-digit" }
                                                    )
                                                    : ""}
                                            </p>
                                        </div>
                                    </div>
                                ))
                            )}
                            <div ref={chatEndRef} />
                        </div>

                        {/* Input */}
                        <div className="px-5 py-3 border-t-2 border-slate-700 shrink-0 bg-slate-900/80">
                            <div className="flex gap-2">
                                <Input
                                    value={chatMessage}
                                    onChange={(e) => setChatMessage(e.target.value)}
                                    placeholder={
                                        lead.iaAtiva
                                            ? "Pause a IA para enviar manualmente..."
                                            : "Digite uma mensagem..."
                                    }
                                    className="rounded-xl flex-1 h-10 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 focus:border-brand-500 focus:ring-brand-500/20"
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
                                    className="flex items-center justify-center w-10 h-10 rounded-xl bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50 transition-colors shadow-lg shadow-brand-500/25 shrink-0"
                                >
                                    {isPending ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Send className="w-4 h-4" />
                                    )}
                                </button>
                            </div>
                            <p className="text-[10px] text-slate-600 mt-1.5 text-center">
                                Enter para enviar · Mensagens disparadas via n8n → WhatsApp
                            </p>
                        </div>
                    </>
                ) : null}
            </div>

            {/* =================== RIGHT: DETAILS =================== */}
            <div className="w-[300px] min-w-[300px] border-l-2 border-slate-700 overflow-y-auto bg-slate-900">
                {selectedLeadId && lead ? (
                    <div className="p-4 space-y-4">
                        {/* Section title */}
                        <div className="pb-3 mb-1 border-b-2 border-slate-700">
                            <h3 className="font-display text-sm font-bold text-white uppercase tracking-wide">
                                Detalhes do Lead
                            </h3>
                        </div>

                        {/* Fields */}
                        <div className="space-y-3">
                            <FieldGroup
                                icon={<School className="w-3 h-3" />}
                                label="Escola"
                            >
                                <Input
                                    value={form.nomeEscola}
                                    onChange={(e) =>
                                        setForm((f) => ({ ...f, nomeEscola: e.target.value }))
                                    }
                                    className="rounded-lg h-8 text-sm bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                                />
                            </FieldGroup>

                            <div className="grid grid-cols-2 gap-2">
                                <FieldGroup
                                    icon={<Thermometer className="w-3 h-3" />}
                                    label="Temperatura"
                                >
                                    <Select
                                        value={form.temperatura}
                                        onValueChange={(v) =>
                                            setForm((f) => ({ ...f, temperatura: v }))
                                        }
                                    >
                                        <SelectTrigger className="rounded-lg h-8 text-sm bg-slate-800 border-slate-600 text-white">
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
                                </FieldGroup>

                                <FieldGroup
                                    icon={<Columns3 className="w-3 h-3" />}
                                    label="Etapa"
                                >
                                    <Select
                                        value={form.kanbanColumnId}
                                        onValueChange={(v) =>
                                            setForm((f) => ({ ...f, kanbanColumnId: v }))
                                        }
                                    >
                                        <SelectTrigger className="rounded-lg h-8 text-sm bg-slate-800 border-slate-600 text-white">
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
                                </FieldGroup>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <FieldGroup
                                    icon={<CalendarDays className="w-3 h-3" />}
                                    label="Data Evento"
                                >
                                    <Input
                                        type="date"
                                        value={form.dataEvento}
                                        onChange={(e) =>
                                            setForm((f) => ({ ...f, dataEvento: e.target.value }))
                                        }
                                        className="rounded-lg h-8 text-sm bg-slate-800 border-slate-600 text-white"
                                    />
                                </FieldGroup>

                                <FieldGroup
                                    icon={<Users className="w-3 h-3" />}
                                    label="Qtd Alunos"
                                >
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
                                        className="rounded-lg h-8 text-sm bg-slate-800 border-slate-600 text-white"
                                    />
                                </FieldGroup>
                            </div>

                            <FieldGroup
                                icon={<MapPin className="w-3 h-3" />}
                                label="Destino"
                            >
                                <Select
                                    value={form.destino || "none"}
                                    onValueChange={(v) =>
                                        setForm((f) => ({
                                            ...f,
                                            destino: v === "none" ? "" : v,
                                        }))
                                    }
                                >
                                    <SelectTrigger className="rounded-lg h-8 text-sm bg-slate-800 border-slate-600 text-white">
                                        <SelectValue placeholder="Sem destino" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">Sem destino</SelectItem>
                                        {destinosOpts.map((d) => (
                                            <SelectItem key={d} value={d}>
                                                {d}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </FieldGroup>

                            <FieldGroup
                                icon={<Package className="w-3 h-3" />}
                                label="Pacote"
                            >
                                <Input
                                    value={form.pacoteEscolhido}
                                    onChange={(e) =>
                                        setForm((f) => ({
                                            ...f,
                                            pacoteEscolhido: e.target.value,
                                        }))
                                    }
                                    placeholder="Premium, Básico..."
                                    className="rounded-lg h-8 text-sm bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                                />
                            </FieldGroup>

                            <div className="grid grid-cols-2 gap-2">
                                <FieldGroup label="📱 Telefone">
                                    <Input
                                        value={form.telefone}
                                        onChange={(e) =>
                                            setForm((f) => ({ ...f, telefone: e.target.value }))
                                        }
                                        placeholder="(21) 99999-9999"
                                        className="rounded-lg h-8 text-sm bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                                    />
                                </FieldGroup>
                                <FieldGroup label="✉️ Email">
                                    <Input
                                        value={form.email}
                                        onChange={(e) =>
                                            setForm((f) => ({ ...f, email: e.target.value }))
                                        }
                                        placeholder="email@escola.com"
                                        className="rounded-lg h-8 text-sm bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                                    />
                                </FieldGroup>
                            </div>

                            <FieldGroup
                                icon={<Truck className="w-3 h-3" />}
                                label="Transportadora"
                            >
                                <Select
                                    value={form.transportadoraId || "none"}
                                    onValueChange={(v) =>
                                        setForm((f) => ({
                                            ...f,
                                            transportadoraId: v === "none" ? "" : v,
                                        }))
                                    }
                                >
                                    <SelectTrigger className="rounded-lg h-8 text-sm bg-slate-800 border-slate-600 text-white">
                                        <SelectValue placeholder="Nenhuma" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">Nenhuma</SelectItem>
                                        {transportadoresOpts.map((t) => (
                                            <SelectItem key={t.id} value={t.id}>
                                                {t.nome}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </FieldGroup>

                            <FieldGroup label="📝 Observações">
                                <Textarea
                                    value={form.observacoes}
                                    onChange={(e) =>
                                        setForm((f) => ({ ...f, observacoes: e.target.value }))
                                    }
                                    placeholder="Notas internas..."
                                    rows={3}
                                    className="rounded-lg text-sm resize-none bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                                />
                            </FieldGroup>
                        </div>

                        {/* Save */}
                        <button
                            onClick={handleSave}
                            disabled={isPending}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500 text-white font-medium text-sm hover:bg-brand-600 disabled:opacity-50 transition-colors shadow-lg shadow-brand-500/25"
                        >
                            {isPending ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Save className="w-4 h-4" />
                            )}
                            Salvar
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center px-6">
                        <p className="text-sm text-slate-500">
                            Selecione um lead para ver os detalhes
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

// =============================================
// FIELD GROUP HELPER
// =============================================
function FieldGroup({
    icon,
    label,
    children,
}: {
    icon?: React.ReactNode;
    label: string;
    children: React.ReactNode;
}) {
    return (
        <div className="space-y-1">
            <Label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                {icon}
                {label}
            </Label>
            {children}
        </div>
    );
}
