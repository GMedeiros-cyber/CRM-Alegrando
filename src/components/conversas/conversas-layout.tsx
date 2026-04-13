"use client";

import { useState, useEffect, useRef, useTransition, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
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
import { EmojiPickerInput } from "./emoji-picker-input";
import {
    listClientes,
    getClienteByTelefone,
    updateCliente,
    toggleIaAtiva,
    markAsRead,
    sendManualFollowup,
    sendPosPasseio,
    getPasseiosHistorico,
    addPasseioHistorico,
    deletePasseioHistorico,
    deleteCliente,
    clearClienteMessages,
    createCliente,
} from "@/lib/actions/leads";
import type { PasseioHistorico } from "@/lib/actions/leads";
import { sendMessage, sendFileMessage, uploadContactPhoto } from "@/lib/actions/messages";
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
    Camera,
    Link2,
    Paperclip,
    UserPlus,
    X,
    FileText,
    Share2,
    MapPin,
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
    inativo: "bg-[#C7D2FE]/20 text-[#37352F] dark:text-[#cbd5e1] border-[#A5B4FC] dark:border-[#4a5568]/40",
    novo: "bg-blue-500/20 text-blue-300 border-blue-500/40",
};

// =============================================
// HELPERS
// =============================================
function isRecentlyCreated(createdAt: Date | null): boolean {
    if (!createdAt) return false;
    return Date.now() - new Date(createdAt).getTime() < 60_000;
}

