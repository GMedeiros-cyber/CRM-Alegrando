"use client";

import { useState, useEffect, useRef, useTransition, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ChatWindow } from "./chat-window";
import { EmojiPickerInput } from "./emoji-picker-input";
import { NovoLeadModal } from "./novo-lead-modal";
import { LeadListItem } from "./lead-list-item";
import { AttachmentPreview } from "./attachment-preview";
import { ClienteDetailPanel, INITIAL_FORM } from "./cliente-detail-panel";
import type { FormState, TaskItem } from "./cliente-detail-panel";
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
import { sendMessage, sendFileMessage } from "@/lib/actions/messages";
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
    CheckCircle2,
    AlertCircle,
    ArrowLeft,
    PanelRightOpen,
    Paperclip,
    UserPlus,
    X,
} from "lucide-react";
import {
    Sheet,
    SheetContent,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase/client";

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

const AGENDAMENTOS_TTL = 60_000; // 1 minuto

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
    const [form, setForm] = useState<FormState>(INITIAL_FORM);

    const [posPasseioLink, setPosPasseioLink] = useState("");

    // Chat
    const [chatMessage, setChatMessage] = useState("");
    const addOptimisticRef = useRef<((content: string, senderName?: string) => void) | null>(null);
    const loadClienteVersionRef = useRef(0);
    const agendamentosCache = useRef<{ data: AgendamentoEvent[]; ts: number } | null>(null);
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
            setClientesList(prev => {
                const existentes = new Set(prev.map(c => c.telefone));
                const novos = result.data.filter(c => !existentes.has(c.telefone));
                return [...prev, ...novos];
            });
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

    // Realtime: atualiza apenas o lead afetado em vez de rebuscar tudo
    useEffect(() => {
        const channel = supabase
            .channel("conversas-list-realtime")
            .on(
                "postgres_changes",
                { event: "INSERT", schema: "public", table: "messages" },
                (payload) => {
                    const newMsg = payload.new;
                    const telefone = String(newMsg.telefone);
                    const isFromCliente =
                        newMsg.sender_type === "cliente" || newMsg.sender_type === "lead";

                    setClientesList((prev) =>
                        prev.map((c) => {
                            if (String(c.telefone) !== telefone) return c;
                            return {
                                ...c,
                                lastMessageAt: newMsg.created_at
                                    ? new Date(newMsg.created_at)
                                    : c.lastMessageAt,
                                unreadCount:
                                    isFromCliente &&
                                    String(selectedTelefone) !== telefone
                                        ? (c.unreadCount || 0) + 1
                                        : c.unreadCount,
                            };
                        })
                    );
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [selectedTelefone]);

    // Load selected cliente
    const loadCliente = useCallback(async (telefone: string) => {
        const version = ++loadClienteVersionRef.current;
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
                (() => {
                    const cache = agendamentosCache.current;
                    if (cache && Date.now() - cache.ts < AGENDAMENTOS_TTL) {
                        return Promise.resolve(cache.data);
                    }
                    return getAgendamentos().then(data => {
                        agendamentosCache.current = { data, ts: Date.now() };
                        return data;
                    });
                })(),
                getPasseiosHistorico(telefone),
            ]);

            if (loadClienteVersionRef.current !== version) return;

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
                    responsavel: clienteData.responsavel || "",
                    segundoNumero: clienteData.segundoNumero || "",
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

            // Fire-and-forget — não bloqueia a navegação
            markAsRead(telefone)
                .then(() => setClientesList((prev) =>
                    prev.map((c) =>
                        String(c.telefone) === String(telefone) ? { ...c, unreadCount: 0 } : c
                    )
                ))
                .catch((err) => console.error("[conversas] Erro ao marcar como lida:", err));
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
                    responsavel: form.responsavel || null,
                    segundoNumero: form.segundoNumero || null,
                    kanbanColumnId: form.kanbanColumnId || null,
                    ultimoPasseio: form.ultimoPasseio || null,
                    followupDias: form.followupDias,
                    followupHora: form.followupHora,
                    followupAtivo: form.followupAtivo,
                });
                setToast({ type: "success", text: "Cliente atualizado!" });
                setClientesList((prev) =>
                    prev.map((c) =>
                        String(c.telefone) === String(selectedTelefone)
                            ? { ...c, nome: form.nome || c.nome }
                            : c
                    )
                );
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
                        canal: cliente.canal,
                    });
                } else {
                    await sendMessage({
                        telefone: cliente.telefone,
                        mensagem: text,
                        sender_name: cliente.canal === "festas" ? "Márcia" : "Equipe",
                        iaAtiva: cliente.iaAtiva,
                        canal: cliente.canal,
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

    function handleSendManualFollowup() {
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
    }

    function handleSendPosPasseio() {
        if (!selectedTelefone || !posPasseioLink.trim()) return;
        startRunningAction(async () => {
            try {
                const result = await sendPosPasseio(selectedTelefone, posPasseioLink);
                if (result.success) {
                    setToast({ type: "success", text: "Mensagem de fotos enviada!" });
                    setForm(f => ({ ...f, posPasseioEnviado: true, posPasseioEnviadoEm: new Date().toISOString() }));
                } else {
                    setToast({ type: "error", text: result.error || "Erro ao enviar." });
                }
            } catch {}
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
                    formData.append("canal", cliente.canal ?? "alegrando");
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
    // RENDER
    // =============================================
    const detailPanelContent = selectedTelefone && cliente ? (
        <ClienteDetailPanel
            cliente={cliente}
            selectedTelefone={selectedTelefone}
            form={form}
            tasks={tasks}
            passeiosHistorico={passeiosHistorico}
            agendamentos={agendamentos}
            kanbanColumns={kanbanColumns}
            loadingAgendamentos={loadingAgendamentos}
            posPasseioLink={posPasseioLink}
            addingPasseio={addingPasseio}
            novoPasseioDestino={novoPasseioDestino}
            novoPasseioData={novoPasseioData}
            confirmingDelete={confirmingDelete}
            confirmingClearMessages={confirmingClearMessages}
            isRunningAction={isRunningAction}
            isSavingCliente={isSavingCliente}
            newTaskText={newTaskText}
            onFormChange={(updates) => setForm((f) => ({ ...f, ...updates }))}
            onSave={handleSave}
            onToggleIA={handleToggleIA}
            onAddTask={handleAddTask}
            onToggleTask={handleToggleTask}
            onDeleteTask={handleDeleteTask}
            onDeleteAgendamento={handleDeleteAgendamento}
            onAddPasseio={handleAddPasseio}
            onDeletePasseio={handleDeletePasseio}
            onDeleteCliente={handleDeleteCliente}
            onClearMessages={handleClearMessages}
            onSendManualFollowup={handleSendManualFollowup}
            onSendPosPasseio={handleSendPosPasseio}
            setPosPasseioLink={setPosPasseioLink}
            setAddingPasseio={setAddingPasseio}
            setNovoPasseioDestino={setNovoPasseioDestino}
            setNovoPasseioData={setNovoPasseioData}
            setConfirmingDelete={setConfirmingDelete}
            setConfirmingClearMessages={setConfirmingClearMessages}
            setNewTaskText={setNewTaskText}
            startSavingCliente={(fn) => startSavingCliente(fn)}
            startRunningAction={(fn) => startRunningAction(fn)}
            onToast={setToast}
        />
    ) : (
        <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <p className="text-sm text-[#6366F1] dark:text-[#94a3b8]">
                Selecione um cliente para ver os detalhes
            </p>
        </div>
    );

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
                                <LeadListItem
                                    key={item.telefone.toString()}
                                    item={item}
                                    isSelected={selectedTelefone === item.telefone.toString()}
                                    onClick={() => handleSelectCliente(item.telefone.toString())}
                                    tick={tick}
                                />
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
                                            <Image
                                                src={cliente.fotoUrl}
                                                alt={cliente.nome || "avatar"}
                                                width={40}
                                                height={40}
                                                className="w-full h-full object-cover"
                                                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                                                unoptimized={cliente.fotoUrl.includes("pps.whatsapp.net")}
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
                            key={cliente.telefone}
                            telefone={cliente.telefone}
                            canal={cliente.canal}
                            onReady={(fns) => { addOptimisticRef.current = fns.addOptimisticMessage; }}
                            onReply={(msg) => setReplyTo(msg)}
                        />

                        {/* Attachment preview area */}
                        {attachments.length > 0 && (
                            <AttachmentPreview
                                attachments={attachments}
                                firstCaptionRef={firstCaptionRef}
                                onRemove={(id) => setAttachments(prev => prev.filter(a => a.id !== id))}
                                onCaptionChange={(id, caption) => setAttachments(prev =>
                                    prev.map(a => a.id === id ? { ...a, caption } : a)
                                )}
                                onSend={handleSendAttachments}
                            />
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
                                    disabled={(cliente.iaAtiva && cliente.canal !== "festas") || attachments.length > 0}
                                    placeholder={
                                        (cliente.iaAtiva && cliente.canal !== "festas")
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
                                        (cliente.iaAtiva && cliente.canal !== "festas") ||
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
                {detailPanelContent}
            </div>

            {/* =================== MOBILE: Details Sheet =================== */}
            <Sheet open={mobileDetailsOpen} onOpenChange={setMobileDetailsOpen}>
                <SheetContent side="right" className="w-[320px] bg-background border-border overflow-y-auto p-0 md:hidden">
                    {detailPanelContent}
                </SheetContent>
            </Sheet>

            {/* =================== NEW LEAD MODAL =================== */}
            {showNewLeadModal && (
                <NovoLeadModal
                    onClose={() => { setShowNewLeadModal(false); }}
                    onCreated={(tel) => { loadList(); handleSelectCliente(tel); }}
                    onToast={setToast}
                />
            )}
        </div>
    );
}

