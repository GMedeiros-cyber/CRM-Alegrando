"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useLeadMessages } from "@/hooks/useLeadMessages";
import type { LeadMessage } from "@/lib/actions/leads";
import { MessageSquare, Loader2, Search, X, ChevronUp, ChevronDown, FileText, Image as ImageIcon, Mic, Pin } from "lucide-react";
import { cn } from "@/lib/utils";
import { MessageContextMenu } from "./message-context-menu";
import { PinnedMessageBanner } from "./pinned-message-banner";
import { ReactionPicker } from "./reaction-picker";
import { reactToMessage, deleteMessage, pinMessage } from "@/lib/actions/messages";

export interface ChatWindowHandles {
    addOptimisticMessage: (content: string, senderName?: string) => void;
}

interface ChatWindowProps {
    telefone: string;
    onReady?: (fns: ChatWindowHandles) => void;
    onReply?: (msg: LeadMessage) => void;
}

// =============================================
// DATE SEPARATOR
// =============================================
function formatDateLabel(date: Date): string {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const msgDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffMs = today.getTime() - msgDay.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Hoje";
    if (diffDays === 1) return "Ontem";
    if (diffDays < 7) return date.toLocaleDateString("pt-BR", { weekday: "long" });
    return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function DateSeparator({ date }: { date: Date }) {
    return (
        <div className="flex items-center justify-center my-3 pointer-events-none select-none">
            <div className="px-3 py-1 rounded-lg bg-slate-800/80 border border-slate-700/50 shadow-sm">
                <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">
                    {formatDateLabel(date)}
                </span>
            </div>
        </div>
    );
}

// =============================================
// SENDER LABEL
// =============================================
function SenderLabel({ message, isClient }: { message: LeadMessage; isClient: boolean }) {
    if (isClient) {
        return (
            <div className="flex items-center gap-1.5 mb-1">
                <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-600/30">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                    <span className="text-[11px] font-bold tracking-wide text-slate-400">
                        {message.senderName || "Cliente"}
                    </span>
                </div>
            </div>
        );
    }
    if (message.senderType === "ia") {
        return (
            <div className="flex items-center gap-1.5 mb-1">
                <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-violet-500/10">
                    <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                    <span className="text-[11px] font-bold tracking-wide text-violet-400">Jade</span>
                </div>
            </div>
        );
    }
    return (
        <div className="flex items-center gap-1.5 mb-1">
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/10">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="text-[11px] font-bold tracking-wide text-emerald-400">
                    {message.senderName || "Alegrando"}
                </span>
            </div>
        </div>
    );
}

// =============================================
// MESSAGE CONTENT
// =============================================
function parseMediaContent(content: string): { url: string; caption: string } {
    const sep = "|||";
    const idx = content.indexOf(sep);
    if (idx !== -1) return { url: content.slice(0, idx), caption: content.slice(idx + sep.length) };
    return { url: content, caption: "" };
}

function MessageContent({ message, isSelf, highlight }: { message: LeadMessage; isSelf: boolean; highlight?: string }) {
    // Mensagem apagada para todos
    if (message.content === "__DELETED_FOR_ALL__") {
        return (
            <span className={cn("flex items-center gap-1.5 text-sm italic", isSelf ? "text-white/40" : "text-slate-500")}>
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                Mensagem apagada
            </span>
        );
    }

    if (message.mediaType === "audio") {
        return (
            <div className={cn("flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium", isSelf ? "bg-white/10 text-white/80" : "bg-slate-700/60 text-slate-300")}>
                <Mic className="w-4 h-4 shrink-0" />
                <span>Áudio recebido</span>
            </div>
        );
    }
    if (message.mediaType === "image") {
        const { url, caption } = parseMediaContent(message.content || "");
        if (url.startsWith("http")) {
            return (
                <div>
                    <img src={url} alt="imagem" className="max-w-[240px] rounded-xl object-cover cursor-pointer hover:opacity-90 transition-opacity" onClick={() => window.open(url, "_blank")} />
                    {caption && <p className="text-xs mt-1.5 text-white/70 leading-relaxed">{caption}</p>}
                </div>
            );
        }
        return (
            <div className={cn("flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium", isSelf ? "bg-white/10 text-white/80" : "bg-slate-700/60 text-slate-300")}>
                <ImageIcon className="w-4 h-4 shrink-0" />
                <span>Imagem recebida</span>
            </div>
        );
    }
    if (message.mediaType === "document") {
        const { url, caption } = parseMediaContent(message.content || "");
        if (url.startsWith("http")) {
            const fileName = url.split("/").pop()?.split("?")[0] || "Documento";
            return (
                <div>
                    <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 transition-colors max-w-[240px] border border-white/10">
                        <FileText className="w-8 h-8 text-brand-400 shrink-0" />
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-white truncate">{decodeURIComponent(fileName)}</p>
                            <p className="text-[10px] text-white/50">Toque para abrir</p>
                        </div>
                    </a>
                    {caption && <p className="text-xs mt-1.5 text-white/70 leading-relaxed">{caption}</p>}
                </div>
            );
        }
        return (
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium border bg-red-500/10 border-red-500/20 text-red-300">
                <FileText className="w-5 h-5 shrink-0 text-red-400" />
                <div className="flex flex-col">
                    <span className="font-semibold text-[13px]">Documento</span>
                    <span className="text-[10px] opacity-70">Arquivo enviado</span>
                </div>
            </div>
        );
    }
    const content = message.content;
    if (highlight && content) {
        const regex = new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
        const parts = content.split(regex);
        return (
            <p className="text-sm whitespace-pre-wrap leading-relaxed">
                {parts.map((part, i) => regex.test(part) ? <mark key={i} className="bg-yellow-400/30 text-yellow-200 rounded-sm px-0.5">{part}</mark> : <span key={i}>{part}</span>)}
            </p>
        );
    }
    // Detectar JSON blob acidental (payload Z-API vazou como texto)
    if (content && content.startsWith("{") && content.includes("connectedPhone")) {
        return (
            <div className={cn("flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium", isSelf ? "bg-white/10 text-white/80" : "bg-slate-700/60 text-slate-300")}>
                <FileText className="w-4 h-4 shrink-0" />
                <span>Mídia enviada pelo WhatsApp</span>
            </div>
        );
    }
    return <p className="text-sm whitespace-pre-wrap leading-relaxed">{content}</p>;
}

// =============================================
// SEARCH BAR
// =============================================
function ChatSearchBar({ onSearch, matchCount, currentMatch, onPrev, onNext, onClose }: {
    onSearch: (term: string) => void; matchCount: number; currentMatch: number;
    onPrev: () => void; onNext: () => void; onClose: () => void;
}) {
    const [term, setTerm] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);
    useEffect(() => { inputRef.current?.focus(); }, []);

    return (
        <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/90 border-b border-slate-700/50 animate-in slide-in-from-top-2 duration-200">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input ref={inputRef} value={term} onChange={(e) => { setTerm(e.target.value); onSearch(e.target.value); }}
                placeholder="Buscar na conversa..." className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 outline-none"
                onKeyDown={(e) => { if (e.key === "Enter") e.shiftKey ? onPrev() : onNext(); if (e.key === "Escape") onClose(); }} />
            {term && <span className="text-[11px] text-slate-400 shrink-0 tabular-nums">{matchCount > 0 ? `${currentMatch + 1}/${matchCount}` : "0/0"}</span>}
            <div className="flex items-center gap-0.5">
                <button onClick={onPrev} disabled={matchCount === 0} className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white disabled:opacity-30 transition-colors"><ChevronUp className="w-4 h-4" /></button>
                <button onClick={onNext} disabled={matchCount === 0} className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white disabled:opacity-30 transition-colors"><ChevronDown className="w-4 h-4" /></button>
            </div>
            <button onClick={onClose} className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"><X className="w-4 h-4" /></button>
        </div>
    );
}

