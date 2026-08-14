"use client";

import { useState, useEffect, useRef, useTransition, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ChatWindow } from "./chat-window";
import { EmojiPickerInput } from "./emoji-picker-input";
import { NovoLeadModal } from "./novo-lead-modal";
import { LeadListItem, isGroupTelefone } from "./lead-list-item";
import { LeadListSkeleton } from "./lead-list-skeleton";
import { AttachmentPreview } from "./attachment-preview";
import { AudioPlayer } from "./audio-player";
import { AudioRecorder } from "./audio-recorder";
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
import { sendMessage, sendFileMessage, sendAudioMessage, createSignedUploadUrl, sendUploadedFileMessage } from "@/lib/actions/messages";
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
    PanelRightClose,
    Paperclip,
    UserPlus,
    X,
    ArrowUpDown,
    Check,
    ChevronDown,
    Users,
    Mail,
} from "lucide-react";
import {
    Sheet,
    SheetContent,
} from "@/components/ui/sheet";
import { cn, isValidPhotoUrl } from "@/lib/utils";
import { supabase } from "@/lib/supabase/client";
import { listLabels } from "@/lib/actions/labels";
import type { Label, LabelColor } from "@/lib/types/labels";
import { LabelFilterButton } from "@/components/labels/label-filter-button";
import { EmailComposeModal } from "@/components/emails/email-compose-modal";
import { listLeadsWithUnreadEmail } from "@/lib/actions/emails";
import { ignorarSeForPortalDeEmail } from "@/components/emails/portal-guards";
import { CANAL_ATIVO } from "@/lib/canal";
import { isGooglePickerOpen } from "@/components/emails/drive-picker-button";

function mapRowToLabel(row: Record<string, unknown>): Label {
    return {
        id: row.id as string,
        name: row.name as string,
        color: row.color as LabelColor,
        createdAt: new Date(row.created_at as string),
        updatedAt: new Date(row.updated_at as string),
    };
}

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
// SORT + FILTER DROPDOWN (custom — substitui <select> nativo)
// =============================================
const SORT_OPTIONS = [
    { value: "recent", label: "Mais recente" },
    { value: "oldest", label: "Mais antigo" },
    { value: "az",     label: "A-Z" },
    { value: "za",     label: "Z-A" },
] as const;

const IA_OPTIONS = [
    { value: "ia_ativa" as const, label: "IA Ativa", icon: <Bot className="w-3.5 h-3.5 text-emerald-400" /> },
    { value: "manual"   as const, label: "Manual",   icon: <UserRound className="w-3.5 h-3.5 text-orange-400" /> },
];

