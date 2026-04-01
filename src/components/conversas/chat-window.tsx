"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { useLeadMessages } from "@/hooks/useLeadMessages";
import type { LeadMessage } from "@/lib/actions/leads";
import { MessageSquare, Loader2, Search, X, ChevronUp, ChevronDown, FileText, Image as ImageIcon, Mic } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatWindowProps {
    telefone: string;
    onReady?: (addOptimisticMessage: (content: string) => void) => void;
}

// =============================================
// DATE SEPARATOR — WhatsApp-style day headers
// =============================================
function formatDateLabel(date: Date): string {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const msgDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffMs = today.getTime() - msgDay.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Hoje";
    if (diffDays === 1) return "Ontem";
    if (diffDays < 7) {
        return date.toLocaleDateString("pt-BR", { weekday: "long" });
    }
    return date.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    });
}

function DateSeparator({ date }: { date: Date }) {
    return (
        <div className="flex items-center justify-center my-3">
            <div className="px-3 py-1 rounded-lg bg-slate-800/80 border border-slate-700/50 shadow-sm">
                <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">
                    {formatDateLabel(date)}
                </span>
            </div>
        </div>
    );
}

// =============================================
// SENDER LABEL — "Jade" (IA), "Alegrando" (manual), or client name
// =============================================
function SenderLabel({ message, isClient }: { message: LeadMessage; isClient: boolean }) {
    if (isClient) {
        const name = message.senderName || "Cliente";
        return (
            <div className="flex items-center gap-1.5 mb-1">
                <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-600/30">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                    <span className="text-[11px] font-bold tracking-wide text-slate-400">
                        {name}
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
                    <span className="text-[11px] font-bold tracking-wide text-violet-400">
                        Jade
                    </span>
                </div>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-1.5 mb-1">
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/10">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="text-[11px] font-bold tracking-wide text-emerald-400">
                    Alegrando
                </span>
            </div>
        </div>
    );
}

// =============================================
// MESSAGE CONTENT — renderização condicional de mídia
// =============================================
/** Separates "url|||caption" format stored by sendFileMessage */
function parseMediaContent(content: string): { url: string; caption: string } {
    const sep = "|||";
    const idx = content.indexOf(sep);
    if (idx !== -1) {
        return { url: content.slice(0, idx), caption: content.slice(idx + sep.length) };
    }
    return { url: content, caption: "" };
}

function MessageContent({ message, isSelf, highlight }: { message: LeadMessage; isSelf: boolean; highlight?: string }) {
    if (message.mediaType === "audio") {
        return (
            <div className="flex items-center gap-2.5 px-1 py-0.5">
                <div className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium",
                    isSelf ? "bg-white/10 text-white/80" : "bg-slate-700/60 text-slate-300"
                )}>
                    <Mic className="w-4 h-4 shrink-0" />
                    <span>Áudio recebido</span>
                </div>
            </div>
        );
    }

    if (message.mediaType === "image") {
        const { url, caption } = parseMediaContent(message.content || "");
        if (url.startsWith("http")) {
            return (
                <div>
                    <img
                        src={url}
                        alt="imagem"
                        className="max-w-[260px] rounded-xl object-cover cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => window.open(url, "_blank")}
                    />
                    {caption && (
                        <p className="text-xs mt-1.5 text-white/70 leading-relaxed">{caption}</p>
                    )}
                </div>
            );
        }
        return (
            <div className="flex items-center gap-2.5 px-1 py-0.5">
                <div className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium",
                    isSelf ? "bg-white/10 text-white/80" : "bg-slate-700/60 text-slate-300"
                )}>
                    <ImageIcon className="w-4 h-4 shrink-0" />
                    <span>Imagem recebida</span>
                </div>
            </div>
        );
    }

    // PDF / document
    if (message.mediaType === "document") {
        const { url, caption } = parseMediaContent(message.content || "");
        if (url.startsWith("http")) {
            const fileName = url.split("/").pop()?.split("?")[0] || "Documento";
            return (
                <div>
                    <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 transition-colors max-w-[260px] border border-white/10"
                    >
                        <FileText className="w-8 h-8 text-brand-400 shrink-0" />
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-white truncate">{decodeURIComponent(fileName)}</p>
                            <p className="text-[10px] text-white/50">Toque para abrir</p>
                        </div>
                    </a>
                    {caption && (
                        <p className="text-xs mt-1.5 text-white/70 leading-relaxed">{caption}</p>
                    )}
                </div>
            );
        }
        return (
            <div className="flex items-center gap-2.5 px-1 py-0.5">
                <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium border bg-red-500/10 border-red-500/20 text-red-300">
                    <FileText className="w-5 h-5 shrink-0 text-red-400" />
                    <div className="flex flex-col">
                        <span className="font-semibold text-[13px]">Documento</span>
                        <span className="text-[10px] opacity-70">Arquivo enviado</span>
                    </div>
                </div>
            </div>
        );
    }

    // Plain text with optional search highlight
    const content = message.content;
    if (highlight && content) {
        const regex = new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, "gi");
        const parts = content.split(regex);
        return (
            <p className="text-sm whitespace-pre-wrap leading-relaxed">
                {parts.map((part, i) =>
                    regex.test(part) ? (
                        <mark key={i} className="bg-yellow-400/30 text-yellow-200 rounded-sm px-0.5">
                            {part}
                        </mark>
                    ) : (
                        <span key={i}>{part}</span>
                    )
                )}
            </p>
        );
    }

    return <p className="text-sm whitespace-pre-wrap leading-relaxed">{content}</p>;
}