// =============================================
// PIN DURATION MODAL
// =============================================
function PinDurationModal({ onConfirm, onCancel }: { onConfirm: (duration: 1 | 2 | 3) => void; onCancel: () => void }) {
    const [duration, setDuration] = useState<1 | 2 | 3>(2);
    const labels: Record<1 | 2 | 3, string> = { 1: "24 horas", 2: "7 dias", 3: "30 dias" };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-800 border border-slate-700/60 rounded-2xl shadow-2xl shadow-black/50 w-full max-w-sm p-6 animate-in zoom-in-95 duration-200">
                <h3 className="text-base font-semibold text-white mb-1">Fixar mensagem</h3>
                <p className="text-sm text-slate-400 mb-5">Por quanto tempo a mensagem ficará fixada?</p>
                <div className="space-y-2 mb-6">
                    {([1, 2, 3] as const).map((d) => (
                        <label
                            key={d}
                            className={cn(
                                "flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border",
                                duration === d
                                    ? "bg-emerald-500/10 border-emerald-500/40 shadow-sm shadow-emerald-500/10"
                                    : "bg-slate-700/30 border-slate-700/40 hover:bg-slate-700/50"
                            )}
                        >
                            <div className={cn("w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0", duration === d ? "border-emerald-400" : "border-slate-500")}>
                                {duration === d && <div className="w-2 h-2 rounded-full bg-emerald-400" />}
                            </div>
                            <input type="radio" name="pin-duration" className="sr-only" value={d} checked={duration === d} onChange={() => setDuration(d)} />
                            <span className="text-sm text-slate-200">{labels[d]}</span>
                        </label>
                    ))}
                </div>
                <div className="flex gap-2 justify-end">
                    <button onClick={onCancel} className="px-4 py-2 rounded-xl text-sm text-slate-400 hover:text-white hover:bg-slate-700/60 transition-colors">Cancelar</button>
                    <button onClick={() => onConfirm(duration)} className="px-5 py-2 rounded-xl text-sm bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors shadow-sm shadow-emerald-500/20">Fixar</button>
                </div>
            </div>
        </div>
    );
}

