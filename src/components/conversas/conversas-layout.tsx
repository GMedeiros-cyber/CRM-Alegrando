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
import { ChatWindow } from "./chat-window";
import {
    listClientes,
    getClienteByTelefone,
    updateCliente,
    toggleIaAtiva,
} from "@/lib/actions/leads";
import { sendMessageToN8n } from "@/lib/actions/messages";
import {
    getKanbanColumns,
    getLeadTasks,
    addLeadTask,
    toggleLeadTask,
    deleteLeadTask,
} from "@/lib/actions/kanban";
import type { KanbanColumn } from "@/lib/actions/kanban";
import { getAgendamentos, deleteAgendamento } from "@/lib/actions/agenda";
import type { AgendamentoEvent } from "@/lib/actions/agenda";
import type {
    ClienteListItem,
    ClienteDetail,
} from "@/lib/actions/leads";
import {
    Search,
    Bot,
    UserRound,
    Send,
    Loader2,
    Save,
    MessageSquare,
    Phone,
    User,
    Mail,
    CheckCircle2,
    AlertCircle,
    ListTodo,
    Trash2,
    Plus,
    CalendarDays,
    Clock,
    ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

type TaskItem = { id: string; text: string; done: boolean };

// =============================================
// STATUS STYLES
// =============================================
const statusStyles: Record<string, string> = {
    ativo: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
    inativo: "bg-slate-500/20 text-slate-300 border-slate-500/40",
    novo: "bg-blue-500/20 text-blue-300 border-blue-500/40",
};

// =============================================
// MAIN COMPONENT
// =============================================
export function ConversasLayout() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const initialTelefone = searchParams.get("telefone");

    // State
    const [clientesList, setClientesList] = useState<ClienteListItem[]>([]);
    const [selectedTelefone, setSelectedTelefone] = useState<string | null>(
        initialTelefone
    );
    const [cliente, setCliente] = useState<ClienteDetail | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [loading, setLoading] = useState(true);
    const [loadingCliente, setLoadingCliente] = useState(false);
    const [isPending, startTransition] = useTransition();
    const [toast, setToast] = useState<{
        type: "success" | "error";
        text: string;
    } | null>(null);

    // Form state
    const [form, setForm] = useState({
        nome: "",
        email: "",
        cpf: "",
        status: "",
    });

    // Chat
    const [chatMessage, setChatMessage] = useState("");

    // Tasks
    const [tasks, setTasks] = useState<TaskItem[]>([]);
    const [newTaskText, setNewTaskText] = useState("");

    // Kanban columns (para dropdown status)
    const [kanbanColumns, setKanbanColumns] = useState<KanbanColumn[]>([]);

    // Agendamentos
    const [agendamentos, setAgendamentos] = useState<AgendamentoEvent[]>([]);
    const [loadingAgendamentos, setLoadingAgendamentos] = useState(false);

    // Auto-hide toast
    useEffect(() => {
        if (toast) {
            const t = setTimeout(() => setToast(null), 3000);
            return () => clearTimeout(t);
        }
    }, [toast]);

    // Load clientes list
    const loadList = useCallback(async () => {
        try {
            const data = await listClientes(searchTerm || undefined);
            setClientesList(data);
        } catch (err) {
            console.error("Erro ao carregar clientes:", err);
        } finally {
            setLoading(false);
        }
    }, [searchTerm]);

    useEffect(() => {
        loadList();
        getKanbanColumns().then(setKanbanColumns);
    }, [loadList]);

    // Load selected cliente
    const loadCliente = useCallback(async (telefone: string) => {
        setLoadingCliente(true);
        setTasks([]);
        setAgendamentos([]);
        try {
            const clienteData = await getClienteByTelefone(telefone);

            if (clienteData) {
                setCliente(clienteData);
                setForm({
                    nome: clienteData.nome || "",
                    email: clienteData.email || "",
                    cpf: clienteData.cpf || "",
                    status: clienteData.status || "",
                });
                // Carregar tasks
                const tel = parseInt(clienteData.telefone, 10);
                if (!isNaN(tel)) {
                    const t = await getLeadTasks(tel);
                    setTasks(t);
                }
                // Carregar agendamentos vinculados ao cliente pelo nome
                if (clienteData.nome) {
                    setLoadingAgendamentos(true);
                    try {
                        const todos = await getAgendamentos();
                        const filtrados = todos.filter(
                            (ev) =>
                                ev.extendedProps.nomeEscola?.toLowerCase().trim() ===
                                clienteData.nome!.toLowerCase().trim()
                        );
                        setAgendamentos(filtrados);
                    } finally {
                        setLoadingAgendamentos(false);
                    }
                }
            }
        } catch (err) {
            setToast({ type: "error", text: `Erro ao carregar cliente: ${err}` });
        } finally {
            setLoadingCliente(false);
        }
    }, []);

    useEffect(() => {
        if (selectedTelefone) loadCliente(selectedTelefone);
    }, [selectedTelefone, loadCliente]);

    // Handlers
    function selectCliente(telefone: string) {
        setSelectedTelefone(telefone);
        router.replace(`/conversas?telefone=${telefone}`, { scroll: false });
    }

    function handleSave() {
        if (!selectedTelefone) return;
        startTransition(async () => {
            try {
                await updateCliente(selectedTelefone, {
                    nome: form.nome || null,
                    email: form.email || null,
                    cpf: form.cpf || null,
                    status: form.status || null,
                });
                setToast({ type: "success", text: "Cliente atualizado!" });
                loadList();
            } catch (err) {
                setToast({ type: "error", text: `Erro ao salvar: ${err}` });
            }
        });
    }

    function handleToggleIA() {
        if (!selectedTelefone || !cliente) return;
        const newVal = !cliente.iaAtiva;
        startTransition(async () => {
            try {
                await toggleIaAtiva(selectedTelefone, newVal);
                setCliente((prev) => (prev ? { ...prev, iaAtiva: newVal } : null));
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
        if (!cliente?.telefone || !chatMessage.trim()) return;
        const text = chatMessage.trim();
        setChatMessage("");

        startTransition(async () => {
            try {
                await sendMessageToN8n({
                    telefone: cliente.telefone,
                    mensagem: text,
                    sender_name: "Equipe",
                });
            } catch (err) {
                setToast({ type: "error", text: `Erro ao enviar via n8n: ${err}` });
            }
        });
    }

    // ========= Tasks handlers =========
    async function handleAddTask() {
        const text = newTaskText.trim();
        if (!text || !selectedTelefone) return;
        const tempId = `temp-${Date.now()}`;
        setTasks((prev) => [...prev, { id: tempId, text, done: false }]);
        setNewTaskText("");
        const result = await addLeadTask(Number(selectedTelefone), text);
        if (result) {
            setTasks((prev) => prev.map((t) => t.id === tempId ? result : t));
        }
    }

    async function handleToggleTask(id: string) {
        const task = tasks.find((t) => t.id === id);
        if (!task) return;
        setTasks((prev) => prev.map((t) => t.id === id ? { ...t, done: !t.done } : t));
        await toggleLeadTask(id, !task.done);
    }

    async function handleDeleteTask(id: string) {
        setTasks((prev) => prev.filter((t) => t.id !== id));
        await deleteLeadTask(id);
    }

    const pendingTasks = tasks.filter((t) => !t.done);
    const doneTasks = tasks.filter((t) => t.done);
    const sortedTasks = [...pendingTasks, ...doneTasks];
    const allTasksDone = tasks.length > 0 && pendingTasks.length === 0;

    // ========= Agendamentos handler =========
    async function handleDeleteAgendamento(googleEventId: string) {
        setAgendamentos((prev) => prev.filter((a) => a.extendedProps.googleEventId !== googleEventId));
        await deleteAgendamento(googleEventId);
    }

    // =============================================
    // RENDER
    // =============================================
    return (
        <div className="flex h-[calc(100vh-2rem)] -m-6 lg:-m-8 rounded-2xl overflow-hidden bg-slate-900">
            {/* =================== LEFT: CLIENTE LIST =================== */}
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
                            placeholder="Buscar por nome ou telefone..."
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
                    ) : clientesList.length === 0 ? (
                        <div className="text-center py-12 text-sm text-slate-500">
                            Nenhum cliente encontrado
                        </div>
                    ) : (
                        <div className="space-y-1.5">
                            {clientesList.map((item) => (
                                <button
                                    key={item.telefone}
                                    onClick={() => selectCliente(item.telefone)}
                                    className={cn(
                                        "w-full text-left px-3 py-3 rounded-xl transition-all duration-150 border-2",
                                        selectedTelefone === item.telefone
                                            ? "bg-slate-800 border-brand-500 shadow-lg shadow-brand-500/15"
                                            : "bg-slate-800/60 border-slate-700/50 hover:bg-slate-800 hover:border-slate-600"
                                    )}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <p
                                            className={cn(
                                                "text-sm font-semibold truncate",
                                                selectedTelefone === item.telefone
                                                    ? "text-brand-400"
                                                    : "text-slate-200"
                                            )}
                                        >
                                            {item.nome || item.telefone}
                                        </p>
                                        {item.statusAtendimento && (
                                            <span
                                                className={cn(
                                                    "text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full shrink-0 border",
                                                    statusStyles[item.statusAtendimento] || "bg-slate-500/20 text-slate-300 border-slate-500/40"
                                                )}
                                            >
                                                {item.statusAtendimento}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 mt-1.5">
                                        <Phone className="w-3 h-3 text-slate-500 shrink-0" />
                                        <span className="text-[11px] text-slate-400 truncate">
                                            {item.telefone}
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
                {!selectedTelefone ? (
                    // Empty state
                    <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
                        <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center mb-4">
                            <MessageSquare className="w-8 h-8 text-slate-600" />
                        </div>
                        <h3 className="font-display text-lg font-semibold text-slate-400">
                            Selecione uma conversa
                        </h3>
                        <p className="text-sm text-slate-500 mt-1 max-w-xs">
                            Clique em um cliente na lista à esquerda para ver o histórico de mensagens.
                        </p>
                    </div>
                ) : loadingCliente ? (
                    <div className="flex-1 flex items-center justify-center">
                        <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
                    </div>
                ) : cliente ? (
                    <>
                        {/* Chat Header */}
                        <div className="px-5 py-3.5 border-b-2 border-slate-700 shrink-0 flex items-center justify-between bg-slate-900/80">
                            <div>
                                <h3 className="font-display text-base font-bold text-white">
                                    {cliente.nome || "Sem nome"}
                                </h3>
                                <p className="text-xs text-slate-400">{cliente.telefone}</p>
                            </div>

                            {/* AI Toggle */}
                            <div
                                className={cn(
                                    "flex items-center gap-3 px-3 py-2 rounded-xl border-2 transition-colors",
                                    cliente.iaAtiva
                                        ? "bg-emerald-500/15 border-emerald-500/50"
                                        : "bg-orange-500/15 border-orange-500/50"
                                )}
                            >
                                <div className="flex items-center gap-2">
                                    {cliente.iaAtiva ? (
                                        <Bot className="w-4 h-4 text-emerald-400" />
                                    ) : (
                                        <UserRound className="w-4 h-4 text-orange-400" />
                                    )}
                                    <span
                                        className={cn(
                                            "text-xs font-semibold",
                                            cliente.iaAtiva ? "text-emerald-300" : "text-orange-300"
                                        )}
                                    >
                                        {cliente.iaAtiva ? "IA Ativa" : "Modo Manual"}
                                    </span>
                                </div>
                                <Switch
                                    checked={cliente.iaAtiva}
                                    onCheckedChange={handleToggleIA}
                                    className="data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-orange-500"
                                />
                            </div>
                        </div>

                        {/* Toast */}
                        {toast && (
                            <div
                                className={cn(
                                    "mx-5 mt-2 px-4 py-2 rounded-lg flex items-center gap-2 text-xs font-medium animate-in fade-in slide-in-from-top-2",
                                    toast.type === "success"
                                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                        : "bg-red-500/20 text-red-300 border border-red-500/30"
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

                        {/* Messages — Realtime via Supabase */}
                        <ChatWindow telefone={cliente.telefone} />

                        {/* Input */}
                        <div className="px-5 py-3 border-t-2 border-slate-700 shrink-0 bg-slate-900/80">
                            <div className="flex gap-2">
                                <Input
                                    value={chatMessage}
                                    onChange={(e) => setChatMessage(e.target.value)}
                                    placeholder={
                                        cliente.iaAtiva
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
                {selectedTelefone && cliente ? (
                    <div className="p-4 space-y-4">
                        {/* Section title */}
                        <div className="pb-3 mb-1 border-b-2 border-slate-700">
                            <h3 className="font-display text-sm font-bold text-white uppercase tracking-wide">
                                Detalhes do Cliente
                            </h3>
                        </div>

                        {/* Fields */}
                        <div className="space-y-3">
                            <FieldGroup
                                icon={<User className="w-3 h-3" />}
                                label="Nome"
                            >
                                <Input
                                    value={form.nome}
                                    onChange={(e) =>
                                        setForm((f) => ({ ...f, nome: e.target.value }))
                                    }
                                    placeholder="Nome do cliente"
                                    className="rounded-lg h-8 text-sm bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                                />
                            </FieldGroup>

                            <FieldGroup
                                icon={<Phone className="w-3 h-3" />}
                                label="Telefone"
                            >
                                <Input
                                    value={cliente.telefone}
                                    disabled
                                    className="rounded-lg h-8 text-sm bg-slate-800/50 border-slate-700 text-slate-400 cursor-not-allowed"
                                />
                            </FieldGroup>

                            <div className="grid grid-cols-2 gap-2">
                                <FieldGroup label="✉️ Email">
                                    <Input
                                        value={form.email}
                                        onChange={(e) =>
                                            setForm((f) => ({ ...f, email: e.target.value }))
                                        }
                                        placeholder="email@exemplo.com"
                                        className="rounded-lg h-8 text-sm bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                                    />
                                </FieldGroup>
                                <FieldGroup label="🪪 CPF">
                                    <Input
                                        value={form.cpf}
                                        onChange={(e) =>
                                            setForm((f) => ({ ...f, cpf: e.target.value }))
                                        }
                                        placeholder="000.000.000-00"
                                        className="rounded-lg h-8 text-sm bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                                    />
                                </FieldGroup>
                            </div>

                            <FieldGroup label="📋 Status">
                                {kanbanColumns.length > 0 ? (
                                    <Select
                                        value={form.status}
                                        onValueChange={(v) =>
                                            setForm((f) => ({ ...f, status: v }))
                                        }
                                    >
                                        <SelectTrigger className="rounded-lg h-8 text-sm bg-slate-800 border-slate-600 text-white">
                                            <SelectValue placeholder="Selecione..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {kanbanColumns.map((col) => (
                                                <SelectItem key={col.id} value={col.name}>
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: col.color || "#6366f1" }} />
                                                        {col.name}
                                                    </div>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                ) : (
                                    <Input
                                        value={form.status}
                                        onChange={(e) =>
                                            setForm((f) => ({ ...f, status: e.target.value }))
                                        }
                                        placeholder="Ex: Lead, Cliente"
                                        className="rounded-lg h-8 text-sm bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                                    />
                                )}
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

                        {/* Agendamentos */}
                        <div className="pt-4 border-t border-slate-700">
                            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1.5 mb-3">
                                <CalendarDays className="w-3.5 h-3.5" />
                                Agendamentos
                                {agendamentos.length > 0 && (
                                    <span className="ml-auto text-[10px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded-full font-medium">
                                        {agendamentos.length}
                                    </span>
                                )}
                            </h4>

                            {loadingAgendamentos ? (
                                <div className="flex justify-center py-3">
                                    <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
                                </div>
                            ) : agendamentos.length === 0 ? (
                                <p className="text-xs text-slate-600 italic">Nenhum agendamento vinculado.</p>
                            ) : (
                                <div className="space-y-2">
                                    {agendamentos.map((ag) => {
                                        const start = new Date(ag.start);
                                        const end = new Date(ag.end);
                                        const dateStr = start.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
                                        const timeStr = `${start.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} \u2014 ${end.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;

                                        return (
                                            <div
                                                key={ag.id}
                                                className="group/ag rounded-xl border border-slate-700 bg-slate-800/60 p-3 hover:border-slate-600 transition-colors"
                                            >
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-xs font-semibold text-white truncate">{ag.title}</p>
                                                        <div className="flex items-center gap-1 mt-1 text-[11px] text-slate-400">
                                                            <CalendarDays className="w-3 h-3 shrink-0" />
                                                            <span>{dateStr}</span>
                                                        </div>
                                                        <div className="flex items-center gap-1 text-[11px] text-slate-400">
                                                            <Clock className="w-3 h-3 shrink-0" />
                                                            <span>{timeStr}</span>
                                                        </div>
                                                        {ag.extendedProps.status && (
                                                            <span className="inline-block mt-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-medium capitalize">
                                                                {ag.extendedProps.status}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex flex-col gap-1 shrink-0">
                                                        <a
                                                            href="/agenda"
                                                            className="p-1.5 rounded-lg bg-slate-700 text-slate-400 hover:text-white hover:bg-slate-600 transition-colors"
                                                            title="Ver na Agenda"
                                                        >
                                                            <ExternalLink className="w-3 h-3" />
                                                        </a>
                                                        <button
                                                            onClick={() => handleDeleteAgendamento(ag.extendedProps.googleEventId)}
                                                            className="p-1.5 rounded-lg bg-slate-700 text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                                            title="Excluir agendamento"
                                                        >
                                                            <Trash2 className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Tarefas */}
                        <div className="pt-4 border-t border-slate-700">
                            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1.5 mb-3">
                                <ListTodo className="w-3.5 h-3.5" />
                                Tarefas
                                {pendingTasks.length > 0 && (
                                    <span className="ml-auto text-[10px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded-full font-medium">
                                        {pendingTasks.length} pendentes
                                    </span>
                                )}
                                {allTasksDone && (
                                    <span className="ml-auto text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full font-medium">
                                        ✓ Todas concluídas
                                    </span>
                                )}
                            </h4>

                            {/* Barra de progresso */}
                            {tasks.length > 0 && (
                                <div className="flex items-center gap-2 mb-3">
                                    <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-brand-500 rounded-full transition-all duration-300"
                                            style={{ width: `${(doneTasks.length / tasks.length) * 100}%` }}
                                        />
                                    </div>
                                    <span className="text-[10px] text-slate-500 shrink-0">
                                        {doneTasks.length}/{tasks.length}
                                    </span>
                                </div>
                            )}

                            {/* Lista */}
                            <div className="space-y-1.5">
                                {sortedTasks.map((task) => (
                                    <div key={task.id} className="group/task flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-800/60 transition-colors">
                                        <button
                                            onClick={() => handleToggleTask(task.id)}
                                            className={cn(
                                                "w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                                                task.done
                                                    ? "bg-brand-500 border-brand-500"
                                                    : "border-slate-600 hover:border-slate-400"
                                            )}
                                        >
                                            {task.done && (
                                                <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 12 12" fill="none">
                                                    <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                                </svg>
                                            )}
                                        </button>
                                        <span className={cn(
                                            "text-xs flex-1 min-w-0",
                                            task.done ? "text-slate-600 line-through" : "text-slate-300"
                                        )}>
                                            {task.text}
                                        </span>
                                        <button
                                            onClick={() => handleDeleteTask(task.id)}
                                            className="opacity-0 group-hover/task:opacity-100 text-red-400 hover:text-red-300 transition-opacity shrink-0"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                            </div>

                            {/* Input nova task */}
                            <div className="flex items-center gap-1.5 mt-2">
                                <input
                                    value={newTaskText}
                                    onChange={(e) => setNewTaskText(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === "Enter") handleAddTask(); }}
                                    placeholder="+ Adicionar tarefa..."
                                    className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white placeholder:text-slate-600 outline-none focus:ring-1 focus:ring-brand-400 focus:border-brand-400"
                                />
                                {newTaskText.trim() && (
                                    <button
                                        onClick={handleAddTask}
                                        className="p-1.5 rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition-colors shrink-0"
                                    >
                                        <Plus className="w-3 h-3" />
                                    </button>
                                )}
                            </div>

                            {tasks.length === 0 && (
                                <p className="text-xs text-slate-600 italic mt-2">
                                    Nenhuma tarefa criada ainda.
                                </p>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center px-6">
                        <p className="text-sm text-slate-500">
                            Selecione um cliente para ver os detalhes
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
