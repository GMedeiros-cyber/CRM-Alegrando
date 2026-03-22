"use client";

import { useState, useEffect, useRef, useTransition, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
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
    markAsRead,
    sendManualFollowup,
    getPasseiosHistorico,
    addPasseioHistorico,
    deletePasseioHistorico,

} from "@/lib/actions/leads";
import type { PasseioHistorico } from "@/lib/actions/leads";
import { sendMessage } from "@/lib/actions/messages";
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
    MessageSquare,
    Phone,
    User,
    CheckCircle2,
    AlertCircle,
    ListTodo,
    Trash2,
    Plus,
    CalendarDays,
    Clock,
    ExternalLink,
    ArrowLeft,
    PanelRightOpen,
    Save,
} from "lucide-react";
import {
    Sheet,
    SheetContent,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase/client";

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
        linkedin: "",
        facebook: "",
        instagram: "",
        kanbanColumnId: "",
        ultimoPasseio: "",
        followupDias: 45,
        followupHora: "09:00",
        followupAtivo: false,
        followupEnviado: false,
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

    const [sortOrder, setSortOrder] = useState<string>("recent");
    const [totalClientes, setTotalClientes] = useState(0);
    const [loadingMore, setLoadingMore] = useState(false);
    const CLIENTES_LIMIT = 50;

    // Mobile responsiveness
    const [mobileView, setMobileView] = useState<"list" | "chat">("list");
    const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false);

    // Passeios historico
    const [passeiosHistorico, setPaseiosHistorico] = useState<PasseioHistorico[]>([]);
    const [addingPasseio, setAddingPasseio] = useState(false);
    const [novoPasseioDestino, setNovoPasseioDestino] = useState("");
    const [novoPasseioData, setNovoPasseioData] = useState("");

    // Auto-hide toast
    useEffect(() => {
        if (toast) {
            const t = setTimeout(() => setToast(null), 3000);
            return () => clearTimeout(t);
        }
    }, [toast]);

    // Ordenação client-side
    const sortedLeads = [...clientesList].sort((a, b) => {
        if (sortOrder === "recent") {
            const timeA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
            const timeB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
            return timeB - timeA;
        }
        if (sortOrder === "oldest") {
            const timeA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
            const timeB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
            return timeA - timeB;
        }
        if (sortOrder === "az") {
            return (a.nome || "").localeCompare(b.nome || "");
        }
        if (sortOrder === "za") {
            return (b.nome || "").localeCompare(a.nome || "");
        }
        return 0;
    });

    // Load clientes list (page 1)
    const loadList = useCallback(async () => {
        try {
            const result = await listClientes({ search: searchTerm || undefined, page: 1, limit: CLIENTES_LIMIT });
            setClientesList(result.data);
            setTotalClientes(result.total);
        } catch {
        } finally {
            setLoading(false);
        }
    }, [searchTerm]);

    // Load more clientes (next page)
    async function loadMore() {
        const nextPage = Math.floor(clientesList.length / CLIENTES_LIMIT) + 1;
        setLoadingMore(true);
        try {
            const result = await listClientes({ search: searchTerm || undefined, page: nextPage, limit: CLIENTES_LIMIT });
            setClientesList(prev => [...prev, ...result.data]);
            setTotalClientes(result.total);
        } catch {
        } finally {
            setLoadingMore(false);
        }
    }

    useEffect(() => {
        loadList();
        getKanbanColumns().then(setKanbanColumns);
    }, [loadList]);

    // Realtime: atualiza lista quando nova mensagem é inserida na tabela messages
    useEffect(() => {
        const channel = supabase
            .channel("conversas-list-realtime")
            .on(
                "postgres_changes",
                { event: "INSERT", schema: "public", table: "messages" },
                () => {
                    loadList();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [loadList]);

    // Load selected cliente
    const loadCliente = useCallback(async (telefone: string) => {
        setLoadingCliente(true);
        setLoadingAgendamentos(true);
        setTasks([]);
        setAgendamentos([]);
        setPaseiosHistorico([]);
        setAddingPasseio(false);

        try {
            const tel = parseInt(telefone, 10);

            // As chamadas disparam em paralelo
            const [clienteData, tasksData, todosAgendamentos, historico] = await Promise.all([
                getClienteByTelefone(telefone),
                !isNaN(tel) ? getLeadTasks(tel) : Promise.resolve([]),
                getAgendamentos(),
                getPasseiosHistorico(telefone),
            ]);

            setPaseiosHistorico(historico);

            if (clienteData) {
                setCliente(clienteData);
                setForm({
                    nome: clienteData.nome || "",
                    email: clienteData.email || "",
                    cpf: clienteData.cpf || "",
                    status: clienteData.status || "",
                    linkedin: clienteData.linkedin || "",
                    facebook: clienteData.facebook || "",
                    instagram: clienteData.instagram || "",
                    kanbanColumnId: clienteData.kanbanColumnId || "",
                    ultimoPasseio: clienteData.ultimoPasseio || "",
                    followupDias: clienteData.followupDias ?? 45,
                    followupHora: clienteData.followupHora || "09:00",
                    followupAtivo: clienteData.followupAtivo ?? false,
                    followupEnviado: clienteData.followupEnviado ?? false,
                });

                // Tasks
                setTasks(tasksData);

                // Agendamentos — filtra pelo nome do cliente (pode ser null)
                if (clienteData.nome) {
                    const filtrados = todosAgendamentos.filter(
                        (ev) =>
                            ev.extendedProps.nomeEscola?.toLowerCase().trim() ===
                            clienteData.nome!.toLowerCase().trim()
                    );
                    setAgendamentos(filtrados);
                } else {
                    setAgendamentos([]);
                }
            }
        } catch (err) {
            setToast({ type: "error", text: `Erro ao carregar cliente: ${err}` });
        } finally {
            setLoadingCliente(false);
            setLoadingAgendamentos(false);
        }
    }, []);

    // Select cliente and mark as read
    const handleSelectCliente = useCallback(
        async (telefone: string) => {
            setSelectedTelefone(telefone);
            setMobileView("chat");
            router.push(`/conversas?telefone=${telefone}`, { scroll: false });

            // Marcar como lida localmente e no banco
            try {
                await markAsRead(telefone);
                setClientesList((prev) =>
                    prev.map((c) =>
                        String(c.telefone) === String(telefone) ? { ...c, unreadCount: 0 } : c
                    )
                );
            } catch {
            }
        },
        [router]
    );

    useEffect(() => {
        if (selectedTelefone) loadCliente(selectedTelefone);
    }, [selectedTelefone, loadCliente]);

    // Handlers

    const formatUrl = (val: string | null) => {
        if (!val) return null;
        let url = val.trim();
        if (!url) return null;
        if (!url.startsWith('http')) return `https://${url}`;
        return url;
    };

    function handleSave() {
        if (!selectedTelefone) return;

        const linkedin = formatUrl(form.linkedin);
        const facebook = formatUrl(form.facebook);
        const instagram = formatUrl(form.instagram);

        setForm(f => ({
            ...f,
            linkedin: linkedin || "",
            facebook: facebook || "",
            instagram: instagram || ""
        }));

        startTransition(async () => {
            try {
                await updateCliente(selectedTelefone, {
                    nome: form.nome || null,
                    email: form.email || null,
                    cpf: form.cpf || null,
                    status: form.status || null,
                    linkedin,
                    facebook,
                    instagram,
                    kanbanColumnId: form.kanbanColumnId || null,
                    ultimoPasseio: form.ultimoPasseio || null,
                    followupDias: form.followupDias,
                    followupHora: form.followupHora,
                    followupAtivo: form.followupAtivo,
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
                setClientesList((prev) =>
                    prev.map((c) =>
                        String(c.telefone) === String(selectedTelefone)
                            ? { ...c, iaAtiva: newVal }
                            : c
                    )
                );
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
                await sendMessage({
                    telefone: cliente.telefone,
                    mensagem: text,
                    sender_name: "Equipe",
                    iaAtiva: cliente.iaAtiva,
                });
            } catch (err) {
                setToast({ type: "error", text: `Erro ao enviar: ${err}` });
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

    // ========= Passeios historico handlers =========
    async function handleAddPasseio() {
        if (!selectedTelefone || !novoPasseioDestino || !novoPasseioData) return;
        const result = await addPasseioHistorico(selectedTelefone, novoPasseioDestino, novoPasseioData);
        if (result) {
            setPaseiosHistorico(prev => [result, ...prev]);
            setForm(f => ({ ...f, ultimoPasseio: result.dataPaseio > (f.ultimoPasseio || "") ? result.dataPaseio : f.ultimoPasseio }));
            setNovoPasseioDestino("");
            setNovoPasseioData("");
            setAddingPasseio(false);
            setToast({ type: "success", text: "Passeio registrado!" });
        }
    }

    async function handleDeletePasseio(id: string) {
        if (!selectedTelefone) return;
        await deletePasseioHistorico(id, selectedTelefone);
        setPaseiosHistorico(prev => prev.filter(p => p.id !== id));
        loadCliente(selectedTelefone);
        setToast({ type: "success", text: "Passeio removido." });
    }

    // =============================================
    // SHARED DETAILS PANEL (desktop + mobile sheet)
    // =============================================
    function renderClienteDetails() {
        if (!selectedTelefone || !cliente) return null;
        return (
            <div className="p-4 space-y-4">
                {/* Section title */}
                <div className="pb-3 mb-1 border-b-2 border-border">
                    <h3 className="font-display text-sm font-bold text-foreground uppercase tracking-wide">
                        Detalhes do Cliente
                    </h3>
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

                {/* Fields */}
                <div className="space-y-3">
                    <FieldGroup icon={<User className="w-3 h-3" />} label="Nome">
                        <Input
                            value={form.nome}
                            onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                            onBlur={handleSave}
                            placeholder="Nome do cliente"
                            className="rounded-lg h-8 text-sm bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                        />
                    </FieldGroup>

                    <FieldGroup icon={<Phone className="w-3 h-3" />} label="Telefone">
                        <Input
                            value={cliente.telefone}
                            disabled
                            className="rounded-lg h-8 text-sm bg-slate-800/50 border-slate-700 text-slate-400 cursor-not-allowed"
                        />
                    </FieldGroup>

                    <div className="grid grid-cols-2 gap-2">
                        <FieldGroup label="Email">
                            <Input
                                value={form.email}
                                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                                onBlur={handleSave}
                                placeholder="email@exemplo.com"
                                className="rounded-lg h-8 text-sm bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                            />
                        </FieldGroup>
                        <FieldGroup label="CPF">
                            <Input
                                value={form.cpf}
                                onChange={(e) => setForm((f) => ({ ...f, cpf: e.target.value }))}
                                onBlur={handleSave}
                                placeholder="000.000.000-00"
                                className="rounded-lg h-8 text-sm bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                            />
                        </FieldGroup>
                    </div>

                    <FieldGroup label="Status (Kanban)">
                        <Select
                            value={form.kanbanColumnId}
                            onValueChange={(val) => {
                                setForm((f) => ({ ...f, kanbanColumnId: val }));
                                if (selectedTelefone) {
                                    startTransition(async () => {
                                        try {
                                            await updateCliente(selectedTelefone, {
                                                kanbanColumnId: val || null,
                                            });
                                            setToast({ type: "success", text: "Cliente atualizado!" });
                                            loadList();
                                        } catch (err) {
                                            setToast({ type: "error", text: `Erro ao salvar: ${err}` });
                                        }
                                    });
                                }
                            }}
                        >
                            <SelectTrigger className="rounded-lg h-8 text-sm bg-slate-800 border-slate-600 text-white">
                                <SelectValue placeholder="Mudar coluna..." />
                            </SelectTrigger>
                            <SelectContent>
                                {kanbanColumns.map((col) => (
                                    <SelectItem key={col.id} value={col.id}>
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: col.color || "#6366f1" }} />
                                            {col.name}
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </FieldGroup>

                    {/* Último Passeio — sempre visível, read-only */}
                    <FieldGroup label="Último Passeio">
                        <p className="text-sm text-white px-1 h-8 flex items-center">
                            {form.ultimoPasseio
                                ? new Date(form.ultimoPasseio + "T00:00:00").toLocaleDateString("pt-BR")
                                : "Nenhum passeio registrado"}
                        </p>
                    </FieldGroup>

                    {/* Histórico de Passeios */}
                    <div className="pt-2 border-t border-slate-700">
                        <div className="flex items-center justify-between mb-2">
                            <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                Histórico de Passeios
                                {passeiosHistorico.length > 0 && (
                                    <span className="ml-1 text-[10px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded-full">
                                        {passeiosHistorico.length}
                                    </span>
                                )}
                            </h4>
                            <button
                                onClick={() => setAddingPasseio(!addingPasseio)}
                                className="text-[10px] font-semibold text-brand-400 hover:text-brand-300 transition-colors"
                            >
                                {addingPasseio ? "Cancelar" : "+ Registrar"}
                            </button>
                        </div>

                        {/* Formulário de adicionar passeio */}
                        {addingPasseio && (
                            <div className="space-y-2 mb-3 p-2 rounded-lg bg-slate-800/60 border border-slate-700">
                                <Input
                                    value={novoPasseioDestino}
                                    onChange={(e) => setNovoPasseioDestino(e.target.value)}
                                    placeholder="Ex: Passeio Sítio do Carroção"
                                    className="rounded-lg h-8 text-sm bg-slate-900 border-slate-600 text-white placeholder:text-slate-500"
                                />
                                <DatePicker
                                    value={novoPasseioData}
                                    onChange={(v) => setNovoPasseioData(v)}
                                    placeholder="Data do passeio"
                                    className="w-full rounded-lg"
                                />
                                <button
                                    onClick={handleAddPasseio}
                                    disabled={!novoPasseioDestino || !novoPasseioData}
                                    className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500 text-white text-xs font-semibold hover:bg-brand-600 disabled:opacity-40 transition-colors"
                                >
                                    <Save className="w-3 h-3" />
                                    Salvar Passeio
                                </button>
                            </div>
                        )}

                        {/* Lista de passeios */}
                        {passeiosHistorico.length === 0 ? (
                            <p className="text-xs text-slate-600 italic">Nenhum passeio registrado.</p>
                        ) : (
                            <div className="space-y-1.5 max-h-[150px] overflow-y-auto">
                                {passeiosHistorico.map((p) => (
                                    <div
                                        key={p.id}
                                        className="group/passeio flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-slate-800/60 transition-colors"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs text-slate-200 font-medium truncate">{p.destino}</p>
                                            <p className="text-[10px] text-slate-500">
                                                {new Date(p.dataPaseio + "T00:00:00").toLocaleDateString("pt-BR")}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => handleDeletePasseio(p.id)}
                                            className="opacity-0 group-hover/passeio:opacity-100 text-red-400 hover:text-red-300 transition-opacity shrink-0 ml-2"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Follow-up */}
                    <FieldGroup label="Follow-up ativo">
                        <div className="flex items-center h-8">
                            <Switch
                                checked={form.followupAtivo}
                                onCheckedChange={(checked) => {
                                    setForm((f) => ({ ...f, followupAtivo: checked }));
                                    if (selectedTelefone) {
                                        startTransition(async () => {
                                            try {
                                                await updateCliente(selectedTelefone, { followupAtivo: checked });
                                                setToast({ type: "success", text: checked ? "Follow-up ativado!" : "Follow-up desativado!" });
                                                loadList();
                                            } catch {}
                                        });
                                    }
                                }}
                                className="data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-slate-600"
                            />
                        </div>
                    </FieldGroup>

                    {form.followupAtivo && (
                        <>
                            <div className="grid grid-cols-2 gap-2">
                                <FieldGroup label="Follow-up (dias)">
                                    <Input
                                        type="number"
                                        min={1}
                                        value={form.followupDias}
                                        onChange={(e) => setForm((f) => ({ ...f, followupDias: parseInt(e.target.value) || 45 }))}
                                        onBlur={handleSave}
                                        className="rounded-lg h-8 text-sm bg-slate-800 border-slate-600 text-white"
                                    />
                                </FieldGroup>
                                <FieldGroup label="Horario de envio">
                                    <TimePicker
                                        value={form.followupHora}
                                        onChange={(v) => {
                                            setForm((f) => ({ ...f, followupHora: v }));
                                            setTimeout(() => handleSave(), 0);
                                        }}
                                        className="w-full rounded-lg"
                                    />
                                </FieldGroup>
                            </div>

                            {form.followupEnviado && (
                                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30">
                                    <span className="text-xs font-medium text-emerald-400">Follow-up ja enviado</span>
                                </div>
                            )}
                            {form.ultimoPasseio && !form.followupEnviado && (
                                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/15 border border-amber-500/30">
                                    <span className="text-xs font-medium text-amber-400">Follow-up programado para {form.followupDias} dias apos o passeio as {form.followupHora}</span>
                                </div>
                            )}

                            {form.ultimoPasseio && (
                                <button
                                    onClick={() => {
                                        if (!selectedTelefone) return;
                                        startTransition(async () => {
                                            try {
                                                const result = await sendManualFollowup(selectedTelefone);
                                                if (result.success) {
                                                    setToast({
                                                        type: "success",
                                                        text: result.type === "avaliacao"
                                                            ? "Mensagem de avaliacao enviada!"
                                                            : "Follow-up enviado com sucesso!",
                                                    });
                                                    loadCliente(selectedTelefone);
                                                } else {
                                                    setToast({ type: "error", text: result.error || "Erro ao enviar" });
                                                }
                                            } catch {
                                                setToast({ type: "error", text: "Erro ao enviar follow-up" });
                                            }
                                        });
                                    }}
                                    disabled={isPending}
                                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-brand-500/15 text-brand-400 text-xs font-semibold hover:bg-brand-500/25 border border-brand-500/30 transition-colors disabled:opacity-40"
                                >
                                    {isPending ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                        <Send className="w-3.5 h-3.5" />
                                    )}
                                    Enviar Follow-up Agora
                                </button>
                            )}
                        </>
                    )}

                    {/* Redes Sociais */}
                    <div className="pt-2">
                        <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                            Redes Sociais
                        </h4>
                        <div className="space-y-2">
                            <div className="relative">
                                <Input
                                    value={form.linkedin}
                                    onChange={(e) => setForm((f) => ({ ...f, linkedin: e.target.value }))}
                                    onBlur={handleSave}
                                    placeholder="https://linkedin.com/in/..."
                                    className="rounded-lg h-8 pr-8 text-sm bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                                />
                                {form.linkedin && (
                                    <a
                                        href={form.linkedin.startsWith('http') ? form.linkedin : `https://${form.linkedin}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-brand-400"
                                    >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                    </a>
                                )}
                            </div>
                            <div className="relative">
                                <Input
                                    value={form.facebook}
                                    onChange={(e) => setForm((f) => ({ ...f, facebook: e.target.value }))}
                                    onBlur={handleSave}
                                    placeholder="https://facebook.com/..."
                                    className="rounded-lg h-8 pr-8 text-sm bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                                />
                                {form.facebook && (
                                    <a
                                        href={form.facebook.startsWith('http') ? form.facebook : `https://${form.facebook}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-brand-400"
                                    >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                    </a>
                                )}
                            </div>
                            <div className="relative">
                                <Input
                                    value={form.instagram}
                                    onChange={(e) => setForm((f) => ({ ...f, instagram: e.target.value }))}
                                    onBlur={handleSave}
                                    placeholder="https://instagram.com/..."
                                    className="rounded-lg h-8 pr-8 text-sm bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                                />
                                {form.instagram && (
                                    <a
                                        href={form.instagram.startsWith('http') ? form.instagram : `https://${form.instagram}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-brand-400"
                                    >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                    </a>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

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
                                                    href={`/agenda?eventId=${ag.extendedProps.googleEventId}`}
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
                                Todas concluidas
                            </span>
                        )}
                    </h4>

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
                                    "text-xs flex-1 min-w-0 break-words",
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
        );
    }

    // =============================================
    // RENDER
    // =============================================
    return (
        <div className="flex h-[calc(100vh-2rem)] -m-6 lg:-m-8 rounded-2xl overflow-hidden bg-background max-w-[1800px] mx-auto">
            {/* =================== LEFT: CLIENTE LIST =================== */}
            <div className={cn(
                "w-full md:w-[350px] md:min-w-[350px] border-r-0 md:border-r-2 border-border flex-col bg-background",
                mobileView === "list" ? "flex" : "hidden md:flex"
            )}>
                {/* Header */}
                <div className="px-4 pt-5 pb-3 shrink-0 border-b-2 border-border">
                    <h2 className="font-display text-lg font-bold text-foreground tracking-tight">
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

                    <div className="mt-2 flex items-center justify-between">
                        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                            Ordenar por:
                        </span>
                        <select
                            value={sortOrder}
                            onChange={(e) => setSortOrder(e.target.value)}
                            className="text-[11px] bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-slate-300 outline-none focus:border-brand-500 transition-colors cursor-pointer"
                        >
                            <option value="recent">Mais recente</option>
                            <option value="oldest">Mais antigo</option>
                            <option value="az">A-Z</option>
                            <option value="za">Z-A</option>
                        </select>
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
                        <div className="space-y-1.5 flex flex-col">
                            {sortedLeads.map((item) => (
                                <button
                                    key={item.telefone.toString()}
                                    onClick={() => handleSelectCliente(item.telefone.toString())}
                                    className={cn(
                                        "w-full text-left px-3 py-3 rounded-xl transition-all duration-150 border-2",
                                        selectedTelefone === item.telefone.toString()
                                            ? "bg-card border-brand-500 shadow-lg shadow-brand-500/15"
                                            : "bg-card/60 border-border/50 hover:bg-card hover:border-muted-foreground/40"
                                    )}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p
                                                    className={cn(
                                                        "text-sm font-semibold truncate",
                                                        selectedTelefone === item.telefone.toString()
                                                            ? "text-brand-400"
                                                            : "text-slate-200"
                                                    )}
                                                >
                                                    {item.nome || item.telefone}
                                                </p>
                                                {item.unreadCount > 0 && (
                                                    <span className="ml-auto min-w-[18px] h-4.5 px-1 rounded-full bg-brand-500 text-white text-[10px] font-bold flex items-center justify-center animate-in zoom-in-50">
                                                        {item.unreadCount > 99 ? '99+' : item.unreadCount}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-[11px] text-slate-400 truncate flex-1">
                                                    {item.telefone}
                                                </span>
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
                                        </div>
                                    </div>
                                    <div className="mt-2 flex justify-end h-5">
                                        {!item.iaAtiva && (
                                            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">
                                                Manual
                                            </span>
                                        )}
                                    </div>
                                </button>
                            ))}
                            {clientesList.length < totalClientes && (
                                <button
                                    onClick={loadMore}
                                    disabled={loadingMore}
                                    className="w-full mt-2 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 bg-slate-800/60 hover:bg-slate-800 rounded-xl border border-slate-700/50 transition-colors disabled:opacity-40"
                                >
                                    {loadingMore ? (
                                        <span className="flex items-center justify-center gap-1.5">
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                            Carregando...
                                        </span>
                                    ) : (
                                        `Carregar mais (${clientesList.length}/${totalClientes})`
                                    )}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* =================== CENTER: CHAT =================== */}
            <div className={cn(
                "flex-1 flex-col min-w-0 bg-background overflow-x-hidden",
                mobileView === "chat" ? "flex" : "hidden md:flex"
            )}>
                {!selectedTelefone ? (
                    // Empty state
                    <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
                        <div className="w-16 h-16 rounded-2xl bg-card flex items-center justify-center mb-4">
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
                        <div className="px-3 md:px-5 py-3.5 border-b-2 border-border shrink-0 flex items-center justify-between bg-background/80 gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                                <button
                                    onClick={() => setMobileView("list")}
                                    className="md:hidden p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors shrink-0"
                                >
                                    <ArrowLeft className="w-5 h-5" />
                                </button>
                                <div className="min-w-0">
                                    <h3 className="font-display text-base font-bold text-white truncate">
                                        {cliente.nome || "Sem nome"}
                                    </h3>
                                    <p className="text-xs text-slate-400">{cliente.telefone}</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                                {/* Mobile: details button */}
                                <button
                                    onClick={() => setMobileDetailsOpen(true)}
                                    className="md:hidden p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                                >
                                    <PanelRightOpen className="w-5 h-5" />
                                </button>

                                {/* AI Toggle */}
                                <div
                                    className={cn(
                                        "hidden md:flex items-center gap-3 px-3 py-2 rounded-xl border-2 transition-colors",
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
                        <div className="px-5 py-3 border-t-2 border-border shrink-0 bg-background/80">
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

            {/* =================== RIGHT: DETAILS (desktop) =================== */}
            <div className="hidden md:block w-[300px] min-w-[300px] border-l-2 border-border overflow-y-auto bg-background">
                {selectedTelefone && cliente ? (
                    renderClienteDetails()
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center px-6">
                        <p className="text-sm text-slate-500">
                            Selecione um cliente para ver os detalhes
                        </p>
                    </div>
                )}
            </div>

            {/* =================== MOBILE: Details Sheet =================== */}
            <Sheet open={mobileDetailsOpen} onOpenChange={setMobileDetailsOpen}>
                <SheetContent side="right" className="w-[320px] bg-background border-border overflow-y-auto p-0 md:hidden">
                    {selectedTelefone && cliente ? (
                        renderClienteDetails()
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-center px-6">
                            <p className="text-sm text-slate-500">
                                Selecione um cliente para ver os detalhes
                            </p>
                        </div>
                    )}
                </SheetContent>
            </Sheet>
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