// =============================================
// IN-CONVERSATION SEARCH BAR
// =============================================
function ChatSearchBar({
    onSearch,
    matchCount,
    currentMatch,
    onPrev,
    onNext,
    onClose,
}: {
    onSearch: (term: string) => void;
    matchCount: number;
    currentMatch: number;
    onPrev: () => void;
    onNext: () => void;
    onClose: () => void;
}) {
    const [term, setTerm] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    function handleChange(val: string) {
        setTerm(val);
        onSearch(val);
    }

    return (
        <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/90 border-b border-slate-700/50 animate-in slide-in-from-top-2 duration-200">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
                ref={inputRef}
                value={term}
                onChange={(e) => handleChange(e.target.value)}
                placeholder="Buscar na conversa..."
                className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 outline-none"
                onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        e.shiftKey ? onPrev() : onNext();
                    }
                    if (e.key === "Escape") onClose();
                }}
            />
            {term && (
                <span className="text-[11px] text-slate-400 shrink-0 tabular-nums">
                    {matchCount > 0 ? `${currentMatch + 1}/${matchCount}` : "0/0"}
                </span>
            )}
            <div className="flex items-center gap-0.5">
                <button
                    onClick={onPrev}
                    disabled={matchCount === 0}
                    className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
                >
                    <ChevronUp className="w-4 h-4" />
                </button>
                <button
                    onClick={onNext}
                    disabled={matchCount === 0}
                    className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
                >
                    <ChevronDown className="w-4 h-4" />
                </button>
            </div>
            <button
                onClick={onClose}
                className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    );
}

