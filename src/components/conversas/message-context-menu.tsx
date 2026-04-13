"use client";

import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { Copy, Reply, Pin, PinOff, Trash2, SmilePlus, ChevronDown } from "lucide-react";
import { ReactionPicker } from "./reaction-picker";
import type { LeadMessage } from "@/lib/actions/leads";

const MENU_W = 176; // w-44 = 11rem = 176px
const MENU_BASE_H = 170; // altura base sem botão Apagar
const MENU_WITH_DELETE_H = 214;

interface MessageContextMenuProps {
    message: LeadMessage;
    onReply: (msg: LeadMessage) => void;
    onCopy: (content: string) => void;
    onPin: (msg: LeadMessage, pin: boolean) => void;
    onDelete: (msg: LeadMessage) => void;
    onReact: (msg: LeadMessage, emoji: string) => void;
    /** "right" = mensagem da equipe (chevron à esquerda da bolha); "left" = mensagem do cliente */
    align?: "left" | "right";
}

export function MessageContextMenu({
    message,
    onReply,
    onCopy,
    onPin,
    onDelete,
    onReact,
    align = "right",
}: MessageContextMenuProps) {
    const [open, setOpen] = useState(false);
    const [showReactions, setShowReactions] = useState(false);
    const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
    const [reactPos, setReactPos] = useState<{ top: number; left: number } | null>(null);

    const triggerRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const isTeam = message.senderType === "equipe" || message.senderType === "ia" || message.senderType === "humano";
    const menuH = isTeam ? MENU_WITH_DELETE_H : MENU_BASE_H;

    // Calcula posição do menu via getBoundingClientRect
    useLayoutEffect(() => {
        if (!open || !triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();

        let top = rect.bottom + 6;
        let left = align === "right"
            ? rect.right - MENU_W   // alinha à direita do trigger
            : rect.left;            // alinha à esquerda do trigger

        // Clamp vertical: se ultrapassar o fundo, abre para cima
        if (top + menuH > window.innerHeight - 8) {
            top = rect.top - menuH - 6;
        }
        if (top < 8) top = 8;

        // Clamp horizontal
        if (left + MENU_W > window.innerWidth - 8) {
            left = window.innerWidth - MENU_W - 8;
        }
        if (left < 8) left = 8;

        setMenuPos({ top, left });
    }, [open, align, menuH]);

    // Fecha ao clicar fora, ESC ou scroll
    useEffect(() => {
        if (!open && !showReactions) return;

        function onMouseDown(e: MouseEvent) {
            const target = e.target as Node;
            const inMenu = menuRef.current?.contains(target);
            const inTrigger = triggerRef.current?.contains(target);
            if (!inMenu && !inTrigger) {
                setOpen(false);
                setShowReactions(false);
            }
        }
        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape") { setOpen(false); setShowReactions(false); }
        }
        function onScroll() { setOpen(false); setShowReactions(false); }

        document.addEventListener("mousedown", onMouseDown);
        document.addEventListener("keydown", onKey);
        window.addEventListener("scroll", onScroll, true);
        return () => {
            document.removeEventListener("mousedown", onMouseDown);
            document.removeEventListener("keydown", onKey);
            window.removeEventListener("scroll", onScroll, true);
        };
    }, [open, showReactions]);

    function toggleOpen() {
        if (open) {
            setOpen(false);
            setShowReactions(false);
        } else {
            setShowReactions(false);
            setOpen(true);
        }
    }

    return (
        <>
            {/* Trigger: chevron no estilo WhatsApp */}
            <button
                ref={triggerRef}
                type="button"
                onClick={toggleOpen}
                className="opacity-0 group-hover/msg:opacity-100 flex items-center justify-center w-5 h-5 rounded-full bg-black/30 backdrop-blur-sm text-white/80 hover:bg-black/50 hover:text-white transition-all"
                title="Opções"
            >
                <ChevronDown className="w-3.5 h-3.5" />
            </button>

            {/* Menu via Portal */}
            {open && menuPos && createPortal(
                <div
                    ref={menuRef}
                    style={{ position: "fixed", top: menuPos.top, left: menuPos.left, zIndex: 9999, width: MENU_W }}
                    className="bg-slate-800/95 backdrop-blur-sm border border-slate-600/50 rounded-xl shadow-2xl shadow-black/40 py-1.5 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
                >
                    <button
                        type="button"
                        onClick={() => {
                            if (triggerRef.current) {
                                const rect = triggerRef.current.getBoundingClientRect();
                                let top = rect.bottom + 6;
                                let left = rect.left;
                                if (top + 80 > window.innerHeight - 8) top = rect.top - 80 - 6;
                                if (left + 210 > window.innerWidth - 8) left = window.innerWidth - 210 - 8;
                                if (left < 8) left = 8;
                                setReactPos({ top, left });
                            }
                            setOpen(false);
                            setShowReactions(true);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-violet-500/15 text-slate-300 hover:text-violet-200 transition-colors text-sm group/item"
                    >
                        <SmilePlus className="h-3.5 w-3.5 text-violet-400 group-hover/item:scale-110 transition-transform" />
                        Reagir
                    </button>
                    <button
                        type="button"
                        onClick={() => { setOpen(false); onReply(message); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-sky-500/15 text-slate-300 hover:text-sky-200 transition-colors text-sm group/item"
                    >
                        <Reply className="h-3.5 w-3.5 text-sky-400 group-hover/item:scale-110 transition-transform" />
                        Responder
                    </button>
                    <button
                        type="button"
                        onClick={() => { setOpen(false); onCopy(message.content); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-700/60 text-slate-300 hover:text-slate-100 transition-colors text-sm group/item"
                    >
                        <Copy className="h-3.5 w-3.5 text-slate-400 group-hover/item:scale-110 transition-transform" />
                        Copiar
                    </button>
                    <button
                        type="button"
                        onClick={() => { setOpen(false); onPin(message, !message.pinned); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-amber-500/15 text-slate-300 hover:text-amber-200 transition-colors text-sm group/item"
                    >
                        {message.pinned
                            ? <PinOff className="h-3.5 w-3.5 text-amber-400 group-hover/item:scale-110 transition-transform" />
                            : <Pin className="h-3.5 w-3.5 text-amber-400 group-hover/item:scale-110 transition-transform" />
                        }
                        {message.pinned ? "Desafixar" : "Fixar"}
                    </button>
                    {isTeam && (
                        <>
                            <div className="my-1 mx-3 border-t border-slate-700/60" />
                            <button
                                type="button"
                                onClick={() => { setOpen(false); onDelete(message); }}
                                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-rose-500/15 text-rose-400 hover:text-rose-300 transition-colors text-sm group/item"
                            >
                                <Trash2 className="h-3.5 w-3.5 group-hover/item:scale-110 transition-transform" />
                                Apagar
                            </button>
                        </>
                    )}
                </div>,
                document.body
            )}

            {/* ReactionPicker via Portal */}
            {showReactions && (
                <ReactionPicker
                    initialPos={reactPos ?? undefined}
                    onSelect={(emoji) => { setShowReactions(false); setReactPos(null); onReact(message, emoji); }}
                    onClose={() => { setShowReactions(false); setReactPos(null); }}
                />
            )}
        </>
    );
}