// =============================================
// REMOVE REACTION MODAL
// =============================================
function RemoveReactionModal({ emoji, onRemove, onChangeReaction, onCancel }: {
    emoji: string;
    onRemove: () => void;
    onChangeReaction: () => void;
    onCancel: () => void;
}) {
    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-800 border border-slate-700/60 rounded-2xl shadow-2xl shadow-black/50 w-full max-w-xs p-5 animate-in zoom-in-95 duration-200">
                <div className="text-4xl text-center mb-3">{emoji}</div>
                <h3 className="text-sm font-semibold text-white text-center mb-1">Sua reação</h3>
                <p className="text-xs text-slate-400 text-center mb-5">O que deseja fazer com esta reação?</p>
                <div className="flex flex-col gap-2">
                    <button onClick={onChangeReaction} className="w-full px-4 py-2.5 rounded-xl text-sm bg-violet-500/20 border border-violet-500/30 text-violet-300 hover:bg-violet-500/30 transition-all font-medium">
                        Trocar reação
                    </button>
                    <button onClick={onCancel} className="w-full px-4 py-2.5 rounded-xl text-sm text-slate-500 hover:text-slate-300 transition-colors">
                        Cancelar
                    </button>
                </div>
            </div>
        </div>
    );
}

// =============================================
// DELETE CONFIRM MODAL
// =============================================
function DeleteConfirmModal({ onDeleteForAll, onDeleteForMe, onCancel }: {
    onDeleteForAll: () => void; onDeleteForMe: () => void; onCancel: () => void;
}) {
    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-800 border border-slate-700/60 rounded-2xl shadow-2xl shadow-black/50 w-full max-w-sm p-6 animate-in zoom-in-95 duration-200">
                <h3 className="text-base font-semibold text-white mb-2">Apagar mensagem</h3>
                <p className="text-sm text-slate-400 mb-5">Escolha como deseja apagar esta mensagem.</p>
                <div className="flex flex-col gap-2">
                    <button onClick={onDeleteForAll} className="w-full px-4 py-2.5 rounded-xl text-sm bg-rose-500/20 border border-rose-500/30 text-rose-300 hover:bg-rose-500/30 hover:text-rose-200 transition-all font-medium">Apagar para todos</button>
                    <button onClick={onDeleteForMe} className="w-full px-4 py-2.5 rounded-xl text-sm bg-slate-700/50 border border-slate-600/40 text-slate-300 hover:bg-slate-700 transition-all">Apagar para mim</button>
                    <button onClick={onCancel} className="w-full px-4 py-2.5 rounded-xl text-sm text-slate-500 hover:text-slate-300 transition-colors">Cancelar</button>
                </div>
            </div>
        </div>
    );
}

// ID fixo do usuário CRM — todas as reações do painel são atribuídas a ele
const MY_USER_ID = "crm-user";