// =============================================
// CHAT WINDOW
// =============================================
export function ChatWindow({ telefone, onReady }: ChatWindowProps) {
    const { messages, loading, addOptimisticMessage } = useLeadMessages(telefone);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const messageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

    // Search state
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [currentMatchIdx, setCurrentMatchIdx] = useState(0);

    // Expose addOptimisticMessage to parent
    useEffect(() => {
        onReady?.(addOptimisticMessage);
    }, [onReady, addOptimisticMessage]);

    // Scroll to bottom on new messages (only when search is not active)
    useEffect(() => {
        if (!searchOpen) {
            chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages, searchOpen]);

    // Reset search when phone changes
    useEffect(() => {
        setSearchOpen(false);
        setSearchTerm("");
        setCurrentMatchIdx(0);
    }, [telefone]);

    // Search match indices
    const matchIndices = useMemo(() => {
        if (!searchTerm.trim()) return [];
        const term = searchTerm.toLowerCase();
        return messages
            .map((msg, idx) => (msg.content?.toLowerCase().includes(term) ? idx : -1))
            .filter((idx) => idx !== -1);
    }, [messages, searchTerm]);

    // Scroll to current match
    useEffect(() => {
        if (matchIndices.length > 0 && currentMatchIdx < matchIndices.length) {
            const msgIdx = matchIndices[currentMatchIdx];
            const el = messageRefs.current.get(msgIdx);
            el?.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    }, [currentMatchIdx, matchIndices]);

    function handleSearchNav(dir: "next" | "prev") {
        if (matchIndices.length === 0) return;
        if (dir === "next") {
            setCurrentMatchIdx((prev) => (prev + 1) % matchIndices.length);
        } else {
            setCurrentMatchIdx((prev) => (prev - 1 + matchIndices.length) % matchIndices.length);
        }
    }

    // Public method to open search (called from parent via ref)
    // We expose this via a data attribute the parent can read
    useEffect(() => {
        const handler = () => setSearchOpen(true);
        window.addEventListener("chat-search-open", handler);
        return () => window.removeEventListener("chat-search-open", handler);
    }, []);

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center bg-[#0b1120]">
                <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
            </div>
        );
    }

    if (messages.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-8 bg-[#0b1120]">
                <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center mb-4">
                    <MessageSquare className="w-8 h-8 text-slate-600" />
                </div>
                <p className="text-sm font-medium text-slate-500">Nenhuma mensagem ainda</p>
                <p className="text-xs text-slate-600 mt-1 max-w-[250px]">
                    Nenhuma mensagem recebida ou enviada até o momento.
                </p>
            </div>
        );
    }

    // Group messages by day for date separators
    let lastDateKey = "";

    return (
        <div className="flex-1 flex flex-col overflow-hidden bg-[#0b1120]">
            {/* In-conversation search */}
            {searchOpen && (
                <ChatSearchBar
                    onSearch={(term) => {
                        setSearchTerm(term);
                        setCurrentMatchIdx(0);
                    }}
                    matchCount={matchIndices.length}
                    currentMatch={currentMatchIdx}
                    onPrev={() => handleSearchNav("prev")}
                    onNext={() => handleSearchNav("next")}
                    onClose={() => {
                        setSearchOpen(false);
                        setSearchTerm("");
                        setCurrentMatchIdx(0);
                    }}
                />
            )}

            <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 py-4 space-y-1 bg-[#0b1120]">
                {messages.map((msg, idx) => {
                    const isClient = msg.senderType === "cliente" || msg.senderType === "lead";
                    const isSelf = msg.senderType === "ia" || msg.senderType === "humano";

                    // Date separator logic
                    let showDateSep = false;
                    if (msg.createdAt) {
                        const d = new Date(msg.createdAt);
                        const dateKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
                        if (dateKey !== lastDateKey) {
                            showDateSep = true;
                            lastDateKey = dateKey;
                        }
                    }

                    // Search highlight
                    const isSearchMatch = searchTerm && matchIndices.includes(idx);
                    const isCurrentMatch = searchTerm && matchIndices[currentMatchIdx] === idx;

                    return (
                        <div key={msg.id}>
                            {showDateSep && msg.createdAt && (
                                <DateSeparator date={new Date(msg.createdAt)} />
                            )}
                            <div
                                ref={(el) => {
                                    if (el) messageRefs.current.set(idx, el);
                                }}
                                className={cn(
                                    "flex mb-2",
                                    isClient ? "justify-start" : "justify-end",
                                    msg.id.startsWith("optimistic-") && "opacity-70",
                                    isCurrentMatch && "ring-2 ring-yellow-400/50 rounded-2xl"
                                )}
                            >
                                <div
                                    className={cn(
                                        "max-w-[70%] px-4 py-2.5 text-sm leading-relaxed transition-all",
                                        isClient
                                            ? "bg-slate-800 border border-slate-700 text-slate-200 rounded-2xl rounded-bl-sm"
                                            : msg.senderType === "ia"
                                                ? "bg-gradient-to-br from-violet-500/20 to-violet-600/10 text-violet-100 border border-violet-500/25 rounded-2xl rounded-br-sm shadow-sm shadow-violet-500/10"
                                                : "bg-gradient-to-br from-emerald-600/30 to-emerald-700/20 text-emerald-50 border border-emerald-500/20 rounded-2xl rounded-br-sm shadow-sm shadow-emerald-500/10",
                                        isSearchMatch && !isCurrentMatch && "ring-1 ring-yellow-500/30"
                                    )}
                                >
                                    {/* Sender label — all messages get one */}
                                    <SenderLabel message={msg} isClient={isClient} />

                                    <MessageContent message={msg} isSelf={isSelf} highlight={searchTerm || undefined} />

                                    <p
                                        className={cn(
                                            "text-[10px] mt-1 text-right",
                                            isClient ? "text-slate-500" : "text-white/40"
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
                        </div>
                    );
                })}
                <div ref={chatEndRef} />
            </div>
        </div>
    );
}