// =============================================
// MAIN COMPONENT
// =============================================
function formatLastMessageTime(date: Date | null): string {
    if (!date) return "";
    const now = new Date();
    const d = new Date(date);

    // Comparar dias-calendário no timezone local (não ms brutos)
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dMidnight    = new Date(d.getFullYear(),   d.getMonth(),   d.getDate());
    const diffDays = Math.round(
        (todayMidnight.getTime() - dMidnight.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays === 0) {
        return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    }
    if (diffDays === 1) return "Ontem";
    if (diffDays <= 6) {
        const dias = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
        return dias[d.getDay()];
    }
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

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
    const [isSendingMessage, startSendingMessage] = useTransition();
    const [isSavingCliente, startSavingCliente] = useTransition();
    const [isRunningAction, startRunningAction] = useTransition();
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
        endereco: "",
        kanbanColumnId: "",
        ultimoPasseio: "",
        followupDias: 45,
        followupHora: "09:00",
        followupAtivo: false,
        followupEnviado: false,
        followupEnviadoEm: "",
        posPasseioAtivo: false,
        posPasseioEnviado: false,
        posPasseioEnviadoEm: "",
    });

    const [posPasseioLink, setPosPasseioLink] = useState("");

    // Chat
    const [chatMessage, setChatMessage] = useState("");
    const addOptimisticRef = useRef<((content: string, senderName?: string) => void) | null>(null);
    const [replyTo, setReplyTo] = useState<import("@/lib/actions/leads").LeadMessage | null>(null);

    // Tasks
    const [tasks, setTasks] = useState<TaskItem[]>([]);
    const [newTaskText, setNewTaskText] = useState("");

    // Kanban columns (para dropdown status)
    const [kanbanColumns, setKanbanColumns] = useState<KanbanColumn[]>([]);

    // Agendamentos
    const [agendamentos, setAgendamentos] = useState<AgendamentoEvent[]>([]);
    const [loadingAgendamentos, setLoadingAgendamentos] = useState(false);

    const [sortOrder, setSortOrder] = useState<string>("recent");
    const [canalFiltro, setCanalFiltro] = useState<"todos" | "alegrando" | "festas">(() => {
        if (typeof window !== "undefined") {
            return (localStorage.getItem("crm_canal_filtro") as "todos" | "alegrando" | "festas") || "todos";
        }
        return "todos";
    });
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

    // Danger zone confirmations
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const [confirmingClearMessages, setConfirmingClearMessages] = useState(false);

    // New lead modal
    const [showNewLeadModal, setShowNewLeadModal] = useState(false);
    const [newLeadForm, setNewLeadForm] = useState({ telefone: "", nome: "" });
    const [newLeadCanal, setNewLeadCanal] = useState<"alegrando" | "festas">("alegrando");
    const [newLeadPhoto, setNewLeadPhoto] = useState<{ file: File; preview: string } | null>(null);
    const newLeadPhotoRef = useRef<HTMLInputElement>(null);
    const [isCreatingLead, startCreatingLead] = useTransition();

    // File attachments (preview before send)
    const [attachments, setAttachments] = useState<Array<{
        file: File;
        preview: string | null;
        caption: string;
        id: string;
    }>>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const firstCaptionRef = useRef<HTMLTextAreaElement>(null);

    // NOVO badge ticker
    const [tick, setTick] = useState(0);

    // Auto-hide toast
    useEffect(() => {
        if (toast) {
            const t = setTimeout(() => setToast(null), 3000);
            return () => clearTimeout(t);
        }
    }, [toast]);

    // Ticker for NOVO badge auto-dismiss
    useEffect(() => {
        const hasRecent = clientesList.some(
            c => c.statusAtendimento === "novo" && isRecentlyCreated(c.createdAt)
        );
        if (!hasRecent) return;
        const interval = setInterval(() => setTick(t => t + 1), 10_000);
        return () => clearInterval(interval);
    }, [clientesList, tick]);

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

    // Filtro por canal
    const clientesFiltrados = canalFiltro === "todos"
        ? sortedLeads
        : sortedLeads.filter(c => c.canal === canalFiltro);

    // Load clientes list (page 1)
    const loadList = useCallback(async () => {
        try {
            const result = await listClientes({ search: searchTerm || undefined, page: 1, limit: CLIENTES_LIMIT });
            setClientesList(result.data);
            setTotalClientes(result.total);
        } catch (err) {
            console.error("[conversas] Erro ao carregar lista:", err);
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
        } catch (err) {
            console.error("[conversas] Erro ao carregar mais:", err);
        } finally {
            setLoadingMore(false);
        }
    }

    useEffect(() => {
        loadList();
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
                getKanbanColumns(clienteData.canal ?? "alegrando").then(setKanbanColumns);
                setForm({
                    nome: clienteData.nome || "",
                    email: clienteData.email || "",
                    cpf: clienteData.cpf || "",
                    status: clienteData.status || "",
                    linkedin: clienteData.linkedin || "",
                    facebook: clienteData.facebook || "",
                    instagram: clienteData.instagram || "",
                    endereco: clienteData.endereco || "",
                    kanbanColumnId: clienteData.kanbanColumnId || "",
                    ultimoPasseio: clienteData.ultimoPasseio || "",
                    followupDias: clienteData.followupDias ?? 45,
                    followupHora: clienteData.followupHora || "09:00",
                    followupAtivo: clienteData.followupAtivo ?? false,
                    followupEnviado: clienteData.followupEnviado ?? false,
                    followupEnviadoEm: clienteData.followupEnviadoEm || "",
                    posPasseioAtivo: clienteData.posPasseioAtivo ?? false,
                    posPasseioEnviado: clienteData.posPasseioEnviado ?? false,
                    posPasseioEnviadoEm: clienteData.posPasseioEnviadoEm || "",
                });

                setPosPasseioLink("");

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
            setReplyTo(null);
            router.push(`/conversas?telefone=${telefone}`, { scroll: false });

            // Marcar como lida localmente e no banco
            try {
                await markAsRead(telefone);
                setClientesList((prev) =>
                    prev.map((c) =>
                        String(c.telefone) === String(telefone) ? { ...c, unreadCount: 0 } : c
                    )
                );
            } catch (err) {
                console.error("[conversas] Erro ao marcar como lida:", err);
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
        const url = val.trim();
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

        startSavingCliente(async () => {
            try {
                await updateCliente(selectedTelefone, {
                    nome: form.nome || null,
                    email: form.email || null,
                    cpf: form.cpf || null,
                    status: form.status || null,
                    linkedin,
                    facebook,
                    instagram,
                    endereco: form.endereco || null,
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
        startSavingCliente(async () => {
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
        const currentReply = replyTo;
        setChatMessage("");
        setReplyTo(null);
        addOptimisticRef.current?.(text, cliente.canal === "festas" ? "Márcia" : "Equipe");

        (async () => {
            try {
                if (currentReply) {
                    const { replyToMessage } = await import("@/lib/actions/messages");
                    await replyToMessage({
                        telefone: cliente.telefone,
                        text,
                        senderName: cliente.canal === "festas" ? "Márcia" : "Equipe",
                        iaAtiva: cliente.iaAtiva,
                        replyToZapiId: currentReply.zapiMessageId ?? null,
                        replyToContent: currentReply.content,
                        replyToSenderName: currentReply.senderName ?? null,
                    });
                } else {
                    await sendMessage({
                        telefone: cliente.telefone,
                        mensagem: text,
                        sender_name: cliente.canal === "festas" ? "Márcia" : "Equipe",
                        iaAtiva: cliente.iaAtiva,
                    });
                }
            } catch (err) {
                setToast({ type: "error", text: `Erro ao enviar: ${err}` });
            }
        })();
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

    async function handleDeleteCliente() {
        if (!selectedTelefone) return;
        startRunningAction(async () => {
            const result = await deleteCliente(selectedTelefone);
            if (result.success) {
                setSelectedTelefone(null);
                setCliente(null);
                setMobileView("list");
                setConfirmingDelete(false);
                loadList();
                setToast({ type: "success", text: "Cliente excluído." });
            } else {
                setToast({ type: "error", text: result.error || "Erro ao excluir." });
            }
        });
    }

    async function handleClearMessages() {
        if (!selectedTelefone) return;
        startRunningAction(async () => {
            const result = await clearClienteMessages(selectedTelefone);
            if (result.success) {
                setConfirmingClearMessages(false);
                setToast({ type: "success", text: "Conversas apagadas." });
            } else {
                setToast({ type: "error", text: result.error || "Erro ao limpar." });
            }
        });
    }

    // ========= New Lead handler =========
    function handleCreateLead() {
        const tel = newLeadForm.telefone.replace(/\D/g, "").trim();
        if (!tel || tel.length < 8) {
            setToast({ type: "error", text: "Telefone inválido." });
            return;
        }
        startCreatingLead(async () => {
            try {
                let fotoUrl: string | null = null;

                // Upload photo via server action if selected
                if (newLeadPhoto) {
                    const fd = new FormData();
                    fd.append("file", newLeadPhoto.file);
                    fd.append("telefone", tel);
                    const uploadResult = await uploadContactPhoto(fd);
                    if (uploadResult.success && uploadResult.url) {
                        fotoUrl = uploadResult.url;
                    } else {
                        setToast({ type: "error", text: `Foto não salva: ${uploadResult.error || "erro desconhecido"}` });
                    }
                }

                await createCliente({
                    telefone: tel,
                    nome: newLeadForm.nome.trim() || null,
                    fotoUrl,
                    canal: newLeadCanal,
                });
                setShowNewLeadModal(false);
                setNewLeadForm({ telefone: "", nome: "" });
                setNewLeadCanal("alegrando");
                setNewLeadPhoto(null);
                setToast({ type: "success", text: "Lead criado com sucesso!" });
                loadList();
                handleSelectCliente(tel);
            } catch (err) {
                setToast({ type: "error", text: `Erro ao criar lead: ${err}` });
            }
        });
    }

    // ========= File select handler (preview before send) =========
    function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
        const files = Array.from(e.target.files || []);
        const maxSize = 10 * 1024 * 1024;
        for (const file of files) {
            if (file.size > maxSize) {
                setToast({ type: "error", text: `"${file.name}" é muito grande. Máximo 10MB.` });
                return;
            }
        }
        const newAttachments = files.map(file => ({
            file,
            preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
            caption: "",
            id: Date.now().toString() + Math.random().toString(36).slice(2),
        }));
        setAttachments(prev => [...prev, ...newAttachments]);
        e.target.value = "";
        // Auto-focus the caption of the first new attachment
        setTimeout(() => firstCaptionRef.current?.focus(), 50);
    }

    // ========= Send attachments handler =========
    function handleSendAttachments() {
        if (!cliente?.telefone || attachments.length === 0) return;
        (async () => {
            for (const att of attachments) {
                try {
                    const formData = new FormData();
                    formData.append("file", att.file);
                    formData.append("telefone", cliente.telefone);
                    formData.append("sender_name", cliente.canal === "festas" ? "Márcia" : "Equipe");
                    formData.append("caption", att.caption);
                    const res = await sendFileMessage(formData);
                    if (!res.success) {
                        setToast({ type: "error", text: res.error || "Erro ao enviar arquivo." });
                    }
                } catch (err) {
                    setToast({ type: "error", text: `Erro ao enviar arquivo: ${err}` });
                }
            }
            setAttachments([]);
        })();
    }

    // =============================================
    // SHARED DETAILS PANEL (desktop + mobile sheet)
    // =============================================
    function renderClienteDetails() {
        if (!selectedTelefone || !cliente) return null;
        return (
            <div className="p-4 space-y-4">
                {/* Section title */}
                <div className="pb-3 mb-1 border-b border-[#C7D2FE] dark:border-[#3d4a60]/70">
                    <div className="flex items-center gap-2">
                        <div className="w-1 h-5 rounded-full bg-brand-500" />
                        <h3 className="text-sm font-bold text-[#191918] dark:text-white tracking-tight">
                            Detalhes do Cliente
                        </h3>
                    </div>
                </div>

                {/* AI Toggle — only for alegrando */}
                {cliente.canal !== "festas" && (
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
                )}

                {/* Fields */}
                <div className="space-y-3">
                    <FieldGroup icon={<User className="w-3 h-3" />} label="Nome">
                        <Input
                            value={form.nome}
                            onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                            onBlur={handleSave}
                            placeholder="Nome do cliente"
                            className="rounded-lg h-8 text-sm bg-[#EEF2FF] dark:bg-[#1e2536] border-[#A5B4FC] dark:border-[#4a5568] text-[#191918] dark:text-white placeholder:text-[#6366F1] dark:text-[#94a3b8]"
                        />
                    </FieldGroup>

                    <FieldGroup icon={<Phone className="w-3 h-3" />} label="Telefone">
                        <Input
                            value={cliente.telefone}
                            disabled
                            className="rounded-lg h-8 text-sm bg-[#EEF2FF] dark:bg-[#1e2536]/50 border-[#C7D2FE] dark:border-[#3d4a60] text-[#191918] dark:text-white font-medium cursor-not-allowed"
                        />
                    </FieldGroup>

                    {cliente.canal !== "festas" && (
                        <FieldGroup icon={<MapPin className="w-3 h-3" />} label="Endereço">
                            <Input
                                value={form.endereco}
                                onChange={(e) => setForm((f) => ({ ...f, endereco: e.target.value }))}
                                onBlur={handleSave}
                                placeholder="Rua, número, bairro, cidade"
                                className="rounded-lg h-8 text-sm bg-[#EEF2FF] dark:bg-[#1e2536] border-[#A5B4FC] dark:border-[#4a5568] text-[#191918] dark:text-white placeholder:text-[#6366F1] dark:text-[#94a3b8]"
                            />
                        </FieldGroup>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                        <FieldGroup label="Email">
                            <Input
                                value={form.email}
                                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                                onBlur={handleSave}
                                placeholder="email@exemplo.com"
                                className="rounded-lg h-8 text-sm bg-[#EEF2FF] dark:bg-[#1e2536] border-[#A5B4FC] dark:border-[#4a5568] text-[#191918] dark:text-white placeholder:text-[#6366F1] dark:text-[#94a3b8]"
                            />
                        </FieldGroup>
                        <FieldGroup label="CPF">
                            <Input
                                value={form.cpf}
                                onChange={(e) => setForm((f) => ({ ...f, cpf: e.target.value }))}
                                onBlur={handleSave}
                                placeholder="000.000.000-00"
                                className="rounded-lg h-8 text-sm bg-[#EEF2FF] dark:bg-[#1e2536] border-[#A5B4FC] dark:border-[#4a5568] text-[#191918] dark:text-white placeholder:text-[#6366F1] dark:text-[#94a3b8]"
                            />
                        </FieldGroup>
                    </div>

                    <FieldGroup label="Status (Kanban)">
                        <Select
                            value={form.kanbanColumnId}
                            onValueChange={(val) => {
                                setForm((f) => ({ ...f, kanbanColumnId: val }));
                                if (selectedTelefone) {
                                    startSavingCliente(async () => {
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
                            <SelectTrigger className="rounded-lg h-8 text-sm bg-[#EEF2FF] dark:bg-[#1e2536] border-[#A5B4FC] dark:border-[#4a5568] text-[#191918] dark:text-white">
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

                    {cliente.canal !== "festas" && (
                    <FieldGroup label="Último Passeio">
                        <p className="text-sm text-[#191918] dark:text-white px-1 h-8 flex items-center">
                            {form.ultimoPasseio
                                ? new Date(form.ultimoPasseio + "T00:00:00").toLocaleDateString("pt-BR")
                                : "Nenhum passeio registrado"}
                        </p>
                    </FieldGroup>
                    )}

                    {/* Histórico de Passeios */}
                    {cliente.canal !== "festas" && <div className="pt-2 border-t border-[#C7D2FE] dark:border-[#3d4a60]/60">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-1.5">
                                <MapPin className="w-3.5 h-3.5 text-brand-400/70" />
                                <h4 className="text-xs font-semibold text-[#37352F] dark:text-[#cbd5e1] tracking-tight">
                                    Histórico de Passeios
                                </h4>
                                {passeiosHistorico.length > 0 && (
                                    <span className="text-[10px] bg-[#E0E7FF] dark:bg-[#2d3347]/80 text-[#6366F1] dark:text-[#94a3b8] px-1.5 py-0.5 rounded-full font-medium">
                                        {passeiosHistorico.length}
                                    </span>
                                )}
                            </div>
                            <button
                                onClick={() => setAddingPasseio(!addingPasseio)}
                                className="text-[10px] font-semibold text-brand-400 hover:text-brand-300 transition-colors"
                            >
                                {addingPasseio ? "Cancelar" : "+ Registrar"}
                            </button>
                        </div>

                        {/* Formulário de adicionar passeio */}
                        {addingPasseio && (
                            <div className="space-y-2 mb-3 p-2 rounded-lg bg-[#EEF2FF] dark:bg-[#1e2536]/60 border border-[#C7D2FE] dark:border-[#3d4a60]">
                                <Input
                                    value={novoPasseioDestino}
                                    onChange={(e) => setNovoPasseioDestino(e.target.value)}
                                    placeholder="Ex: Passeio Sítio do Carroção"
                                    className="rounded-lg h-8 text-sm bg-[#F7F7F5] dark:bg-[#0f1829] border-[#A5B4FC] dark:border-[#4a5568] text-[#191918] dark:text-white placeholder:text-[#6366F1] dark:text-[#94a3b8]"
                                />
                                <DatePicker
                                    value={novoPasseioData}
                                    onChange={(v) => setNovoPasseioData(v)}
                                    placeholder="Data do passeio"
                                    className="w-full rounded-lg"
                                />
                                <button
                                    onClick={handleAddPasseio}
                                    disabled={!novoPasseioDestino || !novoPasseioData || isSavingCliente}
                                    className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500 text-[#191918] dark:text-white text-xs font-semibold hover:bg-brand-600 disabled:opacity-40 transition-colors"
                                >
                                    <Save className="w-3 h-3" />
                                    Salvar Passeio
                                </button>
                            </div>
                        )}

                        {/* Lista de passeios */}
                        {passeiosHistorico.length === 0 ? (
                            <p className="text-xs text-[#9B9A97] dark:text-[#64748b] italic">Nenhum passeio registrado.</p>
                        ) : (
                            <div className="space-y-1.5 max-h-[150px] overflow-y-auto">
                                {passeiosHistorico.map((p) => (
                                    <div
                                        key={p.id}
                                        className="group/passeio flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-[#EEF2FF] dark:hover:bg-[#1e2536]/60 transition-colors"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs text-[#191918] dark:text-white font-medium truncate">{p.destino}</p>
                                            <p className="text-[10px] text-[#6366F1] dark:text-[#94a3b8]">
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
                    </div>}

                    {/* Follow-up */}
                    {cliente.canal !== "festas" && <FieldGroup label="Follow-up ativo">
                        <div className="flex items-center h-8">
                            <Switch
                                checked={form.followupAtivo}
                                onCheckedChange={(checked) => {
                                    setForm((f) => ({ ...f, followupAtivo: checked }));
                                    if (selectedTelefone) {
                                        startSavingCliente(async () => {
                                            try {
                                                await updateCliente(selectedTelefone, { followupAtivo: checked });
                                                setToast({ type: "success", text: checked ? "Follow-up ativado!" : "Follow-up desativado!" });
                                                loadList();
                                            } catch {
                                                setToast({ type: "error", text: "Erro ao atualizar follow-up" });
                                            }
                                        });
                                    }
                                }}
                                className="data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-[#C7D2FE]"
                            />
                        </div>
                    </FieldGroup>}

                    {cliente.canal !== "festas" && form.followupAtivo && (
                        <>
                            <div className="grid grid-cols-2 gap-2">
                                <FieldGroup label="Follow-up (dias)">
                                    <Input
                                        type="number"
                                        min={1}
                                        value={form.followupDias}
                                        onChange={(e) => setForm((f) => ({ ...f, followupDias: parseInt(e.target.value) || 45 }))}
                                        onBlur={handleSave}
                                        className="rounded-lg h-8 text-sm bg-[#EEF2FF] dark:bg-[#1e2536] border-[#A5B4FC] dark:border-[#4a5568] text-[#191918] dark:text-white"
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
                                <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#EEF2FF] dark:bg-[#1e2536]/60 border border-[#C7D2FE] dark:border-[#3d4a60]">
                                    <span className="text-xs text-[#6366F1] dark:text-[#94a3b8]">
                                        ✅ Enviado {form.followupEnviadoEm
                                            ? `em ${new Date(form.followupEnviadoEm).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às ${new Date(form.followupEnviadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                                            : ""}
                                    </span>
                                    <button
                                        onClick={() => {
                                            if (!selectedTelefone) return;
                                            startRunningAction(async () => {
                                                try {
                                                    await updateCliente(selectedTelefone, { followupAtivo: false });
                                                    setForm(f => ({ ...f, followupAtivo: false, followupEnviado: false, followupEnviadoEm: "" }));
                                                    setToast({ type: "success", text: "Follow-up resetado." });
                                                    loadList();
                                                } catch {
                                                    setToast({ type: "error", text: "Erro ao resetar follow-up" });
                                                }
                                            });
                                        }}
                                        disabled={isRunningAction}
                                        className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#E0E7FF] dark:bg-[#2d3347] text-[#6366F1] dark:text-[#94a3b8] hover:text-[#191918] dark:hover:text-white hover:bg-[#C7D2FE] dark:hover:bg-[#3d4a60] transition-colors"
                                    >
                                        Resetar
                                    </button>
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
                                        startRunningAction(async () => {
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
                                    disabled={isRunningAction}
                                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-brand-500/15 text-brand-400 text-xs font-semibold hover:bg-brand-500/25 border border-brand-500/30 transition-colors disabled:opacity-40"
                                >
                                    {isRunningAction ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                        <Send className="w-3.5 h-3.5" />
                                    )}
                                    Enviar Follow-up Agora
                                </button>
                            )}
                        </>
                    )}

                    {cliente.canal !== "festas" && <div className="my-2 border-t border-[#C7D2FE] dark:border-[#3d4a60]/50" />}

                    {/* Pós-Passeio */}
                    {cliente.canal !== "festas" && (<>
                    <FieldGroup label="Pós-Passeio (Fotos)">
                        <div className="flex items-center h-8">
                            <Switch
                                checked={form.posPasseioAtivo}
                                onCheckedChange={(checked) => {
                                    setForm((f) => ({ ...f, posPasseioAtivo: checked }));
                                    if (selectedTelefone) {
                                        startSavingCliente(async () => {
                                            try {
                                                await updateCliente(selectedTelefone, { posPasseioAtivo: checked });
                                                setToast({ type: "success", text: checked ? "Pós-Passeio ativado!" : "Pós-Passeio desativado!" });
                                                loadList();
                                                if (!checked) setPosPasseioLink("");
                                            } catch {
                                                setToast({ type: "error", text: "Erro ao atualizar pós-passeio" });
                                            }
                                        });
                                    }
                                }}
                                className="data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-[#C7D2FE]"
                            />
                        </div>
                    </FieldGroup>

                    {form.posPasseioAtivo && (
                        <div className="flex flex-col gap-2 p-3 bg-[#F0F4FF] dark:bg-[#1e2536] rounded-xl border border-[#C7D2FE] dark:border-[#3d4a60]/50 relative overflow-hidden">
                            {/* Ícone de fundo */}
                            <Camera className="absolute -right-4 -top-4 w-24 h-24 text-[#9B9A97] dark:text-[#64748b]/50 pointer-events-none" />

                            {!form.posPasseioEnviado ? (
                                <>
                                    <div className="flex flex-col gap-2 z-10">
                                        <Label className="text-[10px] text-[#6366F1] dark:text-[#94a3b8]">Link das Fotos</Label>
                                        <Input
                                            type="url"
                                            value={posPasseioLink}
                                            onChange={(e) => setPosPasseioLink(e.target.value)}
                                            placeholder="https://..."
                                            className="h-8 text-xs bg-[#EEF2FF] dark:bg-[#1e2536] border-[#A5B4FC] dark:border-[#4a5568] focus:border-emerald-500/50 transition-colors"
                                        />
                                        <button
                                            disabled={isRunningAction || !posPasseioLink.trim()}
                                            onClick={() => {
                                                if (!selectedTelefone || !posPasseioLink.trim()) return;
                                                startRunningAction(async () => {
                                                    try {
                                                        const result = await sendPosPasseio(selectedTelefone, posPasseioLink);
                                                        if (result.success) {
                                                            setToast({ type: "success", text: "Mensagem de fotos enviada!" });
                                                            setForm(f => ({ ...f, posPasseioEnviado: true, posPasseioEnviadoEm: new Date().toISOString() }));
                                                            loadList();
                                                        } else {
                                                            setToast({ type: "error", text: result.error || "Erro ao enviar." });
                                                        }
                                                    } catch {}
                                                });
                                            }}
                                            className="flex items-center justify-center gap-2 h-8 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-[#191918] dark:text-white font-medium transition-all disabled:opacity-50 disabled:hover:bg-emerald-600 text-xs shadow-sm mt-1"
                                        >
                                            <Link2 className="w-3.5 h-3.5" />
                                            {isRunningAction ? "Enviando..." : "Enviar Link"}
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <div className="flex items-center justify-between z-10">
                                    <div className="flex flex-col gap-1">
                                        <span className="text-xs text-[#37352F] dark:text-[#cbd5e1] font-medium flex items-center gap-1.5">
                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                            Enviadas
                                        </span>
                                        <span className="text-[10px] text-[#6366F1] dark:text-[#94a3b8]">
                                            {form.posPasseioEnviadoEm ? new Date(form.posPasseioEnviadoEm).toLocaleString("pt-BR") : "Data desconhecida"}
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => {
                                            if (!selectedTelefone) return;
                                            startRunningAction(async () => {
                                                try {
                                                    await updateCliente(selectedTelefone, { posPasseioAtivo: false });
                                                    setForm(f => ({ ...f, posPasseioAtivo: false, posPasseioEnviado: false, posPasseioEnviadoEm: "" }));
                                                    setPosPasseioLink("");
                                                    loadList();
                                                } catch {
                                                    setToast({ type: "error", text: "Erro ao resetar pós-passeio" });
                                                }
                                            });
                                        }}
                                        disabled={isRunningAction}
                                        className="text-[10px] font-medium px-2 py-1 rounded border border-[#A5B4FC] dark:border-[#4a5568] text-[#37352F] dark:text-[#cbd5e1] hover:text-[#191918] dark:hover:text-white hover:bg-[#E0E7FF] dark:hover:bg-[#2d3347] transition-colors"
                                    >
                                        Novo Envio
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                    </>)}

                    {/* Redes Sociais */}
                    <div className="pt-2">
                        <div className="flex items-center gap-1.5 mb-2">
                            <Share2 className="w-3.5 h-3.5 text-brand-400/70" />
                            <h4 className="text-xs font-semibold text-[#37352F] dark:text-[#cbd5e1] tracking-tight">
                                Redes Sociais
                            </h4>
                        </div>
                        <div className="space-y-2">
                            <div className="relative">
                                <Input
                                    value={form.linkedin}
                                    onChange={(e) => setForm((f) => ({ ...f, linkedin: e.target.value }))}
                                    onBlur={handleSave}
                                    placeholder="https://linkedin.com/in/..."
                                    className="rounded-lg h-8 pr-8 text-sm bg-[#EEF2FF] dark:bg-[#1e2536] border-[#A5B4FC] dark:border-[#4a5568] text-[#191918] dark:text-white placeholder:text-[#6366F1] dark:text-[#94a3b8]"
                                />
                                {form.linkedin && (
                                    <a
                                        href={form.linkedin.startsWith('http') ? form.linkedin : `https://${form.linkedin}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6366F1] dark:text-[#94a3b8] hover:text-brand-400"
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
                                    className="rounded-lg h-8 pr-8 text-sm bg-[#EEF2FF] dark:bg-[#1e2536] border-[#A5B4FC] dark:border-[#4a5568] text-[#191918] dark:text-white placeholder:text-[#6366F1] dark:text-[#94a3b8]"
                                />
                                {form.facebook && (
                                    <a
                                        href={form.facebook.startsWith('http') ? form.facebook : `https://${form.facebook}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6366F1] dark:text-[#94a3b8] hover:text-brand-400"
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
                                    className="rounded-lg h-8 pr-8 text-sm bg-[#EEF2FF] dark:bg-[#1e2536] border-[#A5B4FC] dark:border-[#4a5568] text-[#191918] dark:text-white placeholder:text-[#6366F1] dark:text-[#94a3b8]"
                                />
                                {form.instagram && (
                                    <a
                                        href={form.instagram.startsWith('http') ? form.instagram : `https://${form.instagram}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6366F1] dark:text-[#94a3b8] hover:text-brand-400"
                                    >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                    </a>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Agendamentos */}
                {cliente.canal !== "festas" && <div className="pt-4 border-t border-[#C7D2FE] dark:border-[#3d4a60]/60">
                    <div className="flex items-center gap-1.5 mb-3">
                        <CalendarDays className="w-3.5 h-3.5 text-brand-400/70" />
                        <h4 className="text-xs font-semibold text-[#37352F] dark:text-[#cbd5e1] tracking-tight flex-1">
                            Agendamentos
                        </h4>
                        {agendamentos.length > 0 && (
                            <span className="text-[10px] bg-[#E0E7FF] dark:bg-[#2d3347]/80 text-[#6366F1] dark:text-[#94a3b8] px-1.5 py-0.5 rounded-full font-medium">
                                {agendamentos.length}
                            </span>
                        )}
                    </div>

                    {loadingAgendamentos ? (
                        <div className="flex justify-center py-3">
                            <Loader2 className="w-4 h-4 animate-spin text-[#6366F1] dark:text-[#94a3b8]" />
                        </div>
                    ) : agendamentos.length === 0 ? (
                        <p className="text-xs text-[#9B9A97] dark:text-[#64748b] italic">Nenhum agendamento vinculado.</p>
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
                                        className="group/ag rounded-xl border border-[#C7D2FE] dark:border-[#3d4a60] bg-[#EEF2FF] dark:bg-[#1e2536]/60 p-3 hover:border-[#A5B4FC] dark:hover:border-[#4a5568] transition-colors"
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-semibold text-[#191918] dark:text-white truncate">{ag.title}</p>
                                                <div className="flex items-center gap-1 mt-1 text-[11px] text-[#6366F1] dark:text-[#94a3b8]">
                                                    <CalendarDays className="w-3 h-3 shrink-0" />
                                                    <span>{dateStr}</span>
                                                </div>
                                                <div className="flex items-center gap-1 text-[11px] text-[#6366F1] dark:text-[#94a3b8]">
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
                                                    className="p-1.5 rounded-lg bg-[#E0E7FF] dark:bg-[#2d3347] text-[#6366F1] dark:text-[#94a3b8] hover:text-[#191918] dark:hover:text-white hover:bg-[#C7D2FE] dark:hover:bg-[#3d4a60] transition-colors"
                                                    title="Ver na Agenda"
                                                >
                                                    <ExternalLink className="w-3 h-3" />
                                                </a>
                                                <button
                                                    onClick={() => handleDeleteAgendamento(ag.extendedProps.googleEventId)}
                                                    className="p-1.5 rounded-lg bg-[#E0E7FF] dark:bg-[#2d3347] text-[#6366F1] dark:text-[#94a3b8] hover:text-red-400 hover:bg-red-500/10 transition-colors"
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
                </div>}

                {/* Tarefas */}
                <div className="pt-4 border-t border-[#C7D2FE] dark:border-[#3d4a60]/60">
                    <div className="flex items-center gap-1.5 mb-3">
                        <ListTodo className="w-3.5 h-3.5 text-brand-400/70" />
                        <h4 className="text-xs font-semibold text-[#37352F] dark:text-[#cbd5e1] tracking-tight flex-1">
                            Tarefas
                        </h4>
                        {pendingTasks.length > 0 && (
                            <span className="text-[10px] bg-[#E0E7FF] dark:bg-[#2d3347]/80 text-[#6366F1] dark:text-[#94a3b8] px-1.5 py-0.5 rounded-full font-medium">
                                {pendingTasks.length} pendentes
                            </span>
                        )}
                        {allTasksDone && (
                            <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full font-medium">
                                Todas concluídas
                            </span>
                        )}
                    </div>

                    {tasks.length > 0 && (
                        <div className="flex items-center gap-2 mb-3">
                            <div className="flex-1 h-1.5 bg-[#E0E7FF] dark:bg-[#2d3347] rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-brand-500 rounded-full transition-all duration-300"
                                    style={{ width: `${(doneTasks.length / tasks.length) * 100}%` }}
                                />
                            </div>
                            <span className="text-[10px] text-[#6366F1] dark:text-[#94a3b8] shrink-0">
                                {doneTasks.length}/{tasks.length}
                            </span>
                        </div>
                    )}

                    <div className="space-y-1.5">
                        {sortedTasks.map((task) => (
                            <div key={task.id} className="group/task flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[#EEF2FF] dark:hover:bg-[#1e2536]/60 transition-colors">
                                <button
                                    onClick={() => handleToggleTask(task.id)}
                                    className={cn(
                                        "w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                                        task.done
                                            ? "bg-brand-500 border-brand-500"
                                            : "border-[#A5B4FC] dark:border-[#4a5568] hover:border-[#6366F1]"
                                    )}
                                >
                                    {task.done && (
                                        <svg className="w-2.5 h-2.5 text-[#191918] dark:text-white" viewBox="0 0 12 12" fill="none">
                                            <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    )}
                                </button>
                                <span className={cn(
                                    "text-xs flex-1 min-w-0 break-words",
                                    task.done ? "text-[#9B9A97] dark:text-[#64748b] line-through" : "text-[#37352F] dark:text-[#cbd5e1]"
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
                            className="flex-1 bg-[#EEF2FF] dark:bg-[#1e2536] border border-[#C7D2FE] dark:border-[#3d4a60] rounded-lg px-2 py-1.5 text-xs text-[#191918] dark:text-white placeholder:text-[#9B9A97] dark:placeholder:text-[#94a3b8] outline-none focus:ring-1 focus:ring-brand-400 focus:border-brand-400"
                        />
                        {newTaskText.trim() && (
                            <button
                                onClick={handleAddTask}
                                className="p-1.5 rounded-lg bg-brand-500 text-[#191918] dark:text-white hover:bg-brand-600 transition-colors shrink-0"
                            >
                                <Plus className="w-3 h-3" />
                            </button>
                        )}
                    </div>

                    {tasks.length === 0 && (
                        <p className="text-xs text-[#9B9A97] dark:text-[#64748b] italic mt-2">
                            Nenhuma tarefa criada ainda.
                        </p>
                    )}
                </div>

                {/* Zona de Perigo */}
                <div className="pt-4 border-t border-red-500/20">
                    <div className="flex items-center gap-1.5 mb-3">
                        <div className="w-1 h-4 rounded-full bg-red-500/50" />
                        <h4 className="text-xs font-semibold text-red-400/80 tracking-tight">
                            Zona de Perigo
                        </h4>
                    </div>

                    {/* Limpar conversas */}
                    {confirmingClearMessages ? (
                        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 mb-2">
                            <p className="text-xs text-amber-400 font-medium mb-2">Apagar todo o histórico de mensagens?</p>
                            <div className="flex gap-2">
                                <button onClick={handleClearMessages} disabled={isRunningAction}
                                    className="flex-1 px-2 py-1.5 rounded-lg bg-amber-500 text-[#191918] dark:text-white text-xs font-semibold hover:bg-amber-600 transition-colors disabled:opacity-40">
                                    Confirmar
                                </button>
                                <button onClick={() => setConfirmingClearMessages(false)}
                                    className="flex-1 px-2 py-1.5 rounded-lg bg-[#E0E7FF] dark:bg-[#2d3347] text-[#191918] dark:text-white text-xs font-semibold hover:bg-[#C7D2FE] dark:hover:bg-[#3d4a60] transition-colors">
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button onClick={() => setConfirmingClearMessages(true)}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 text-amber-400 text-xs font-semibold hover:bg-amber-500/20 border border-amber-500/20 transition-colors mb-2">
                            <Trash2 className="w-3.5 h-3.5" />
                            Limpar histórico de conversas
                        </button>
                    )}

                    {/* Excluir cliente */}
                    {confirmingDelete ? (
                        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30">
                            <p className="text-xs text-red-400 font-medium mb-2">Excluir cliente permanentemente? Isso apaga todos os dados.</p>
                            <div className="flex gap-2">
                                <button onClick={handleDeleteCliente} disabled={isRunningAction}
                                    className="flex-1 px-2 py-1.5 rounded-lg bg-red-500 text-[#191918] dark:text-white text-xs font-semibold hover:bg-red-600 transition-colors disabled:opacity-40">
                                    {isRunningAction ? "Excluindo..." : "Confirmar exclusão"}
                                </button>
                                <button onClick={() => setConfirmingDelete(false)}
                                    className="flex-1 px-2 py-1.5 rounded-lg bg-[#E0E7FF] dark:bg-[#2d3347] text-[#191918] dark:text-white text-xs font-semibold hover:bg-[#C7D2FE] dark:hover:bg-[#3d4a60] transition-colors">
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button onClick={() => setConfirmingDelete(true)}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/10 text-red-400 text-xs font-semibold hover:bg-red-500/20 border border-red-500/20 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                            Excluir cliente
                        </button>
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
                "w-full md:w-[350px] md:min-w-[350px] border-r-0 md:border-r-2 border-border flex-col bg-background bento-enter",
                mobileView === "list" ? "flex" : "hidden md:flex"
            )}>
                {/* Header */}
                <div className="px-4 pt-5 pb-3 shrink-0 border-b-2 border-border">
                    <div className="flex items-center justify-between">
                        <h2 className="font-display text-lg font-bold text-foreground tracking-tight">
                            Conversas
                        </h2>
                        <button
                            onClick={() => setShowNewLeadModal(true)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-brand-500/20 text-brand-400 border border-brand-500/30 hover:bg-brand-500/30 transition-colors"
                        >
                            <UserPlus className="w-3.5 h-3.5" />
                            Novo Lead
                        </button>
                    </div>
                    <div className="relative mt-3">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6366F1] dark:text-[#94a3b8]" />
                        <Input
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Buscar por nome ou telefone..."
                            className="pl-9 rounded-xl bg-[#EEF2FF] dark:bg-[#1e2536] border-[#A5B4FC] dark:border-[#4a5568] h-9 text-sm text-[#191918] dark:text-white placeholder:text-[#6366F1] dark:text-[#94a3b8] focus:border-brand-500 focus:ring-brand-500/20"
                        />
                    </div>

                    <div className="mt-2 flex items-center justify-between">
                        <span className="text-[10px] font-semibold text-[#6366F1] dark:text-[#94a3b8] uppercase tracking-wider">
                            Ordenar por:
                        </span>
                        <select
                            value={sortOrder}
                            onChange={(e) => setSortOrder(e.target.value)}
                            className="text-[11px] bg-[#EEF2FF] dark:bg-[#1e2536] border border-[#C7D2FE] dark:border-[#3d4a60] rounded-lg px-2 py-1 text-[#37352F] dark:text-[#cbd5e1] outline-none focus:border-brand-500 transition-colors cursor-pointer"
                        >
                            <option value="recent">Mais recente</option>
                            <option value="oldest">Mais antigo</option>
                            <option value="az">A-Z</option>
                            <option value="za">Z-A</option>
                        </select>
                    </div>

                    {/* Canal filter */}
                    <div className="mt-2 flex items-center gap-1.5">
                        {(["todos", "alegrando", "festas"] as const).map((v) => (
                            <button
                                key={v}
                                onClick={() => { setCanalFiltro(v); localStorage.setItem("crm_canal_filtro", v); }}
                                className={cn(
                                    "text-[10px] font-semibold uppercase px-2.5 py-1 rounded-full border transition-colors",
                                    canalFiltro === v
                                        ? "bg-brand-500/20 text-brand-400 border-brand-500/40"
                                        : "bg-[#EEF2FF] dark:bg-[#1e2536]/40 text-[#6366F1] dark:text-[#94a3b8] border-[#C7D2FE] dark:border-[#3d4a60]/40 hover:text-[#6366F1] dark:hover:text-[#94a3b8]"
                                )}
                            >
                                {v === "todos" ? "Todos" : v === "alegrando" ? "Alegrando" : "Festas 🎉"}
                            </button>
                        ))}
                    </div>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto px-2 py-2">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="w-5 h-5 animate-spin text-[#6366F1] dark:text-[#94a3b8]" />
                        </div>
                    ) : clientesList.length === 0 ? (
                        <div className="text-center py-12 text-sm text-[#6366F1] dark:text-[#94a3b8]">
                            Nenhum cliente encontrado
                        </div>
                    ) : (
                        <div className="space-y-1.5 flex flex-col">
                            {clientesFiltrados.map((item) => (
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
                                    <div className="flex items-center gap-3">
                                        {/* Avatar */}
                                        <div className="w-9 h-9 rounded-full bg-[#E0E7FF] dark:bg-[#2d3347] shrink-0 border border-[#A5B4FC] dark:border-[#4a5568] overflow-hidden flex items-center justify-center text-sm font-bold text-[#191918] dark:text-white">
                                            {item.fotoUrl ? (
                                                <img
                                                    src={item.fotoUrl}
                                                    alt={item.nome || "avatar"}
                                                    className="w-full h-full object-cover"
                                                    onError={(e) => {
                                                        (e.currentTarget as HTMLImageElement).style.display = "none";
                                                        const fallback = e.currentTarget.parentElement;
                                                        if (fallback) fallback.textContent = (item.nome || String(item.telefone)).charAt(0).toUpperCase();
                                                    }}
                                                />
                                            ) : (
                                                (item.nome || String(item.telefone)).charAt(0).toUpperCase()
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-1">
                                                <p className={cn(
                                                    "text-sm font-bold truncate",
                                                    selectedTelefone === item.telefone.toString()
                                                        ? "text-brand-400"
                                                        : "text-[#191918] dark:text-white"
                                                )}>
                                                    {item.nome || item.telefone}
                                                </p>
                                                <span className="text-[10px] text-[#6366F1] dark:text-[#94a3b8] shrink-0 ml-auto">
                                                    {formatLastMessageTime(item.lastMessageAt)}
                                                </span>
                                                {item.unreadCount > 0 && (
                                                    <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-brand-500 text-[#191918] dark:text-white text-[10px] font-bold flex items-center justify-center shrink-0 animate-in zoom-in-50">
                                                        {item.unreadCount > 99 ? "99+" : item.unreadCount}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-[11px] font-mono text-[#191918] dark:text-white font-medium truncate mt-0.5">
                                                {item.telefone}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="mt-2 flex justify-end gap-1.5 min-h-[20px]">
                                        {item.statusAtendimento === "novo" && isRecentlyCreated(item.createdAt) && (
                                            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/40">
                                                NOVO
                                            </span>
                                        )}
                                        {!item.iaAtiva && item.canal !== "festas" && (
                                            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-orange-200 text-orange-800 border border-orange-400">
                                                Manual
                                            </span>
                                        )}
                                        {item.canal === "festas" && (
                                            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-pink-200 text-pink-800 border border-pink-400">
                                                🎉 Festas
                                            </span>
                                        )}
                                    </div>
                                </button>
                            ))}
                            {clientesList.length < totalClientes && (
                                <button
                                    onClick={loadMore}
                                    disabled={loadingMore}
                                    className="w-full mt-2 py-2 text-xs font-medium text-[#6366F1] dark:text-[#94a3b8] hover:text-[#191918] dark:hover:text-white bg-[#EEF2FF] dark:bg-[#1e2536]/60 hover:bg-[#EEF2FF] dark:hover:bg-[#1e2536] rounded-xl border border-[#C7D2FE] dark:border-[#3d4a60]/50 transition-colors disabled:opacity-40"
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
                "flex-1 flex-col min-w-0 bg-background overflow-x-hidden bento-enter [animation-delay:150ms]",
                mobileView === "chat" ? "flex" : "hidden md:flex"
            )}>
                {!selectedTelefone ? (
                    // Empty state
                    <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
                        <div className="w-16 h-16 rounded-2xl bg-card flex items-center justify-center mb-4">
                            <MessageSquare className="w-8 h-8 text-[#9B9A97] dark:text-[#64748b]" />
                        </div>
                        <h3 className="font-display text-lg font-semibold text-[#6366F1] dark:text-[#94a3b8]">
                            Selecione uma conversa
                        </h3>
                        <p className="text-sm text-[#6366F1] dark:text-[#94a3b8] mt-1 max-w-xs">
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
                                    className="md:hidden p-1.5 rounded-lg hover:bg-[#EEF2FF] dark:hover:bg-[#1e2536] text-[#6366F1] dark:text-[#94a3b8] hover:text-[#191918] dark:hover:text-white transition-colors shrink-0"
                                >
                                    <ArrowLeft className="w-5 h-5" />
                                </button>
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-10 h-10 rounded-full bg-[#E0E7FF] dark:bg-[#2d3347] shrink-0 border border-[#A5B4FC] dark:border-[#4a5568] overflow-hidden flex items-center justify-center text-sm font-bold text-[#191918] dark:text-white">
                                        {cliente.fotoUrl ? (
                                            <img
                                                src={cliente.fotoUrl}
                                                alt={cliente.nome || "avatar"}
                                                className="w-full h-full object-cover"
                                                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                                            />
                                        ) : (
                                            (cliente.nome || String(cliente.telefone)).charAt(0).toUpperCase()
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="font-display text-base font-bold text-[#191918] dark:text-white leading-tight truncate tracking-tight">
                                            {cliente.nome || "Sem nome"}
                                        </h3>
                                        <p className="text-xs text-[#191918] dark:text-white font-mono font-medium tracking-wide mt-0.5">
                                            {cliente.telefone}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                                {/* Search in conversation */}
                                <button
                                    onClick={() => window.dispatchEvent(new Event("chat-search-open"))}
                                    className="p-2 rounded-lg hover:bg-[#EEF2FF] dark:hover:bg-[#1e2536] text-[#6366F1] dark:text-[#94a3b8] hover:text-[#191918] dark:hover:text-white transition-colors"
                                    title="Buscar na conversa"
                                >
                                    <Search className="w-4 h-4" />
                                </button>

                                {/* Mobile: details button */}
                                <button
                                    onClick={() => setMobileDetailsOpen(true)}
                                    className="md:hidden p-2 rounded-lg hover:bg-[#EEF2FF] dark:hover:bg-[#1e2536] text-[#6366F1] dark:text-[#94a3b8] hover:text-[#191918] dark:hover:text-white transition-colors"
                                >
                                    <PanelRightOpen className="w-5 h-5" />
                                </button>

                                {/* AI Toggle / Festas badge */}
                                {cliente.canal === "festas" ? (
                                    <span className="inline-flex px-3 py-1.5 rounded-xl bg-pink-200 border border-pink-400 text-pink-800 text-xs font-bold">
                                        🎉 Festas
                                    </span>
                                ) : (
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
                                )}
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
                        <ChatWindow
                            telefone={cliente.telefone}
                            onReady={(fns) => { addOptimisticRef.current = fns.addOptimisticMessage; }}
                            onReply={(msg) => setReplyTo(msg)}
                        />

                        {/* Attachment preview area */}
                        {attachments.length > 0 && (
                            <div className="px-5 py-3 border-t border-border/50 bg-[#F7F7F5] dark:bg-[#0f1829]/80">
                                <div className="flex gap-3 overflow-x-auto pb-2">
                                    {attachments.map((att, idx) => (
                                        <div key={att.id}
                                            className="relative shrink-0 w-52 rounded-xl border border-[#C7D2FE] dark:border-[#3d4a60] bg-[#EEF2FF] dark:bg-[#1e2536]/80 overflow-hidden flex flex-col">
                                            <button
                                                onClick={() => setAttachments(prev => prev.filter(a => a.id !== att.id))}
                                                className="absolute top-1.5 right-1.5 z-10 w-5 h-5 rounded-full bg-[#191918]/30 text-[#191918] dark:text-white flex items-center justify-center hover:bg-black/80 transition-colors">
                                                <X className="w-3 h-3" />
                                            </button>
                                            {att.preview ? (
                                                <img src={att.preview} alt={att.file.name}
                                                    className="w-full h-28 object-cover" />
                                            ) : (
                                                <div className="w-full h-28 flex flex-col items-center justify-center gap-1 bg-[#F7F7F5] dark:bg-[#0f1829]/60">
                                                    <FileText className="w-8 h-8 text-brand-400" />
                                                    <p className="text-[10px] text-[#6366F1] dark:text-[#94a3b8] px-2 text-center truncate w-full">{att.file.name}</p>
                                                </div>
                                            )}
                                            <textarea
                                                ref={idx === 0 ? firstCaptionRef : undefined}
                                                rows={2}
                                                value={att.caption}
                                                onChange={(e) => {
                                                    const el = e.currentTarget;
                                                    el.style.height = "auto";
                                                    el.style.height = el.scrollHeight + "px";
                                                    setAttachments(prev =>
                                                        prev.map(a => a.id === att.id ? { ...a, caption: e.target.value } : a));
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter" && !e.shiftKey) {
                                                        e.preventDefault();
                                                        handleSendAttachments();
                                                    }
                                                }}
                                                placeholder="Adicionar legenda... (Enter para enviar)"
                                                className="w-full px-2 py-1.5 text-xs bg-transparent text-[#37352F] dark:text-[#cbd5e1] placeholder:text-[#6366F1] dark:text-[#94a3b8] outline-none border-t border-[#C7D2FE] dark:border-[#3d4a60]/50 resize-none leading-relaxed" />
                                        </div>
                                    ))}
                                </div>
                                <p className="text-[10px] text-[#6366F1] dark:text-[#94a3b8] mt-1">
                                    {attachments.length} arquivo{attachments.length !== 1 ? "s" : ""} — Enter na legenda ou clique em enviar
                                </p>
                            </div>
                        )}

                        {/* Reply preview */}
                        {replyTo && (
                            <div className="px-5 py-2 border-t border-border/50 bg-[#F7F7F5] dark:bg-[#0f1829]/60 flex items-center gap-2">
                                <div className="w-1 h-8 rounded-full bg-brand-500 shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-[11px] font-medium text-brand-400">
                                        Respondendo a {replyTo.senderName || (replyTo.senderType === "lead" || replyTo.senderType === "cliente" ? "Cliente" : "Equipe")}
                                    </p>
                                    <p className="text-xs text-[#6366F1] dark:text-[#94a3b8] truncate">{replyTo.content}</p>
                                </div>
                                <button
                                    onClick={() => setReplyTo(null)}
                                    className="p-1 text-[#6366F1] dark:text-[#94a3b8] hover:text-[#191918] dark:hover:text-white transition-colors shrink-0"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        )}

                        {/* Input */}
                        <div className="px-5 py-3 border-t-2 border-border shrink-0 bg-background/80">
                            <div className="flex gap-2 items-center">
                                {/* Emoji picker */}
                                <EmojiPickerInput
                                    onEmojiSelect={(emoji) => setChatMessage((prev) => prev + emoji)}
                                />
                                {/* File attachment */}
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    multiple
                                    accept="image/*,application/pdf,.doc,.docx"
                                    className="hidden"
                                    onChange={handleFileSelect}
                                />
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={cliente.iaAtiva}
                                    className={cn(
                                        "flex items-center justify-center w-10 h-10 rounded-xl transition-colors shrink-0 border",
                                        attachments.length > 0
                                            ? "bg-brand-500/20 border-brand-500/50 text-brand-400"
                                            : "hover:bg-[#EEF2FF] dark:hover:bg-[#1e2536] border-[#C7D2FE] dark:border-[#3d4a60]/50 text-[#6366F1] dark:text-[#94a3b8] hover:text-[#191918] dark:hover:text-white disabled:opacity-30"
                                    )}
                                    title="Anexar arquivo"
                                >
                                    <Paperclip className="w-4 h-4" />
                                </button>
                                <Input
                                    value={chatMessage}
                                    onChange={(e) => setChatMessage(e.target.value)}
                                    disabled={cliente.iaAtiva || attachments.length > 0}
                                    placeholder={
                                        cliente.iaAtiva
                                            ? "Pause a IA para enviar manualmente..."
                                            : attachments.length > 0
                                                ? "Adicione legenda nos arquivos acima ou clique em enviar"
                                                : "Digite uma mensagem..."
                                    }
                                    className="rounded-xl flex-1 h-10 bg-[#EEF2FF] dark:bg-[#1e2536] border-[#A5B4FC] dark:border-[#4a5568] text-[#191918] dark:text-white placeholder:text-[#6366F1] dark:text-[#94a3b8] focus:border-brand-500 focus:ring-brand-500/20"
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && !e.shiftKey && !cliente.iaAtiva && attachments.length === 0) {
                                            e.preventDefault();
                                            handleSendMessage();
                                        }
                                    }}
                                />
                                <button
                                    onClick={attachments.length > 0 ? handleSendAttachments : handleSendMessage}
                                    disabled={
                                        isSendingMessage ||
                                        cliente.iaAtiva ||
                                        (attachments.length === 0 && !chatMessage.trim())
                                    }
                                    className="flex items-center justify-center w-10 h-10 rounded-xl bg-brand-500 text-[#191918] dark:text-white hover:bg-brand-600 disabled:opacity-50 transition-colors shadow-lg shadow-brand-500/25 shrink-0"
                                >
                                    {isSendingMessage ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Send className="w-4 h-4" />
                                    )}
                                </button>
                            </div>
                            <p className="text-[10px] text-[#9B9A97] dark:text-[#64748b] mt-1.5 text-center">
                                {cliente.iaAtiva
                                    ? "IA ativa — pause para enviar mensagens manualmente"
                                    : "Enter para enviar · Clique 📎 para anexar arquivos"}
                            </p>
                        </div>
                    </>
                ) : null}
            </div>

            {/* =================== RIGHT: DETAILS (desktop) =================== */}
            <div className="hidden md:block w-[300px] min-w-[300px] border-l-2 border-border overflow-y-auto bg-background bento-enter [animation-delay:300ms]">
                {selectedTelefone && cliente ? (
                    renderClienteDetails()
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center px-6">
                        <p className="text-sm text-[#6366F1] dark:text-[#94a3b8]">
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
                            <p className="text-sm text-[#6366F1] dark:text-[#94a3b8]">
                                Selecione um cliente para ver os detalhes
                            </p>
                        </div>
                    )}
                </SheetContent>
            </Sheet>

            {/* =================== NEW LEAD MODAL =================== */}
            {showNewLeadModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#191918]/30 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-[#F7F7F5] dark:bg-[#0f1829] border-2 border-[#C7D2FE] dark:border-[#3d4a60] rounded-2xl shadow-2xl w-[380px] max-w-[90vw] p-6 animate-in zoom-in-95">
                        <div className="flex items-center justify-between mb-5">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-lg bg-brand-500/20 flex items-center justify-center">
                                    <UserPlus className="w-4 h-4 text-brand-400" />
                                </div>
                                <h3 className="font-display text-base font-bold text-[#191918] dark:text-white">
                                    Novo Lead
                                </h3>
                            </div>
                            <button
                                onClick={() => { setShowNewLeadModal(false); setNewLeadPhoto(null); setNewLeadForm({ telefone: "", nome: "" }); setNewLeadCanal("alegrando"); }}
                                className="p-1.5 rounded-lg hover:bg-[#EEF2FF] dark:hover:bg-[#1e2536] text-[#6366F1] dark:text-[#94a3b8] hover:text-[#191918] dark:hover:text-white transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Avatar picker */}
                        <div className="flex justify-center mb-4">
                            <input
                                ref={newLeadPhotoRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) setNewLeadPhoto({ file, preview: URL.createObjectURL(file) });
                                    e.target.value = "";
                                }}
                            />
                            <button
                                type="button"
                                onClick={() => newLeadPhotoRef.current?.click()}
                                className="relative w-20 h-20 rounded-full border-2 border-dashed border-[#A5B4FC] dark:border-[#4a5568] hover:border-brand-500 bg-[#EEF2FF] dark:bg-[#1e2536]/60 hover:bg-[#EEF2FF] dark:hover:bg-[#1e2536] transition-colors overflow-hidden group"
                                title="Adicionar foto"
                            >
                                {newLeadPhoto ? (
                                    <>
                                        <img src={newLeadPhoto.preview} alt="foto" className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-[#191918]/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <Plus className="w-5 h-5 text-[#191918] dark:text-white" />
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex flex-col items-center justify-center gap-1 h-full text-[#6366F1] dark:text-[#94a3b8] group-hover:text-brand-400 transition-colors">
                                        <Plus className="w-6 h-6" />
                                        <span className="text-[10px] font-medium">Foto</span>
                                    </div>
                                )}
                            </button>
                        </div>

                        <div className="space-y-3">
                            <div className="space-y-1">
                                <Label className="text-[10px] font-semibold text-[#37352F] dark:text-[#cbd5e1] uppercase tracking-wider flex items-center gap-1">
                                    <Phone className="w-3 h-3" />
                                    Telefone *
                                </Label>
                                <Input
                                    value={newLeadForm.telefone}
                                    onChange={(e) => setNewLeadForm((f) => ({ ...f, telefone: e.target.value }))}
                                    placeholder="5511999999999"
                                    className="rounded-lg h-9 text-sm bg-[#EEF2FF] dark:bg-[#1e2536] border-[#A5B4FC] dark:border-[#4a5568] text-[#191918] dark:text-white placeholder:text-[#6366F1] dark:text-[#94a3b8]"
                                    autoFocus
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-[10px] font-semibold text-[#37352F] dark:text-[#cbd5e1] uppercase tracking-wider flex items-center gap-1">
                                    <User className="w-3 h-3" />
                                    Nome
                                </Label>
                                <Input
                                    value={newLeadForm.nome}
                                    onChange={(e) => setNewLeadForm((f) => ({ ...f, nome: e.target.value }))}
                                    placeholder="Nome do contato (opcional)"
                                    className="rounded-lg h-9 text-sm bg-[#EEF2FF] dark:bg-[#1e2536] border-[#A5B4FC] dark:border-[#4a5568] text-[#191918] dark:text-white placeholder:text-[#6366F1] dark:text-[#94a3b8]"
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") handleCreateLead();
                                    }}
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-[10px] font-semibold text-[#37352F] dark:text-[#cbd5e1] uppercase tracking-wider flex items-center gap-1">
                                    Canal
                                </Label>
                                <div className="flex gap-2">
                                    {(["alegrando", "festas"] as const).map((c) => (
                                        <button
                                            key={c}
                                            type="button"
                                            onClick={() => setNewLeadCanal(c)}
                                            className={cn(
                                                "flex-1 h-8 rounded-lg text-xs font-semibold border-2 transition-colors",
                                                newLeadCanal === c
                                                    ? "bg-brand-500/20 text-brand-400 border-brand-500/40"
                                                    : "bg-[#EEF2FF] dark:bg-[#1e2536]/40 text-[#6366F1] dark:text-[#94a3b8] border-[#C7D2FE] dark:border-[#3d4a60]/40 hover:text-[#37352F] dark:hover:text-[#cbd5e1]"
                                            )}
                                        >
                                            {c === "alegrando" ? "🎒 Alegrando" : "🎉 Festas"}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-2 mt-5">
                            <button
                                onClick={() => { setShowNewLeadModal(false); setNewLeadPhoto(null); setNewLeadForm({ telefone: "", nome: "" }); setNewLeadCanal("alegrando"); }}
                                className="flex-1 h-9 rounded-lg border border-[#A5B4FC] dark:border-[#4a5568] text-sm font-medium text-[#37352F] dark:text-[#cbd5e1] hover:bg-[#EEF2FF] dark:hover:bg-[#1e2536] transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleCreateLead}
                                disabled={isCreatingLead || !newLeadForm.telefone.trim()}
                                className="flex-1 h-9 rounded-lg bg-brand-500 text-[#191918] dark:text-white text-sm font-semibold hover:bg-brand-600 disabled:opacity-50 transition-colors shadow-lg shadow-brand-500/25 flex items-center justify-center gap-1.5"
                            >
                                {isCreatingLead ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <>
                                        <Plus className="w-3.5 h-3.5" />
                                        Criar Lead
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
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
            <Label className="text-[10px] font-semibold text-[#37352F] dark:text-[#cbd5e1] uppercase tracking-wider flex items-center gap-1">
                {icon}
                {label}
            </Label>
            {children}
        </div>
    );
}