// =============================================
// CHAT WINDOW
// =============================================
export function ChatWindow({ telefone, onReady, onReply }: ChatWindowProps) {
    const { messages, loading, addOptimisticMessage, updateMessageById, removeMessageById } = useLeadMessages(telefone);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const messageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
    const messageIdRefs = useRef<Map<string, HTMLDivElement>>(new Map());

    const [searchOpen, setSearchOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [currentMatchIdx, setCurrentMatchIdx] = useState(0);

    // Modal states
    const [pinModal, setPinModal] = useState<{ msg: LeadMessage } | null>(null);
    const [deleteModal, setDeleteModal] = useState<{ msg: LeadMessage } | null>(null);
    const [reactionModal, setReactionModal] = useState<{ msg: LeadMessage; currentEmoji: string } | null>(null);
    const [reactionPickerFor, setReactionPickerFor] = useState<LeadMessage | null>(null);

    // Inline error toast
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const showError = useCallback((msg: string) => {
        setErrorMsg(msg);
        setTimeout(() => setErrorMsg(null), 4000);
    }, []);

    useEffect(() => {
        onReady?.({ addOptimisticMessage });
    }, [onReady, addOptimisticMessage]);

    const pinnedMessages = useMemo(() => messages.filter((m) => m.pinned), [messages]);

    const scrollToMessage = useCallback((msgId: string) => {
        const el = messageIdRefs.current.get(msgId);
        if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.classList.add("ring-2", "ring-amber-400/60", "rounded-2xl");
            setTimeout(() => el.classList.remove("ring-2", "ring-amber-400/60", "rounded-2xl"), 2000);
        }
    }, []);

    const handleCopy = useCallback((content: string) => {
        navigator.clipboard.writeText(content).catch(() => {});
    }, []);

    const handleReact = useCallback(async (msg: LeadMessage, emoji: string) => {
        console.log("[REACT] iniciando reação:", { msgId: msg.id, emoji, zapiId: msg.zapiMessageId });
        const prevReactions = msg.reactions ?? {};

        // Optimistic: calcula localmente o que o servidor vai fazer
        // Remove MY_USER_ID de todos os emojis, adiciona no novo (se não for remoção)
        const optimistic: Record<string, string[]> = {};
        for (const [e, users] of Object.entries(prevReactions)) {
            const filtered = (users as string[]).filter((u) => u !== MY_USER_ID);
            if (filtered.length > 0) optimistic[e] = filtered;
        }
        if (emoji !== "") {
            optimistic[emoji] = [...(optimistic[emoji] ?? []), MY_USER_ID];
        }

        // Aplica otimisticamente
        updateMessageById(msg.id, { reactions: optimistic });
        console.log("[REACT] otimístico aplicado:", optimistic);

        try {
            const result = await reactToMessage({
                dbMessageId: msg.id,
                zapiMessageId: msg.zapiMessageId ?? null,
                emoji,  // "" = remover, qualquer outro = adicionar/substituir
                telefone,
                userId: MY_USER_ID,
            });
            console.log("[REACT] server action retornou:", result);

            if (result.success && result.newReactions !== undefined) {
                // Aplica o estado EXATO confirmado pelo servidor — ignora Realtime para esta ação
                updateMessageById(msg.id, { reactions: result.newReactions });
                console.log("[REACT] reactions aplicadas:", result.newReactions);
            } else if (!result.success) {
                updateMessageById(msg.id, { reactions: prevReactions });
                console.error("[REACT] falhou:", result.error);
                showError("Falha ao reagir à mensagem.");
            }
        } catch (err) {
            updateMessageById(msg.id, { reactions: prevReactions });
            console.error("[REACT] exceção:", err);
            showError("Erro ao reagir: " + String(err));
        }
    }, [telefone, updateMessageById, showError]);

    // Clicking an existing reaction chip → open remove modal if it's mine
    const handleReactionChipClick = useCallback((msg: LeadMessage, emoji: string) => {
        const prevReactions = msg.reactions ?? {};
        const isMine = (prevReactions[emoji] as string[] ?? []).includes(MY_USER_ID);
        if (isMine) {
            setReactionModal({ msg, currentEmoji: emoji });
        } else {
            handleReact(msg, emoji);
        }
    }, [handleReact]);

    // Pin: show modal when pinning, direct unpin
    const handlePinClick = useCallback((msg: LeadMessage, pin: boolean) => {
        if (!pin) {
            // Optimistic unpin immediately
            updateMessageById(msg.id, { pinned: false });
            pinMessage({ dbMessageId: msg.id, zapiMessageId: msg.zapiMessageId ?? null, telefone, pin: false })
                .then((r) => { if (!r.success) { updateMessageById(msg.id, { pinned: true }); showError("Falha ao desafixar."); } })
                .catch(() => { updateMessageById(msg.id, { pinned: true }); showError("Erro ao desafixar."); });
            return;
        }
        setPinModal({ msg });
    }, [telefone, updateMessageById, showError]);

    const confirmPin = useCallback(async (duration: 1 | 2 | 3) => {
        if (!pinModal) return;
        const msg = pinModal.msg;
        setPinModal(null);
        // Optimistic pin immediately
        updateMessageById(msg.id, { pinned: true });
        try {
            const result = await pinMessage({ dbMessageId: msg.id, zapiMessageId: msg.zapiMessageId ?? null, telefone, pin: true, duration });
            if (!result.success) {
                updateMessageById(msg.id, { pinned: false });
                showError("Falha ao fixar a mensagem.");
            }
        } catch (err) {
            updateMessageById(msg.id, { pinned: false });
            showError("Erro ao fixar: " + String(err));
        }
    }, [pinModal, telefone, updateMessageById, showError]);

    // Delete: show modal
    const handleDeleteClick = useCallback((msg: LeadMessage) => {
        setDeleteModal({ msg });
    }, []);

    const confirmDelete = useCallback(async (owner: boolean) => {
        if (!deleteModal) return;
        const msg = deleteModal.msg;
        setDeleteModal(null);

        if (owner) {
            // "Apagar para todos" — optimistic: mostra "Mensagem apagada" imediatamente
            updateMessageById(msg.id, { content: "__DELETED_FOR_ALL__", mediaType: "text" });
        } else {
            // "Apagar para mim" — optimistic: remove da UI imediatamente
            removeMessageById(msg.id);
        }

        try {
            const result = await deleteMessage({ dbMessageId: msg.id, zapiMessageId: msg.zapiMessageId ?? null, telefone, owner });
            if (!result.success) {
                // Revert
                if (owner) {
                    updateMessageById(msg.id, { content: msg.content, mediaType: msg.mediaType });
                } else {
                    // Não conseguimos re-inserir facilmente, só avisa
                }
                showError("Falha ao apagar a mensagem.");
            }
        } catch (err) {
            showError("Erro ao apagar: " + String(err));
        }
    }, [deleteModal, telefone, removeMessageById, updateMessageById, showError]);

    const handleReply = useCallback((msg: LeadMessage) => { onReply?.(msg); }, [onReply]);

    useEffect(() => {
        if (!searchOpen) chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, searchOpen]);

    useEffect(() => {
        setSearchOpen(false);
        setSearchTerm("");
        setCurrentMatchIdx(0);
    }, [telefone]);

    const matchIndices = useMemo(() => {
        if (!searchTerm.trim()) return [];
        const term = searchTerm.toLowerCase();
        return messages.map((msg, idx) => (msg.content?.toLowerCase().includes(term) ? idx : -1)).filter((idx) => idx !== -1);
    }, [messages, searchTerm]);

    useEffect(() => {
        if (matchIndices.length > 0 && currentMatchIdx < matchIndices.length) {
            const el = messageRefs.current.get(matchIndices[currentMatchIdx]);
            el?.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    }, [currentMatchIdx, matchIndices]);

    function handleSearchNav(dir: "next" | "prev") {
        if (matchIndices.length === 0) return;
        setCurrentMatchIdx((prev) => dir === "next" ? (prev + 1) % matchIndices.length : (prev - 1 + matchIndices.length) % matchIndices.length);
    }

    useEffect(() => {
        const handler = () => setSearchOpen(true);
        window.addEventListener("chat-search-open", handler);
        return () => window.removeEventListener("chat-search-open", handler);
    }, []);

    if (loading) {
        return <div className="flex-1 flex items-center justify-center bg-[#0b1120]"><Loader2 className="w-6 h-6 animate-spin text-brand-400" /></div>;
    }

    if (messages.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-8 bg-[#0b1120]">
                <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center mb-4">
                    <MessageSquare className="w-8 h-8 text-slate-600" />
                </div>
                <p className="text-sm font-medium text-slate-500">Nenhuma mensagem ainda</p>
                <p className="text-xs text-slate-600 mt-1 max-w-[250px]">Nenhuma mensagem recebida ou enviada até o momento.</p>
            </div>
        );
    }

    let lastDateKey = "";

    return (
        <div className="flex-1 flex flex-col overflow-hidden bg-[#0b1120] relative">
            {/* Error toast */}
            {errorMsg && (
                <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-rose-900/90 border border-rose-700/60 text-rose-200 text-sm shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-200 max-w-[320px] text-center">
                    {errorMsg}
                </div>
            )}

            {/* Modals */}
            {pinModal && (
                <PinDurationModal
                    onConfirm={(duration) => confirmPin(duration)}
                    onCancel={() => setPinModal(null)}
                />
            )}
            {deleteModal && (
                <DeleteConfirmModal
                    onDeleteForAll={() => confirmDelete(true)}
                    onDeleteForMe={() => confirmDelete(false)}
                    onCancel={() => setDeleteModal(null)}
                />
            )}
            {reactionModal && (
                <RemoveReactionModal
                    emoji={reactionModal.currentEmoji}
                    onRemove={() => {
                        const msg = reactionModal.msg;
                        setReactionModal(null);
                        handleReact(msg, ""); // remove
                    }}
                    onChangeReaction={() => {
                        const msg = reactionModal.msg;
                        setReactionModal(null);
                        setReactionPickerFor(msg); // abre picker inline
                    }}
                    onCancel={() => setReactionModal(null)}
                />
            )}
            {/* Inline reaction picker (abre quando usuário quer trocar reação) */}
            {reactionPickerFor && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-slate-800 border border-slate-700/60 rounded-2xl shadow-2xl p-4 animate-in zoom-in-95 duration-200">
                        <p className="text-xs text-slate-400 text-center mb-3">Escolha uma reação</p>
                        <ReactionPicker
                            onSelect={(emoji) => {
                                const msg = reactionPickerFor;
                                setReactionPickerFor(null);
                                handleReact(msg, emoji);
                            }}
                            onClose={() => setReactionPickerFor(null)}
                            inline
                        />
                    </div>
                </div>
            )}

            {/* Pinned banner */}
            <PinnedMessageBanner
                pinnedMessages={pinnedMessages}
                onScrollTo={scrollToMessage}
                onUnpin={(msg) => handlePinClick(msg, false)}
            />

            {/* Search */}
            {searchOpen && (
                <ChatSearchBar
                    onSearch={(term) => { setSearchTerm(term); setCurrentMatchIdx(0); }}
                    matchCount={matchIndices.length}
                    currentMatch={currentMatchIdx}
                    onPrev={() => handleSearchNav("prev")}
                    onNext={() => handleSearchNav("next")}
                    onClose={() => { setSearchOpen(false); setSearchTerm(""); setCurrentMatchIdx(0); }}
                />
            )}

            <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 py-4 space-y-1 bg-[#0b1120]">
                {messages.map((msg, idx) => {
                    const isClient = msg.senderType === "cliente" || msg.senderType === "lead";
                    const isSelf = msg.senderType === "ia" || msg.senderType === "humano" || msg.senderType === "equipe";
                    const isOptimistic = msg.id.startsWith("optimistic-");

                    let showDateSep = false;
                    if (msg.createdAt) {
                        const d = new Date(msg.createdAt);
                        const dateKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
                        if (dateKey !== lastDateKey) { showDateSep = true; lastDateKey = dateKey; }
                    }

                    const isSearchMatch = searchTerm && matchIndices.includes(idx);
                    const isCurrentMatch = searchTerm && matchIndices[currentMatchIdx] === idx;
                    const reactions = msg.reactions || {};
                    const hasReactions = Object.keys(reactions).filter(k => (reactions[k] as string[]).length > 0).length > 0;
                    // Context menu: for client msgs button is on RIGHT side of bubble; for team msgs on LEFT side
                    const menuAlign: "left" | "right" = isClient ? "right" : "left";

                    return (
                        <div key={msg.id}>
                            {showDateSep && msg.createdAt && <DateSeparator date={new Date(msg.createdAt)} />}

                            {/* group/msg — named group for context menu visibility */}
                            <div
                                ref={(el) => { if (el) { messageRefs.current.set(idx, el); messageIdRefs.current.set(msg.id, el); } }}
                                className={cn(
                                    "flex mb-3 group/msg",
                                    isClient ? "justify-start" : "justify-end",
                                    isOptimistic && "opacity-60",
                                    isCurrentMatch && "ring-2 ring-yellow-400/40 rounded-2xl",
                                )}
                            >
                                <div className="relative max-w-[72%] min-w-0">
                                    {/* Bubble */}
                                    <div
                                        className={cn(
                                            "relative px-4 py-2.5 text-sm leading-relaxed",
                                            isClient
                                                ? "bg-slate-800 border border-slate-700 text-slate-200 rounded-2xl rounded-bl-sm"
                                                : msg.senderType === "ia"
                                                    ? "bg-gradient-to-br from-violet-500/20 to-violet-600/10 text-violet-100 border border-violet-500/25 rounded-2xl rounded-br-sm shadow-sm shadow-violet-500/10"
                                                    : "bg-gradient-to-br from-emerald-600/30 to-emerald-700/20 text-emerald-50 border border-emerald-500/20 rounded-2xl rounded-br-sm shadow-sm shadow-emerald-500/10",
                                            isSearchMatch && !isCurrentMatch && "ring-1 ring-yellow-500/30",
                                        )}
                                    >
                                        {/* Bubble content — sem padding extra, chevron é overlay */}
                                        <div>
                                            {/* Pin indicator */}
                                            {msg.pinned && (
                                                <div className="flex items-center gap-1 mb-1">
                                                    <Pin className="w-3 h-3 text-amber-400" />
                                                    <span className="text-[10px] text-amber-400">Fixada</span>
                                                </div>
                                            )}

                                            {/* Reply quote */}
                                            {msg.replyTo && (
                                                <div className={cn(
                                                    "mb-2 pl-2.5 border-l-2 py-1 rounded-sm",
                                                    isClient ? "border-slate-500 bg-slate-700/40" : "border-white/25 bg-white/5",
                                                )}>
                                                    <p className={cn("text-[11px] font-semibold mb-0.5", isClient ? "text-slate-400" : "text-white/60")}>
                                                        {msg.replyTo.senderName || "Mensagem"}
                                                    </p>
                                                    <p className={cn("text-[11px] line-clamp-1", isClient ? "text-slate-500" : "text-white/40")}>
                                                        {msg.replyTo.content}
                                                    </p>
                                                </div>
                                            )}

                                            <SenderLabel message={msg} isClient={isClient} />
                                            <MessageContent message={msg} isSelf={isSelf} highlight={searchTerm || undefined} />
                                            <p className={cn("text-[10px] mt-1 text-right", isClient ? "text-slate-500" : "text-white/40")}>
                                                {msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : ""}
                                            </p>
                                        </div>

                                        {/* Chevron WhatsApp-style — absolute overlay, fora do fluxo de texto */}
                                        {!isOptimistic && msg.content !== "__DELETED_FOR_ALL__" && (
                                            <div className={cn(
                                                "absolute top-1.5",
                                                isClient ? "right-1.5" : "left-1.5",
                                            )}>
                                                <MessageContextMenu
                                                    message={msg}
                                                    onReply={handleReply}
                                                    onCopy={handleCopy}
                                                    onPin={handlePinClick}
                                                    onDelete={handleDeleteClick}
                                                    onReact={handleReact}
                                                    align={menuAlign}
                                                />
                                            </div>
                                        )}
                                    </div>

                                    {/* Reactions — below bubble */}
                                    {hasReactions && (
                                        <div className={cn("flex flex-wrap gap-1 mt-1 px-1", isClient ? "justify-start" : "justify-end")}>
                                            {Object.entries(reactions)
                                                .filter(([, users]) => (users as string[]).length > 0)
                                                .map(([emoji, users]) => {
                                                    const isMine = (users as string[]).includes(MY_USER_ID);
                                                    return (
                                                        <button
                                                            key={emoji}
                                                            type="button"
                                                            onClick={() => handleReactionChipClick(msg, emoji)}
                                                            title={isMine ? "Toque para remover ou trocar" : "Reagir com este emoji"}
                                                            className={cn(
                                                                "flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border transition-all text-xs",
                                                                isMine
                                                                    ? "bg-violet-500/25 border-violet-400/50 hover:bg-violet-500/35 shadow-sm shadow-violet-500/20"
                                                                    : "bg-slate-700/80 border-slate-600/60 hover:bg-slate-600/80"
                                                            )}
                                                        >
                                                            <span>{emoji}</span>
                                                            {(users as string[]).length > 1 && (
                                                                <span className={cn("text-[10px] ml-0.5", isMine ? "text-violet-300" : "text-slate-300")}>
                                                                    {(users as string[]).length}
                                                                </span>
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
                <div ref={chatEndRef} />
            </div>
        </div>
    );
}