function SortFilterDropdown({
    sortOrder,
    iaFiltro,
    tipoFiltro,
    onSortChange,
    onIaChange,
    onTipoChange,
}: {
    sortOrder: string;
    iaFiltro: "todos" | "ia_ativa" | "manual";
    tipoFiltro: "todos" | "grupos";
    onSortChange: (v: string) => void;
    onIaChange: (v: "ia_ativa" | "manual") => void;
    onTipoChange: (v: "todos" | "grupos") => void;
}) {
    const [open, setOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        function onDoc(e: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        function onEsc(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
        document.addEventListener("mousedown", onDoc);
        document.addEventListener("keydown", onEsc);
        return () => {
            document.removeEventListener("mousedown", onDoc);
            document.removeEventListener("keydown", onEsc);
        };
    }, [open]);

    const activeLabel = tipoFiltro === "grupos"
        ? "Grupos"
        : iaFiltro === "ia_ativa"
            ? "IA Ativa"
            : iaFiltro === "manual"
                ? "Manual"
                : SORT_OPTIONS.find((o) => o.value === sortOrder)?.label ?? "Mais recente";

    return (
        <div ref={wrapperRef} className="relative">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className={cn(
                    "flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-lg border transition-all",
                    "bg-[#EEF2FF] dark:bg-[#1e2536] text-[#37352F] dark:text-[#cbd5e1]",
                    "hover:border-brand-500/60 hover:shadow-sm hover:shadow-brand-500/10",
                    open
                        ? "border-brand-500/70 ring-2 ring-brand-500/20"
                        : "border-[#C7D2FE] dark:border-[#3d4a60]"
                )}
            >
                <ArrowUpDown className="w-3 h-3 text-[#6366F1] dark:text-[#94a3b8]" />
                <span className="font-semibold">{activeLabel}</span>
                <ChevronDown className={cn("w-3 h-3 transition-transform", open && "rotate-180")} />
            </button>

            {open && (
                <div className="absolute right-0 z-30 mt-1.5 w-44 rounded-xl border border-[#C7D2FE] dark:border-[#3d4a60] bg-[#EEF2FF] dark:bg-[#1e2536] shadow-xl shadow-black/10 dark:shadow-black/40 overflow-hidden animate-in fade-in-0 zoom-in-95 duration-100 origin-top-right">
                    <div className="px-3 pt-2 pb-1 text-[9px] font-bold uppercase tracking-wider text-[#6366F1] dark:text-[#94a3b8]">
                        Ordenar
                    </div>
                    {SORT_OPTIONS.map((opt) => {
                        const active = iaFiltro === "todos" && sortOrder === opt.value;
                        return (
                            <button
                                key={opt.value}
                                onClick={() => { onSortChange(opt.value); setOpen(false); }}
                                className={cn(
                                    "w-full flex items-center justify-between px-3 py-1.5 text-[12px] transition-colors",
                                    active
                                        ? "bg-brand-500/15 text-brand-500 dark:text-brand-400 font-semibold"
                                        : "text-[#37352F] dark:text-[#cbd5e1] hover:bg-[#C7D2FE]/40 dark:hover:bg-[#3d4a60]/50"
                                )}
                            >
                                <span>{opt.label}</span>
                                {active && <Check className="w-3.5 h-3.5" />}
                            </button>
                        );
                    })}
                    <div className="my-1 mx-3 h-px bg-[#C7D2FE] dark:bg-[#3d4a60]" />
                    <div className="px-3 pt-1 pb-1 text-[9px] font-bold uppercase tracking-wider text-[#6366F1] dark:text-[#94a3b8]">
                        Filtrar IA
                    </div>
                    {IA_OPTIONS.map((opt) => {
                        const active = iaFiltro === opt.value;
                        return (
                            <button
                                key={opt.value}
                                onClick={() => { onIaChange(opt.value); setOpen(false); }}
                                className={cn(
                                    "w-full flex items-center gap-2 px-3 py-1.5 text-[12px] transition-colors",
                                    active
                                        ? "bg-brand-500/15 text-brand-500 dark:text-brand-400 font-semibold"
                                        : "text-[#37352F] dark:text-[#cbd5e1] hover:bg-[#C7D2FE]/40 dark:hover:bg-[#3d4a60]/50"
                                )}
                            >
                                {opt.icon}
                                <span className="flex-1 text-left">{opt.label}</span>
                                {active && <Check className="w-3.5 h-3.5" />}
                            </button>
                        );
                    })}
                    <div className="my-1 mx-3 h-px bg-[#C7D2FE] dark:bg-[#3d4a60]" />
                    <div className="px-3 pt-1 pb-1 text-[9px] font-bold uppercase tracking-wider text-[#6366F1] dark:text-[#94a3b8]">
                        Filtrar Tipo
                    </div>
                    <button
                        onClick={() => {
                            // Toggle: clicar com o filtro ativo volta para "todos"
                            onTipoChange(tipoFiltro === "grupos" ? "todos" : "grupos");
                            setOpen(false);
                        }}
                        className={cn(
                            "w-full flex items-center gap-2 px-3 py-1.5 text-[12px] transition-colors",
                            tipoFiltro === "grupos"
                                ? "bg-brand-500/15 text-brand-500 dark:text-brand-400 font-semibold"
                                : "text-[#37352F] dark:text-[#cbd5e1] hover:bg-[#C7D2FE]/40 dark:hover:bg-[#3d4a60]/50"
                        )}
                    >
                        <Users className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="flex-1 text-left">Grupos</span>
                        {tipoFiltro === "grupos" && <Check className="w-3.5 h-3.5" />}
                    </button>
                </div>
            )}
        </div>
    );
}

// =============================================
// MAIN COMPONENT
// =============================================

const AGENDAMENTOS_TTL = 60_000; // 1 minuto
const CLIENTE_DETAIL_TTL = 60_000; // 1 minuto — detalhes do cliente, mensagens etc.
const CLIENTES_LIST_TTL = 30_000; // 30s — lista da sidebar (alterna entre canais)

type ClienteDetailCacheEntry = {
    data: Awaited<ReturnType<typeof getClienteByTelefone>>;
    tasks: TaskItem[];
    historico: PasseioHistorico[];
    kanban: KanbanColumn[];
    ts: number;
};

type ClientesListCacheEntry = {
    data: ClienteListItem[];
    total: number;
    ts: number;
};

export function ConversasLayout() {
    const searchParams = useSearchParams();
    const initialTelefone = searchParams.get("telefone");
    const initialCanal = searchParams.get("canal") || CANAL_ATIVO;

    // State
    const [clientesList, setClientesList] = useState<ClienteListItem[]>([]);
    const [selectedTelefone, setSelectedTelefone] = useState<string | null>(
        initialTelefone
    );
    const [selectedCanal, setSelectedCanal] = useState<string>(initialCanal);
    const [cliente, setCliente] = useState<ClienteDetail | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [loading, setLoading] = useState(true);
    // Skeleton separado do `loading` (spinner central): aparece só na transição
    // entre filtros (canal/labels/search) quando o cache anterior seria errado.
    const [showFilterSkeleton, setShowFilterSkeleton] = useState(false);
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
    const addOptimisticRef = useRef<((content: string, senderName?: string, mediaType?: import("@/lib/actions/leads").LeadMessage["mediaType"]) => string) | null>(null);
    const removeOptimisticRef = useRef<((id: string) => void) | null>(null);
    const updateOptimisticRef = useRef<((id: string, updates: Partial<import("@/lib/actions/leads").LeadMessage>) => void) | null>(null);
    // Retry de envios falhos: id do balão falho → função que reenvia o conteúdo
    const failedRetryRef = useRef<Map<string, () => void>>(new Map());
    const loadClienteVersionRef = useRef(0);
    const loadListVersionRef = useRef(0);
    // Última cache key fetchada com sucesso. Quando muda (canal/labels/search),
    // o cache anterior é semanticamente errado — próximo fetch mostra skeleton
    // em vez de stale.
    const lastFetchedKeyRef = useRef<string | null>(null);
    const agendamentosCache = useRef<{ data: AgendamentoEvent[]; ts: number } | null>(null);
    // Cache em memória para alternância rápida entre conversas/canais já vistos.
    // stale-while-revalidate: usa cache pra renderizar imediato e revalida em background.
    const clienteCache = useRef<Map<string, ClienteDetailCacheEntry>>(new Map());
    const clientesListCache = useRef<Map<string, ClientesListCacheEntry>>(new Map());
    // Marca uma janela curta após uma ação local optimistic em labels/lead_labels.
    // O Realtime de lead_labels ecoa de volta nossa própria escrita (Supabase
    // entrega INSERT/DELETE pra quem fez); sem isso o eco invalidaria os caches
    // e o próximo load redesenharia. 500ms cobre o round-trip do servidor.
    const recentlyOptimisticLabelChange = useRef<boolean>(false);
    function markOptimisticChange() {
        recentlyOptimisticLabelChange.current = true;
        setTimeout(() => {
            recentlyOptimisticLabelChange.current = false;
        }, 500);
    }
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
    // Canal fixo: festas foi encerrado e o seletor saiu da tela. Continua como
    // variavel (e nao literal) porque as consultas abaixo ja a recebem.
    const canalFiltro = CANAL_ATIVO;
    const [iaFiltro, setIaFiltro] = useState<"todos" | "ia_ativa" | "manual">("todos");
    const [tipoFiltro, setTipoFiltro] = useState<"todos" | "grupos">("todos");
    const [labelFiltro, setLabelFiltro] = useState<string[]>([]);
    const [availableLabels, setAvailableLabels] = useState<Label[]>([]);
    const [emailBlastOpen, setEmailBlastOpen] = useState(false);
    useEffect(() => {
        // Query string ?ia=ativa|manual sobrescreve localStorage (vinda do dashboard)
        const queryIa = searchParams.get("ia");
        if (queryIa === "ativa") {
            setIaFiltro("ia_ativa");
        } else if (queryIa === "manual") {
            setIaFiltro("manual");
        } else {
            const storedIa = localStorage.getItem("crm_ia_filtro");
            if (storedIa === "todos" || storedIa === "ia_ativa" || storedIa === "manual") {
                setIaFiltro(storedIa);
            }
        }
        // Restaura filtro de tipo (grupos) do localStorage
        const storedTipo = localStorage.getItem("crm_tipo_filtro");
        if (storedTipo === "todos" || storedTipo === "grupos") {
            setTipoFiltro(storedTipo);
        }
        // Restaura filtro de labels do localStorage
        const storedLabels = localStorage.getItem("crm_label_filtro");
        if (storedLabels) {
            try {
                const parsed = JSON.parse(storedLabels);
                if (Array.isArray(parsed)) setLabelFiltro(parsed.filter((x): x is string => typeof x === "string"));
            } catch { /* localStorage corrompido, ignora */ }
        }
        // Carrega labels disponíveis
        listLabels().then(setAvailableLabels);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    useEffect(() => {
        localStorage.setItem("crm_ia_filtro", iaFiltro);
    }, [iaFiltro]);
    useEffect(() => {
        localStorage.setItem("crm_tipo_filtro", tipoFiltro);
    }, [tipoFiltro]);
    const [totalClientes, setTotalClientes] = useState(0);
    const [loadingMore, setLoadingMore] = useState(false);
    const CLIENTES_LIMIT = 50;

    // Mobile responsiveness
    const [mobileView, setMobileView] = useState<"list" | "chat">("list");
    const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false);

    // Painel de detalhes recolhível (desktop) — libera espaço para o chat
    const [detailsCollapsed, setDetailsCollapsed] = useState(false);
    useEffect(() => {
        if (localStorage.getItem("crm_details_collapsed") === "1") setDetailsCollapsed(true);
    }, []);
    useEffect(() => {
        localStorage.setItem("crm_details_collapsed", detailsCollapsed ? "1" : "0");
    }, [detailsCollapsed]);

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
    const chatInputRef = useRef<HTMLTextAreaElement>(null);

    /**
     * Auto-crescimento da caixa do chat, até ~5 linhas.
     *
     * `height: auto` antes de ler o `scrollHeight` não é redundante: sem isso o
     * scrollHeight nunca desce, e a caixa que cresceu não voltaria a encolher ao
     * apagar as linhas. Mexe no `style` direto em vez de guardar altura em
     * estado — é medição de layout, e passar por render daria um salto visível.
     */
    const ajustarAlturaCaixa = useCallback((el: HTMLTextAreaElement | null) => {
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
    }, []);

    /**
     * Ref-callback, e não só um efeito: a caixa DESMONTA ao gravar áudio. Com
     * apenas o efeito abaixo, voltar da gravação com um rascunho de três linhas
     * remontava a caixa com altura de uma — e ela só se acertaria na tecla
     * seguinte. Medir no momento em que o nó entra no DOM resolve na origem.
     */
    const registrarCaixa = useCallback((el: HTMLTextAreaElement | null) => {
        chatInputRef.current = el;
        ajustarAlturaCaixa(el);
    }, [ajustarAlturaCaixa]);

    useEffect(() => {
        ajustarAlturaCaixa(chatInputRef.current);
    }, [chatMessage, ajustarAlturaCaixa]);

    // Audio attachment (preview before send)
    const [audioAttachment, setAudioAttachment] = useState<{ file: File; previewUrl: string } | null>(null);
    const [isSendingFile, setIsSendingFile] = useState(false);
    const [isRecordingAudio, setIsRecordingAudio] = useState(false);

    const firstCaptionRef = useRef<HTMLTextAreaElement>(null);
    const loadMoreRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const loadedCountRef = useRef(0);
    const loadMoreFnRef = useRef<() => void>(() => {});
    const selectedTelefoneRef = useRef<string | null>(null);

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

    // Filtro IA (client-side) + ordenação
    const sortedLeads = [...clientesList]
        .filter((c) => {
            // Ortogonal ao canal — vale em todos/alegrando/festas.
            if (tipoFiltro === "grupos" && !isGroupTelefone(c.telefone)) return false;
            if (iaFiltro === "ia_ativa") return c.iaAtiva === true;
            if (iaFiltro === "manual") return c.iaAtiva === false;
            return true;
        })
        .sort((a, b) => {
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

    // Load clientes list (page 1) — com cache em memória por (search, canal).
    // Stale-while-revalidate: alternar Alegrando ↔ Festas (ou voltar a uma busca
    // recente) mostra a lista cacheada instantaneamente e revalida em background.
    const loadList = useCallback(async () => {
        const version = ++loadListVersionRef.current;
        const cacheKey = `${searchTerm || ""}|${canalFiltro}|${[...labelFiltro].sort().join(",")}`;
        const cached = clientesListCache.current.get(cacheKey);
        const hasFreshCache = cached && Date.now() - cached.ts < CLIENTES_LIST_TTL;

        // Cache key da última resposta bem-sucedida. Quando diverge da atual,
        // o cache anterior é semanticamente errado (canal/tags diferentes) —
        // mostra skeleton em vez de stale pra evitar a sensação de "carregou
        // errado mas se conserta".
        const keyChanged = lastFetchedKeyRef.current !== null
            && lastFetchedKeyRef.current !== cacheKey;

        if (hasFreshCache) {
            setClientesList(cached.data);
            loadedCountRef.current = cached.data.length;
            setTotalClientes(cached.total);
            setLoading(false);
            setShowFilterSkeleton(false);
        } else if (cached && !keyChanged) {
            // SWR clássico: stale da MESMA key, revalida em background.
            setClientesList(cached.data);
            loadedCountRef.current = cached.data.length;
            setTotalClientes(cached.total);
            setLoading(false);
            setShowFilterSkeleton(false);
        } else if (keyChanged) {
            // Mudança de filtro: skeleton dedicado em vez de stale errado.
            setShowFilterSkeleton(true);
            setLoading(false);
        } else {
            // Primeira carga, sem cache: spinner central padrão.
            setClientesList([]);
            setTotalClientes(0);
            setLoading(true);
            setShowFilterSkeleton(false);
        }

        try {
            const result = await listClientes({
                search: searchTerm || undefined,
                page: 1,
                limit: CLIENTES_LIMIT,
                canal: canalFiltro,
                labelIds: labelFiltro,
            });
            // Descarta respostas obsoletas — resolve a race condition em
            // sequências rápidas de troca de canal/filtro.
            if (loadListVersionRef.current !== version) return;

            const seen = new Set<string>();
            const unique = result.data.filter(c => {
                const key = String(c.telefone);
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
            setClientesList(unique);
            loadedCountRef.current = unique.length;
            setTotalClientes(result.total);
            clientesListCache.current.set(cacheKey, {
                data: unique,
                total: result.total,
                ts: Date.now(),
            });
            lastFetchedKeyRef.current = cacheKey;
        } catch (err) {
            if (loadListVersionRef.current !== version) return;
            console.error("[conversas] Erro ao carregar lista:", err);
        } finally {
            if (loadListVersionRef.current === version) {
                setLoading(false);
                setShowFilterSkeleton(false);
            }
        }
    }, [searchTerm, canalFiltro, labelFiltro]);

    // Load more clientes (next page)
    const loadMore = useCallback(async () => {
        const nextPage = Math.floor(loadedCountRef.current / CLIENTES_LIMIT) + 1;
        setLoadingMore(true);
        try {
            const result = await listClientes({
                search: searchTerm || undefined,
                page: nextPage,
                limit: CLIENTES_LIMIT,
                canal: canalFiltro,
                labelIds: labelFiltro,
            });
            setClientesList(prev => {
                const existentes = new Set(prev.map(c => String(c.telefone)));
                const novos = result.data.filter(c => !existentes.has(String(c.telefone)));
                const merged = [...prev, ...novos];
                loadedCountRef.current = merged.length;
                return merged;
            });
            setTotalClientes(result.total);
        } catch (err) {
            console.error("[conversas] Erro ao carregar mais:", err);
        } finally {
            setLoadingMore(false);
        }
    }, [searchTerm, canalFiltro, labelFiltro]);

    useEffect(() => {
        loadList();
    }, [loadList]);

    useEffect(() => { loadMoreFnRef.current = loadMore; }, [loadMore]);

    useEffect(() => {
        if (!loadMoreRef.current) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (
                    entries[0].isIntersecting &&
                    !loadingMore &&
                    clientesList.length < totalClientes
                ) {
                    loadMoreFnRef.current();
                }
            },
            {
                root: scrollContainerRef.current,
                threshold: 0.1,
                rootMargin: "0px 0px 100px 0px",
            }
        );
        observer.observe(loadMoreRef.current);
        return () => observer.disconnect();
    }, [loadingMore, clientesList.length, totalClientes]);

    // Realtime: atualiza apenas o lead afetado em vez de rebuscar tudo.
    // Usa ref para selectedTelefone — assim trocar de lead não recria o canal
    // WebSocket (evita ~50ms de churn por troca).
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
                                    String(selectedTelefoneRef.current) !== telefone
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
    }, []);

    // Realtime: aplica mudanças no state local sem refetch agressivo.
    // Eco do próprio browser (após optimistic) é ignorado via ref de janela curta
    // pra não duplicar/re-renderizar — Realtime entrega INSERT do servidor mesmo
    // pra quem fez a escrita.
    useEffect(() => {
        const channel = supabase
            .channel("labels-sync-realtime")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "labels" },
                (payload) => {
                    if (payload.eventType === "INSERT") {
                        const newLabel = mapRowToLabel(payload.new);
                        setAvailableLabels((prev) => {
                            // Idempotência: se já existe (optimistic local), não duplica.
                            if (prev.some((l) => l.id === newLabel.id)) return prev;
                            return [...prev, newLabel].sort((a, b) =>
                                a.name.localeCompare(b.name)
                            );
                        });
                    } else if (payload.eventType === "UPDATE") {
                        const updated = mapRowToLabel(payload.new);
                        const compact = { id: updated.id, name: updated.name, color: updated.color };
                        setAvailableLabels((prev) =>
                            prev.map((l) => (l.id === updated.id ? updated : l))
                        );
                        setClientesList((prev) =>
                            prev.map((c) => ({
                                ...c,
                                labels: (c.labels || []).map((l) =>
                                    l.id === updated.id ? compact : l
                                ),
                            }))
                        );
                        setCliente((prev) =>
                            prev
                                ? {
                                      ...prev,
                                      labels: (prev.labels || []).map((l) =>
                                          l.id === updated.id ? compact : l
                                      ),
                                  }
                                : prev
                        );
                    } else if (payload.eventType === "DELETE") {
                        const deletedId = (payload.old as { id?: string }).id;
                        if (!deletedId) return;
                        setAvailableLabels((prev) => prev.filter((l) => l.id !== deletedId));
                        setClientesList((prev) =>
                            prev.map((c) => ({
                                ...c,
                                labels: (c.labels || []).filter((l) => l.id !== deletedId),
                            }))
                        );
                        setCliente((prev) =>
                            prev
                                ? {
                                      ...prev,
                                      labels: (prev.labels || []).filter((l) => l.id !== deletedId),
                                  }
                                : prev
                        );
                        setLabelFiltro((prev) => prev.filter((id) => id !== deletedId));
                    }
                    // Invalida cache pra próximo load reler badges/cores corretos.
                    clientesListCache.current.clear();
                }
            )
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "lead_labels" },
                () => {
                    // Eco de uma ação optimistic local: já refletida no state, ignora.
                    if (recentlyOptimisticLabelChange.current) return;
                    // Mudança vinda de outro browser/sessão: invalida caches.
                    // Não dispara loadList — próximo trigger natural (filtro,
                    // troca de canal) repopula com a verdade do servidor.
                    clienteCache.current.clear();
                    clientesListCache.current.clear();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    /**
     * Bolinha verde de e-mail no card, ao vivo.
     *
     * O contador não vem de `messages` como o do WhatsApp — é calculado no
     * servidor a partir de `email_replies`. Então o evento do Realtime não
     * traz o número pronto: ele serve só de aviso pra recontar. A consulta é
     * pequena (só respostas ainda não lidas) e roda a cada evento.
     *
     * Recontar em vez de somar 1 no cliente também conserta o caminho de
     * volta: quando alguém lê a resposta em outra aba, a bolinha some aqui.
     */
    useEffect(() => {
        async function recontar() {
            try {
                const naoLidas = await listLeadsWithUnreadEmail();
                const porLead = new Map(
                    naoLidas.map((n) => [`${n.telefone}|${n.canal}`, n.count]),
                );
                setClientesList((prev) =>
                    prev.map((c) => {
                        const novo = porLead.get(`${c.telefone}|${c.canal}`) ?? 0;
                        return c.emailUnreadCount === novo
                            ? c
                            : { ...c, emailUnreadCount: novo };
                    }),
                );
            } catch {
                // Badge é informação secundária: não vale derrubar a lista.
            }
        }

        const channel = supabase
            .channel("conversas-email-badge")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "email_replies" },
                () => void recontar(),
            )
            .subscribe((status) => {
                if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
                    console.warn(`[email] Realtime do badge ${status}.`);
                }
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    // Load selected cliente — com cache em memória stale-while-revalidate.
    // Cache key = `${telefone}|${canal}`. Re-clicar mesmo cliente na sessão é
    // instantâneo (sem spinner); cache expira em 60s e revalida em background.
    const loadCliente = useCallback(async (telefone: string, canal: string = "alegrando") => {
        const version = ++loadClienteVersionRef.current;
        const cacheKey = `${telefone}|${canal}`;
        const cached = clienteCache.current.get(cacheKey);
        const hasFreshCache = cached && Date.now() - cached.ts < CLIENTE_DETAIL_TTL;

        // Helper que aplica uma entry do cache aos states. Reaproveitado em
        // cache hit (sem spinner) e fim do fetch (após revalidação).
        const applyEntry = (entry: ClienteDetailCacheEntry, todosAgendamentos: AgendamentoEvent[]) => {
            const { data: clienteData, tasks: tasksData, historico, kanban } = entry;
            setPaseiosHistorico(historico);
            if (!clienteData) return;
            setCliente(clienteData);
            setKanbanColumns(kanban);
            setForm({
                nome: clienteData.nome || "",
                email: clienteData.email || "",
                cpf: clienteData.cpf || "",
                cnpj: clienteData.cnpj || "",
                status: clienteData.status || "",
                linkedin: clienteData.linkedin || "",
                facebook: clienteData.facebook || "",
                instagram: clienteData.instagram || "",
                endereco: clienteData.endereco || "",
                responsavel: clienteData.responsavel || "",
                segundoNumero: clienteData.segundoNumero || "",
                aniversariante: clienteData.aniversariante || "",
                instituicao: clienteData.instituicao || "",
                instituicaoEndereco: clienteData.instituicaoEndereco || "",
                instituicaoTelefone: clienteData.instituicaoTelefone || "",
                instituicaoEmail: clienteData.instituicaoEmail || "",
                diretoraNome: clienteData.diretoraNome || "",
                diretoraNumero: clienteData.diretoraNumero || "",
                diretoraEmail: clienteData.diretoraEmail || "",
                diretoraCpf: clienteData.diretoraCpf || "",
                coordenadoraNome: clienteData.coordenadoraNome || "",
                coordenadoraNumero: clienteData.coordenadoraNumero || "",
                coordenadoraEmail: clienteData.coordenadoraEmail || "",
                coordenadoraCpf: clienteData.coordenadoraCpf || "",
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
            setTasks(tasksData);
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
        };

        if (hasFreshCache) {
            // Cache fresco: renderiza imediato, sem spinner, sem flicker.
            applyEntry(cached, agendamentosCache.current?.data ?? []);
            setLoadingCliente(false);
            setLoadingAgendamentos(false);
        } else if (cached) {
            // Cache stale: renderiza enquanto revalida em background, sem spinner.
            applyEntry(cached, agendamentosCache.current?.data ?? []);
            setLoadingCliente(false);
            setLoadingAgendamentos(false);
        } else {
            // Sem cache: limpa states e mostra spinner (comportamento original).
            setLoadingCliente(true);
            setLoadingAgendamentos(true);
            setTasks([]);
            setAgendamentos([]);
            setPaseiosHistorico([]);
        }
        setAddingPasseio(false);

        try {
            const tel = parseInt(telefone, 10);

            // Todas as chamadas em paralelo, incluindo getKanbanColumns
            // (antes era sequencial após o resto — -1 round trip percebido).
            const [clienteData, tasksData, todosAgendamentos, historico, kanban] = await Promise.all([
                getClienteByTelefone(telefone, canal),
                !isNaN(tel) ? getLeadTasks(tel) : Promise.resolve([]),
                (() => {
                    const ac = agendamentosCache.current;
                    if (ac && Date.now() - ac.ts < AGENDAMENTOS_TTL) {
                        return Promise.resolve(ac.data);
                    }
                    return getAgendamentos().then(data => {
                        agendamentosCache.current = { data, ts: Date.now() };
                        return data;
                    });
                })(),
                getPasseiosHistorico(telefone),
                getKanbanColumns(canal),
            ]);

            if (loadClienteVersionRef.current !== version) return;

            const entry: ClienteDetailCacheEntry = {
                data: clienteData,
                tasks: tasksData,
                historico,
                kanban,
                ts: Date.now(),
            };
            clienteCache.current.set(cacheKey, entry);
            applyEntry(entry, todosAgendamentos);
        } catch (err) {
            setToast({ type: "error", text: `Erro ao carregar cliente: ${err}` });
        } finally {
            setLoadingCliente(false);
            setLoadingAgendamentos(false);
        }
    }, []);

    /**
     * Botão voltar do navegador.
     *
     * Com `history.pushState` quem empilha a entrada somos nós, então o
     * `popstate` também é nosso: sem isto a URL voltaria e a tela ficaria no
     * lead anterior — voltar aparentemente sem efeito, que é pior do que não
     * ter histórico nenhum.
     */
    useEffect(() => {
        function aoVoltar() {
            const params = new URLSearchParams(window.location.search);
            const telefone = params.get("telefone");
            setSelectedTelefone(telefone);
            setSelectedCanal(params.get("canal") || CANAL_ATIVO);
            setMobileView(telefone ? "chat" : "list");
        }
        window.addEventListener("popstate", aoVoltar);
        return () => window.removeEventListener("popstate", aoVoltar);
    }, []);

    // Select cliente and mark as read
    const handleSelectCliente = useCallback(
        async (telefone: string, canal: string = "alegrando") => {
            setSelectedTelefone(telefone);
            setSelectedCanal(canal);
            setMobileView("chat");
            setReplyTo(null);

            // `history.pushState` em vez de `router.push`: a URL existe só para
            // o lead selecionado sobreviver a um F5 e poder ser compartilhado —
            // o estado da tela já é local, e nada aqui depende de re-render do
            // servidor. O `router.push` disparava uma busca do RSC payload a
            // cada troca de lead: uma ida ao serverless que, com a função fria,
            // custava segundos. Continua sendo pushState (e não replaceState)
            // para o botão voltar do navegador percorrer os leads visitados.
            window.history.pushState(
                null,
                "",
                `/conversas?telefone=${telefone}&canal=${canal}`,
            );

            // Fire-and-forget — não bloqueia a navegação
            markAsRead(telefone, canal)
                .then(() => setClientesList((prev) =>
                    prev.map((c) =>
                        String(c.telefone) === String(telefone) && c.canal === canal
                            ? { ...c, unreadCount: 0 }
                            : c
                    )
                ))
                .catch((err) => console.error("[conversas] Erro ao marcar como lida:", err));
        },
        []
    );

    useEffect(() => {
        selectedTelefoneRef.current = selectedTelefone;
        if (selectedTelefone) loadCliente(selectedTelefone, selectedCanal);
    }, [selectedTelefone, selectedCanal, loadCliente]);

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
                    cnpj: form.cnpj || null,
                    status: form.status || null,
                    linkedin,
                    facebook,
                    instagram,
                    endereco: form.endereco || null,
                    responsavel: form.responsavel || null,
                    segundoNumero: form.segundoNumero || null,
                    aniversariante: form.aniversariante || null,
                    instituicao: form.instituicao || null,
                    instituicaoEndereco: form.instituicaoEndereco || null,
                    instituicaoTelefone: form.instituicaoTelefone || null,
                    instituicaoEmail: form.instituicaoEmail || null,
                    diretoraNome: form.diretoraNome || null,
                    diretoraNumero: form.diretoraNumero || null,
                    diretoraEmail: form.diretoraEmail || null,
                    diretoraCpf: form.diretoraCpf || null,
                    coordenadoraNome: form.coordenadoraNome || null,
                    coordenadoraNumero: form.coordenadoraNumero || null,
                    coordenadoraEmail: form.coordenadoraEmail || null,
                    coordenadoraCpf: form.coordenadoraCpf || null,
                    kanbanColumnId: form.kanbanColumnId || null,
                    ultimoPasseio: form.ultimoPasseio || null,
                    followupDias: form.followupDias,
                    followupHora: form.followupHora,
                    followupAtivo: form.followupAtivo,
                }, selectedCanal);
                setToast({ type: "success", text: "Cliente atualizado!" });
                // Atualiza o estado local com o nome que acabou de ser salvo,
                // INCLUSIVE quando vira string vazia (usuário apagou). O fallback
                // anterior `form.nome || c.nome` mantinha o nome antigo no card
                // após o servidor ter recebido NULL — o card ficava "hardcoded".
                const novoNome = form.nome.trim() || null;
                setClientesList((prev) =>
                    prev.map((c) =>
                        String(c.telefone) === String(selectedTelefone) && c.canal === selectedCanal
                            ? { ...c, nome: novoNome }
                            : c
                    )
                );
                // Invalida cache deste cliente — próxima visita vai re-fetch
                // pra refletir os campos editados.
                clienteCache.current.delete(`${selectedTelefone}|${selectedCanal}`);
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
                await toggleIaAtiva(selectedTelefone, newVal, selectedCanal);
                setCliente((prev) => (prev ? { ...prev, iaAtiva: newVal } : null));
                setClientesList((prev) =>
                    prev.map((c) =>
                        String(c.telefone) === String(selectedTelefone) && c.canal === selectedCanal
                            ? { ...c, iaAtiva: newVal }
                            : c
                    )
                );
                // Invalida cache deste cliente — flag ia_ativa mudou.
                clienteCache.current.delete(`${selectedTelefone}|${selectedCanal}`);
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

    // Marca o balão optimistic como falho e registra o retry — clique no
    // balão (ChatWindow → handleRetryFailed) reenvia o mesmo conteúdo.
    function markSendFailed(optimisticId: string | null, retry: () => void) {
        if (!optimisticId) return;
        updateOptimisticRef.current?.(optimisticId, { _failed: true });
        failedRetryRef.current.set(optimisticId, retry);
    }

    function handleRetryFailed(msg: import("@/lib/actions/leads").LeadMessage) {
        const retry = failedRetryRef.current.get(msg.id);
        failedRetryRef.current.delete(msg.id);
        removeOptimisticRef.current?.(msg.id);
        retry?.();
    }

    function sendTextMessage(text: string, currentReply: import("@/lib/actions/leads").LeadMessage | null) {
        if (!cliente?.telefone) return;
        const senderName = "Alegrando";
        const optimisticId = addOptimisticRef.current?.(text, senderName) ?? null;

        (async () => {
            try {
                let res: { success: boolean };
                if (currentReply) {
                    const { replyToMessage } = await import("@/lib/actions/messages");
                    res = await replyToMessage({
                        telefone: cliente.telefone,
                        text,
                        senderName,
                        iaAtiva: cliente.iaAtiva,
                        replyToZapiId: currentReply.zapiMessageId ?? null,
                        replyToContent: currentReply.content,
                        replyToSenderName: currentReply.senderName ?? null,
                        canal: cliente.canal,
                    });
                } else {
                    res = await sendMessage({
                        telefone: cliente.telefone,
                        mensagem: text,
                        sender_name: senderName,
                        iaAtiva: cliente.iaAtiva,
                        canal: cliente.canal,
                    });
                }
                if (!res.success) {
                    markSendFailed(optimisticId, () => sendTextMessage(text, currentReply));
                }
            } catch {
                markSendFailed(optimisticId, () => sendTextMessage(text, currentReply));
            }
        })();
    }

    function handleSendMessage() {
        if (!cliente?.telefone || !chatMessage.trim()) return;
        const text = chatMessage.trim();
        const currentReply = replyTo;
        setChatMessage("");
        setReplyTo(null);
        sendTextMessage(text, currentReply);
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
            const result = await deleteCliente(selectedTelefone, selectedCanal);
            if (result.success) {
                // Invalida caches: detalhes do cliente excluído + listas (todas
                // as variações de search/canal podem ter referência a ele).
                clienteCache.current.delete(`${selectedTelefone}|${selectedCanal}`);
                clientesListCache.current.clear();
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
            const result = await clearClienteMessages(selectedTelefone, selectedCanal);
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

    /**
     * Entrada única da bandeja de anexos do chat.
     *
     * Extraído de `handleFileSelect` para o colar (Ctrl+V) cair exatamente no
     * mesmo lugar do 📎 — limite de tamanho, preview e foco na legenda. Dois
     * caminhos separados divergiriam no primeiro ajuste de limite.
     */
    function adicionarArquivos(files: File[]) {
        if (files.length === 0) return;
        const FILE_MAX = 10 * 1024 * 1024;
        const VIDEO_MAX = 16 * 1024 * 1024;
        for (const file of files) {
            const isVideo = file.type.startsWith("video/");
            const limit = isVideo ? VIDEO_MAX : FILE_MAX;
            if (file.size > limit) {
                setToast({ type: "error", text: `"${file.name}" é muito grande. Máximo ${limit / 1024 / 1024}MB.` });
                return;
            }
        }
        const newAttachments = files.map(file => ({
            file,
            preview: file.type.startsWith("image/") || file.type.startsWith("video/")
                ? URL.createObjectURL(file)
                : null,
            caption: "",
            id: Date.now().toString() + Math.random().toString(36).slice(2),
        }));
        setAttachments(prev => [...prev, ...newAttachments]);
        // Auto-focus the caption of the first new attachment
        setTimeout(() => firstCaptionRef.current?.focus(), 50);
    }

    function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
        adicionarArquivos(Array.from(e.target.files || []));
        e.target.value = "";
    }

    /**
     * Colar na caixa do chat.
     *
     * Só intercepta quando o clipboard traz ARQUIVO. Texto — inclusive uma URL
     * de imagem copiada da web — segue o caminho normal e é colado como texto:
     * adivinhar que uma URL colada deveria virar anexo surpreende mais do que
     * ajuda, e quebraria o uso mais comum da caixa, que é colar um endereço pra
     * mandar pra escola.
     *
     * `clipboardData.files` já cobre tanto o print (bitmap `image/png`) quanto o
     * arquivo copiado do explorador de arquivos.
     */
    function handleChatPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
        const arquivos = Array.from(e.clipboardData?.files ?? []);
        if (arquivos.length === 0) return;
        e.preventDefault();
        adicionarArquivos(arquivos);
    }

    /**
     * Quebra de linha do Alt+Enter.
     *
     * `execCommand` em vez de montar a string na mão porque ele passa pela pilha
     * de desfazer do navegador e mantém o cursor onde estava — Ctrl+Z continua
     * funcionando. O `else` cobre o dia em que o navegador aposentar a API: aí o
     * cursor é reposicionado à mão, no frame seguinte, já que o valor só chega
     * ao DOM depois do render do React.
     */
    function inserirQuebraDeLinha() {
        const el = chatInputRef.current;
        if (!el) return;
        el.focus();
        if (document.execCommand("insertText", false, "\n")) return;

        const inicio = el.selectionStart ?? el.value.length;
        const fim = el.selectionEnd ?? inicio;
        const novo = `${el.value.slice(0, inicio)}\n${el.value.slice(fim)}`;
        setChatMessage(novo);
        requestAnimationFrame(() => {
            const alvo = chatInputRef.current;
            if (alvo) alvo.selectionStart = alvo.selectionEnd = inicio + 1;
        });
    }

    // ========= Audio record / send handlers =========
    function handleAudioRecorded(file: File, previewUrl: string) {
        if (file.size > 16 * 1024 * 1024) {
            URL.revokeObjectURL(previewUrl);
            setToast({ type: "error", text: "Áudio muito longo. Máximo 16MB." });
            return;
        }
        setAudioAttachment({ file, previewUrl });
    }

    function handleCancelAudio() {
        if (audioAttachment) URL.revokeObjectURL(audioAttachment.previewUrl);
        setAudioAttachment(null);
    }

    // Envia o áudio com bolha OTIMISTA: aparece na hora (tocando o blob local) e é
    // reconciliada com a URL real do R2 quando a action retorna — sem esperar o
    // ciclo todo (mata o delay percebido).
    function sendAudioCore(file: File, previewUrl: string, senderName: string, telefone: string, canal: string) {
        const optimisticId = addOptimisticRef.current?.(previewUrl, senderName, "audio") ?? null;
        (async () => {
            try {
                const formData = new FormData();
                formData.append("file", file);
                formData.append("telefone", telefone);
                formData.append("sender_name", senderName);
                formData.append("canal", canal);
                const res = await sendAudioMessage(formData);
                if (!res.success) {
                    markSendFailed(optimisticId, () => sendAudioCore(file, previewUrl, senderName, telefone, canal));
                    return;
                }
                // Troca o content pro URL real do R2: o Realtime dedupa por content
                // (se ligado); se off, a bolha persiste já com a URL definitiva.
                if (optimisticId && res.url) {
                    updateOptimisticRef.current?.(optimisticId, { content: res.url, _optimistic: false });
                }
                URL.revokeObjectURL(previewUrl);
            } catch {
                markSendFailed(optimisticId, () => sendAudioCore(file, previewUrl, senderName, telefone, canal));
            }
        })();
    }

    function handleSendAudio() {
        if (!cliente?.telefone || !audioAttachment) return;
        const { file, previewUrl } = audioAttachment;
        const senderName = "Alegrando";
        setAudioAttachment(null); // fecha o preview; a bolha otimista assume
        sendAudioCore(file, previewUrl, senderName, cliente.telefone, cliente.canal ?? "alegrando");
    }

    // ========= Send attachments handler =========
    // Até este tamanho o arquivo sobe pela server action (server → R2, com dedup);
    // acima, sobe direto browser→R2 via presigned PUT (next.config libera 10MB de
    // body na server action). O path >10MB exige CORS de PUT no bucket R2.
    const DIRECT_UPLOAD_THRESHOLD = 10 * 1024 * 1024;

    async function sendAttachment(att: { file: File; preview: string | null; caption: string; id: string }) {
        if (!cliente?.telefone) return;
        const senderName = "Alegrando";
        const isVideo = att.file.type.startsWith("video/");
        const isImage = att.file.type.startsWith("image/");
        const mediaType: "image" | "video" | "document" = isImage ? "image" : isVideo ? "video" : "document";
        const caption = att.caption.trim();

        // Bolha OTIMISTA pra TODO tipo (imagem/vídeo/documento): aparece na hora
        // usando o arquivo local — mata o delay percebido (upload R2 + envio +
        // insert). Imagem/vídeo reusam o object URL do preview; documento cria um
        // agora pra renderizar o card (nome/ícone/preview de PDF). É reconciliada
        // in-place com a URL real do R2 quando a action retorna (padrão do áudio):
        // o content passa a bater com o eco do Realtime, que então substitui esta
        // bolha sem flicker nem duplicata.
        const localUrl = att.preview ?? URL.createObjectURL(att.file);
        const optimisticContent = mediaType === "document"
            ? `${localUrl}|||${att.file.name}` // nome real no card enquanto envia
            : (caption ? `${localUrl}|||${caption}` : localUrl);
        const optimisticId = addOptimisticRef.current?.(optimisticContent, senderName, mediaType) ?? null;

        // Falha = o próprio balão fica marcado com retry (clique reenvia) — sem banner.
        const markFailed = (errText: string) => {
            if (optimisticId) {
                markSendFailed(optimisticId, () => { void sendAttachment(att); });
            } else {
                setToast({ type: "error", text: errText });
            }
        };

        try {
            let res: { success: boolean; error?: string; content?: string };

            if (att.file.size > DIRECT_UPLOAD_THRESHOLD) {
                const signed = await createSignedUploadUrl(att.file.name, cliente.telefone, cliente.canal ?? "alegrando", att.file.type);
                if (!signed.success || !signed.path || !signed.signedUrl) {
                    markFailed(signed.error || "Falha ao preparar upload.");
                    return;
                }
                // PUT direto no R2 via presigned URL. O Content-Type precisa bater
                // com o que foi assinado no server (senão o R2 recusa a assinatura).
                try {
                    const putRes = await fetch(signed.signedUrl, {
                        method: "PUT",
                        body: att.file,
                        headers: { "Content-Type": att.file.type || "application/octet-stream" },
                    });
                    if (!putRes.ok) {
                        markFailed(`Falha no upload: ${putRes.status}`);
                        return;
                    }
                } catch (err) {
                    markFailed(`Falha no upload: ${String(err)}`);
                    return;
                }
                res = await sendUploadedFileMessage({
                    path: signed.path,
                    telefone: cliente.telefone,
                    canal: cliente.canal ?? "alegrando",
                    caption: att.caption,
                    mediaType,
                    fileName: att.file.name,
                    mimeType: att.file.type,
                    senderName,
                });
            } else {
                const formData = new FormData();
                formData.append("file", att.file);
                formData.append("telefone", cliente.telefone);
                formData.append("sender_name", senderName);
                formData.append("caption", att.caption);
                formData.append("canal", cliente.canal ?? "alegrando");
                res = await sendFileMessage(formData);
            }

            if (res.success) {
                // Reconcilia in-place: troca o preview local pela URL/content REAL
                // do R2. O content bate com o eco do Realtime → a bolha definitiva
                // substitui esta sem flicker; se o Realtime atrasar/estiver off, a
                // bolha já mostra a mídia real (não some).
                if (optimisticId && res.content) {
                    updateOptimisticRef.current?.(optimisticId, { content: res.content, _optimistic: false });
                } else if (optimisticId) {
                    // Defensivo (action não devolveu content): remove e deixa o Realtime trazer.
                    removeOptimisticRef.current?.(optimisticId);
                }
                // Reconciliado: o object URL local não é mais referenciado → revoga.
                URL.revokeObjectURL(localUrl);
            } else {
                markFailed(res.error || "Erro ao enviar arquivo.");
            }
        } catch (err) {
            markFailed(`Erro ao enviar arquivo: ${err}`);
        }
    }

    function handleSendAttachments() {
        if (!cliente?.telefone || attachments.length === 0) return;
        if (isSendingFile) return; // guard contra duplo-clique
        const toSend = attachments;
        setIsSendingFile(true);
        setAttachments([]); // limpa preview imediatamente para impedir reenvio

        (async () => {
            try {
                for (const att of toSend) {
                    await sendAttachment(att);
                }
            } finally {
                setIsSendingFile(false);
            }
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
            onEmailLidoLocal={(quantidade) => {
                // Otimista, como o toggle de tag logo abaixo: a lista não é
                // recarregada só por causa disso. Se a contagem sair de sincro
                // (duas abas abertas, por exemplo), o próximo carregamento da
                // lista corrige — o número vem do banco.
                markOptimisticChange();
                setClientesList((prev) =>
                    prev.map((c) =>
                        String(c.telefone) === String(selectedTelefone) &&
                        c.canal === selectedCanal
                            ? {
                                  ...c,
                                  emailUnreadCount: Math.max(
                                      0,
                                      c.emailUnreadCount - quantidade,
                                  ),
                              }
                            : c,
                    ),
                );
            }}
            focusField={searchParams.get("focus")}
            leadLabels={cliente.labels}
            availableLabels={availableLabels}
            onLabelToggleLocal={(labelId, action) => {
                markOptimisticChange();
                // 1. Cliente atual (badge no painel)
                setCliente((prev) => {
                    if (!prev) return prev;
                    if (action === "add") {
                        const label = availableLabels.find((l) => l.id === labelId);
                        if (!label) return prev;
                        if ((prev.labels || []).some((l) => l.id === labelId)) return prev;
                        return {
                            ...prev,
                            labels: [
                                ...(prev.labels || []),
                                { id: label.id, name: label.name, color: label.color },
                            ],
                        };
                    }
                    return {
                        ...prev,
                        labels: (prev.labels || []).filter((l) => l.id !== labelId),
                    };
                });
                // 2. Item na lista lateral (badge na sidebar)
                setClientesList((prev) =>
                    prev.map((c) => {
                        if (
                            String(c.telefone) !== String(selectedTelefone) ||
                            c.canal !== selectedCanal
                        ) {
                            return c;
                        }
                        if (action === "add") {
                            const label = availableLabels.find((l) => l.id === labelId);
                            if (!label) return c;
                            if ((c.labels || []).some((l) => l.id === labelId)) return c;
                            return {
                                ...c,
                                labels: [
                                    ...(c.labels || []),
                                    { id: label.id, name: label.name, color: label.color },
                                ],
                            };
                        }
                        return {
                            ...c,
                            labels: (c.labels || []).filter((l) => l.id !== labelId),
                        };
                    })
                );
                // 3. Invalida cache pro próximo load reler do servidor.
                clienteCache.current.delete(`${selectedTelefone}|${selectedCanal}`);
                clientesListCache.current.clear();
            }}
            onLabelCreatedLocal={(label) => {
                markOptimisticChange();
                setAvailableLabels((prev) => {
                    if (prev.some((l) => l.id === label.id)) return prev;
                    return [...prev, label].sort((a, b) => a.name.localeCompare(b.name));
                });
            }}
            onLabelUpdatedLocal={(labelId, updates) => {
                markOptimisticChange();
                setAvailableLabels((prev) =>
                    prev.map((l) => (l.id === labelId ? { ...l, ...updates } : l))
                );
                setClientesList((prev) =>
                    prev.map((c) => ({
                        ...c,
                        labels: (c.labels || []).map((l) =>
                            l.id === labelId
                                ? {
                                      id: l.id,
                                      name: updates.name ?? l.name,
                                      color: updates.color ?? l.color,
                                  }
                                : l
                        ),
                    }))
                );
                setCliente((prev) =>
                    prev
                        ? {
                              ...prev,
                              labels: (prev.labels || []).map((l) =>
                                  l.id === labelId
                                      ? {
                                            id: l.id,
                                            name: updates.name ?? l.name,
                                            color: updates.color ?? l.color,
                                        }
                                      : l
                              ),
                          }
                        : prev
                );
                clientesListCache.current.clear();
                if (selectedTelefone) {
                    clienteCache.current.delete(`${selectedTelefone}|${selectedCanal}`);
                }
            }}
            onLabelDeletedLocal={(labelId) => {
                markOptimisticChange();
                setAvailableLabels((prev) => prev.filter((l) => l.id !== labelId));
                setClientesList((prev) =>
                    prev.map((c) => ({
                        ...c,
                        labels: (c.labels || []).filter((l) => l.id !== labelId),
                    }))
                );
                setCliente((prev) =>
                    prev
                        ? {
                              ...prev,
                              labels: (prev.labels || []).filter((l) => l.id !== labelId),
                          }
                        : prev
                );
                setLabelFiltro((prev) => prev.filter((id) => id !== labelId));
                clientesListCache.current.clear();
            }}
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

                    <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-[10px] font-semibold text-[#6366F1] dark:text-[#94a3b8] uppercase tracking-wider">
                            Ordenar por:
                        </span>
                        <div className="flex items-center gap-1.5">
                            <SortFilterDropdown
                                sortOrder={sortOrder}
                                iaFiltro={iaFiltro}
                                tipoFiltro={tipoFiltro}
                                onSortChange={(v) => { setIaFiltro("todos"); setSortOrder(v); }}
                                onIaChange={(v) => setIaFiltro(v)}
                                onTipoChange={(v) => setTipoFiltro(v)}
                            />
                            <LabelFilterButton
                                selectedIds={labelFiltro}
                                onChange={(ids) => {
                                    setLabelFiltro(ids);
                                    localStorage.setItem("crm_label_filtro", JSON.stringify(ids));
                                }}
                                availableLabels={availableLabels}
                            />
                        </div>
                    </div>


                    {/* IA filter — quick row to clear current filter when active */}
                    {iaFiltro !== "todos" && (
                        <div className="mt-2 flex items-center justify-between gap-2">
                            <span className="text-[10px] font-semibold text-[#6366F1] dark:text-[#94a3b8] uppercase tracking-wider">
                                Filtro IA: {iaFiltro === "ia_ativa" ? "🤖 Ativa" : "👤 Manual"}
                            </span>
                            <button
                                onClick={() => setIaFiltro("todos")}
                                className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border border-[#C7D2FE] dark:border-[#3d4a60] text-[#6366F1] dark:text-[#94a3b8] hover:text-foreground transition-colors"
                            >
                                Limpar
                            </button>
                        </div>
                    )}
                </div>

                {/* Barra de disparo — só aparece com tag filtrada. O público sai
                    das tags ativas (o modal mostra e deixa desmarcar quem for). */}
                {labelFiltro.length > 0 && (
                    <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b-2 border-border bg-brand-500/10">
                        <Mail className="w-3.5 h-3.5 text-brand-500 dark:text-brand-400 shrink-0" />
                        <span className="text-[11px] font-medium text-[#37352F] dark:text-[#cbd5e1] truncate">
                            {availableLabels
                                .filter((l) => labelFiltro.includes(l.id))
                                .map((l) => l.name)
                                .join(", ") || `${labelFiltro.length} tags`}
                        </span>
                        <button
                            onClick={() => setEmailBlastOpen(true)}
                            className="ml-auto shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-brand-500 text-white hover:bg-brand-600 transition-colors"
                        >
                            Enviar e-mail
                        </button>
                    </div>
                )}

                {/* List */}
                <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-2 py-2">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="w-5 h-5 animate-spin text-[#6366F1] dark:text-[#94a3b8]" />
                        </div>
                    ) : showFilterSkeleton ? (
                        <LeadListSkeleton count={7} />
                    ) : clientesList.length === 0 ? (
                        <div className="text-center py-12 text-sm text-[#6366F1] dark:text-[#94a3b8]">
                            Nenhum cliente encontrado
                        </div>
                    ) : (
                        <div className="space-y-1.5 flex flex-col">
                            {sortedLeads.map((item) => (
                                <LeadListItem
                                    key={`${item.telefone.toString()}__${item.canal}`}
                                    item={item}
                                    isSelected={selectedTelefone === item.telefone.toString() && selectedCanal === item.canal}
                                    onClick={() => handleSelectCliente(item.telefone.toString(), item.canal)}
                                    tick={tick}
                                />
                            ))}
                            {clientesList.length < totalClientes && (
                                <div ref={loadMoreRef} className="flex justify-center py-4">
                                    {loadingMore && (
                                        <span className="flex items-center gap-1.5 text-xs text-[#6366F1] dark:text-[#94a3b8]">
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                            Carregando...
                                        </span>
                                    )}
                                </div>
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
                                    <div className={cn(
                                        "w-10 h-10 rounded-full shrink-0 border overflow-hidden flex items-center justify-center text-sm font-bold",
                                        isGroupTelefone(cliente.telefone)
                                            ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400"
                                            : "bg-[#E0E7FF] dark:bg-[#2d3347] border-[#A5B4FC] dark:border-[#4a5568] text-[#191918] dark:text-white"
                                    )}>
                                        {isValidPhotoUrl(cliente.fotoUrl) ? (
                                            <Image
                                                src={cliente.fotoUrl}
                                                alt={cliente.nome || "avatar"}
                                                width={40}
                                                height={40}
                                                className="w-full h-full object-cover"
                                                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                                                unoptimized={cliente.fotoUrl.includes("pps.whatsapp.net")}
                                            />
                                        ) : isGroupTelefone(cliente.telefone) ? (
                                            <Users className="w-5 h-5" />
                                        ) : (
                                            (cliente.nome || String(cliente.telefone)).charAt(0).toUpperCase()
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="font-display text-base font-bold text-[#191918] dark:text-white leading-tight truncate tracking-tight">
                                            {cliente.nome || "Sem nome"}
                                        </h3>
                                        <p className="text-xs text-[#191918] dark:text-white font-mono font-medium tracking-wide mt-0.5">
                                            {isGroupTelefone(cliente.telefone) ? "Grupo WhatsApp" : cliente.telefone}
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
                                    title="Dados do cliente"
                                    aria-label="Dados do cliente"
                                    className="lg:hidden p-2 rounded-lg hover:bg-[#EEF2FF] dark:hover:bg-[#1e2536] text-[#6366F1] dark:text-[#94a3b8] hover:text-[#191918] dark:hover:text-white transition-colors"
                                >
                                    <PanelRightOpen className="w-5 h-5" />
                                </button>

                                {/* AI Toggle */}
                                {(
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
                            leadName={cliente.nome}
                            onReady={(fns) => {
                                addOptimisticRef.current = fns.addOptimisticMessage;
                                removeOptimisticRef.current = fns.removeMessageById;
                                updateOptimisticRef.current = fns.updateMessageById;
                            }}
                            onReply={(msg) => setReplyTo(msg)}
                            onRetryFailed={handleRetryFailed}
                        />

                        {/* Audio preview */}
                        {audioAttachment && (
                            <div className="px-5 py-3 border-t border-border/50 bg-[#F7F7F5] dark:bg-[#0f1829]/60 flex items-center gap-3">
                                <AudioPlayer src={audioAttachment.previewUrl} variant="sent" className="flex-1" />
                                <button
                                    onClick={handleCancelAudio}
                                    className="p-1.5 rounded-lg text-[#6366F1] dark:text-[#94a3b8] hover:text-[#191918] dark:hover:text-white hover:bg-[#EEF2FF] dark:hover:bg-[#1e2536] transition-colors shrink-0"
                                    title="Cancelar"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={handleSendAudio}
                                    className="flex items-center justify-center h-9 px-3 rounded-lg bg-brand-500 text-[#191918] dark:text-white text-sm font-semibold hover:bg-brand-600 transition-colors shadow shadow-brand-500/25 shrink-0 gap-1.5"
                                >
                                    <Send className="w-3.5 h-3.5" />
                                    Enviar
                                </button>
                            </div>
                        )}

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
                            {/* `items-end` e não `items-center`: a caixa cresce pra
                                cima ao quebrar linha, e os botões precisam ficar
                                colados na base junto com a última linha. Em
                                repouso tudo tem h-10, então o visual é o mesmo. */}
                            <div className="flex gap-2 items-end">
                                {/* Emoji picker */}
                                <EmojiPickerInput
                                    onEmojiSelect={(emoji) => setChatMessage((prev) => prev + emoji)}
                                />
                                {/* File attachment */}
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    multiple
                                    accept="image/*,video/*,application/pdf,.doc,.docx"
                                    className="hidden"
                                    onChange={handleFileSelect}
                                />
                                {!isRecordingAudio && (
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
                                )}
                                <AudioRecorder
                                    disabled={cliente.iaAtiva || !!audioAttachment}
                                    onRecorded={handleAudioRecorded}
                                    onRecordingChange={setIsRecordingAudio}
                                    onError={(msg) => setToast({ type: "error", text: msg })}
                                />
                                {!isRecordingAudio && (
                                    <>
                                        <textarea
                                            ref={registrarCaixa}
                                            rows={1}
                                            value={chatMessage}
                                            onChange={(e) => setChatMessage(e.target.value)}
                                            onPaste={handleChatPaste}
                                            disabled={cliente.iaAtiva || attachments.length > 0}
                                            placeholder={
                                                cliente.iaAtiva
                                                    ? "Pause a IA para enviar manualmente..."
                                                    : attachments.length > 0
                                                        ? "Adicione legenda nos arquivos acima ou clique em enviar"
                                                        : "Digite uma mensagem..."
                                            }
                                            className="rounded-xl flex-1 min-h-10 resize-none overflow-y-auto border px-3 py-2 text-sm leading-6 shadow-xs outline-none transition-[color,box-shadow] disabled:cursor-not-allowed disabled:opacity-50 bg-[#EEF2FF] dark:bg-[#1e2536] border-[#A5B4FC] dark:border-[#4a5568] text-[#191918] dark:text-white placeholder:text-[#6366F1] dark:placeholder:text-[#94a3b8] focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/20"
                                            onKeyDown={(e) => {
                                                if (e.key !== "Enter") return;

                                                // Acento morto e IME: enquanto a
                                                // composição está aberta, o Enter é
                                                // do teclado, não nosso. Sem esta
                                                // guarda, digitar "não" no ABNT2
                                                // podia enviar no meio da palavra.
                                                // `keyCode 229` cobre o Safari, que
                                                // nem sempre popula `isComposing`.
                                                if (e.nativeEvent.isComposing || e.keyCode === 229) return;

                                                // Shift+Enter: o textarea já quebra
                                                // linha sozinho. Deixar o default
                                                // correr preserva o desfazer nativo
                                                // e o cursor no meio do texto.
                                                if (e.shiftKey) return;

                                                // Alt+Enter NÃO tem quebra por
                                                // padrão — ao contrário do Shift, o
                                                // navegador engole a tecla. Por isso
                                                // este ramo insere na mão, e não
                                                // basta um `return` como o de cima.
                                                if (e.altKey) {
                                                    e.preventDefault();
                                                    inserirQuebraDeLinha();
                                                    return;
                                                }

                                                if (e.ctrlKey || e.metaKey) return;

                                                if (!cliente.iaAtiva && attachments.length === 0) {
                                                    e.preventDefault();
                                                    handleSendMessage();
                                                }
                                            }}
                                        />
                                        <button
                                            onClick={attachments.length > 0 ? handleSendAttachments : handleSendMessage}
                                            disabled={
                                                isSendingMessage ||
                                                isSendingFile ||
                                                cliente.iaAtiva ||
                                                (attachments.length === 0 && !chatMessage.trim())
                                            }
                                            className="flex items-center justify-center w-10 h-10 rounded-xl bg-brand-500 text-[#191918] dark:text-white hover:bg-brand-600 disabled:opacity-50 transition-colors shadow-lg shadow-brand-500/25 shrink-0"
                                        >
                                            {isSendingMessage || isSendingFile ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <Send className="w-4 h-4" />
                                            )}
                                        </button>
                                    </>
                                )}
                            </div>
                            <p className="text-[10px] text-[#9B9A97] dark:text-[#64748b] mt-1.5 text-center">
                                {cliente.iaAtiva
                                    ? "IA ativa — pause para enviar mensagens manualmente"
                                    : "Enter envia · Alt+Enter (ou Shift+Enter) quebra linha · 📎 ou Ctrl+V para anexar"}
                            </p>
                        </div>
                    </>
                ) : null}
            </div>

            {/* =================== RIGHT: DETAILS (desktop) =================== */}
            {/* Recolhível: o chat (flex-1) reflowa sozinho; transition na largura
                dá o ajuste suave. Em mobile o painel continua como Sheet. */}
            {/* Coluna fixa só a partir de `lg`, e não de `md`, por aritmética:
                a 768px sobram 656px de conteúdo, e lista (350) + detalhes (300)
                + bordas já somam 654 — o chat ficava com 6px, ilegível. Entre
                768 e 1023 os detalhes continuam a um toque, pelo mesmo Sheet
                que o mobile usa. */}
            <div className={cn(
                "hidden lg:flex flex-col border-l-2 border-border bg-background bento-enter [animation-delay:300ms] transition-all duration-300 overflow-hidden",
                detailsCollapsed ? "w-[44px] min-w-[44px]" : "w-[300px] min-w-[300px]"
            )}>
                {detailsCollapsed ? (
                    <button
                        onClick={() => setDetailsCollapsed(false)}
                        title="Expandir dados do cliente"
                        className="mt-3 mx-auto p-2 rounded-lg hover:bg-[#EEF2FF] dark:hover:bg-[#1e2536] text-[#6366F1] dark:text-[#94a3b8] hover:text-[#191918] dark:hover:text-white transition-colors"
                    >
                        <PanelRightOpen className="w-4 h-4" />
                    </button>
                ) : (
                    <>
                        <div className="flex justify-end px-2 pt-2 shrink-0">
                            <button
                                onClick={() => setDetailsCollapsed(true)}
                                title="Recolher dados do cliente"
                                className="p-1.5 rounded-lg hover:bg-[#EEF2FF] dark:hover:bg-[#1e2536] text-[#6366F1] dark:text-[#94a3b8] hover:text-[#191918] dark:hover:text-white transition-colors"
                            >
                                <PanelRightClose className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            {detailPanelContent}
                        </div>
                    </>
                )}
            </div>

            {/* =================== MOBILE: Details Sheet =================== */}
            <Sheet open={mobileDetailsOpen} onOpenChange={setMobileDetailsOpen}>
                {/* As guardas existem por causa do campo de responder e-mail que
                    vive aqui dentro: a barra de formatação e o Google Picker são
                    portalizados no body, e sem isto o Radix leria um clique neles
                    como "fora" e fecharia o painel com o rascunho junto. */}
                <SheetContent
                    side="right"
                    className="w-[320px] max-w-[90vw] bg-background border-border overflow-y-auto p-0 lg:hidden"
                    onPointerDownOutside={ignorarSeForPortalDeEmail}
                    onInteractOutside={ignorarSeForPortalDeEmail}
                    onFocusOutside={ignorarSeForPortalDeEmail}
                    onEscapeKeyDown={(e) => {
                        if (isGooglePickerOpen()) e.preventDefault();
                    }}
                >
                    {detailPanelContent}
                </SheetContent>
            </Sheet>

            {/* =================== NEW LEAD MODAL =================== */}
            {showNewLeadModal && (
                <NovoLeadModal
                    onClose={() => { setShowNewLeadModal(false); }}
                    onCreated={(tel, canal) => { loadList(); handleSelectCliente(tel, canal); }}
                    onToast={setToast}
                />
            )}

            {/* =================== DISPARO DE E-MAIL (POR TAG) =================== */}
            <EmailComposeModal
                open={emailBlastOpen}
                onOpenChange={setEmailBlastOpen}
                target={{
                    mode: "tags",
                    labelIds: labelFiltro,
                    availableLabels,
                    canal: canalFiltro,
                }}
                onToast={setToast}
            />
        </div>
    );
}

