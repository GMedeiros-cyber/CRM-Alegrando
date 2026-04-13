"use client";

import { useRef, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";

const QUICK_REACTIONS = ["❤️", "😂", "👍", "😮", "😢", "🙏", "🔥", "🎉", "✅", "👀", "😍", "💪"];

const PICKER_W = 208; // px — largura do picker
const PICKER_H = 76;  // px — altura estimada (2 linhas de emojis + padding)

interface ReactionPickerProps {
    triggerRef?: React.RefObject<HTMLButtonElement | null>;
    onSelect: (emoji: string) => void;
    onClose: () => void;
    /** inline=true: renderiza no fluxo (dentro de modal pai), sem portal */
    inline?: boolean;
    /** Posição pré-calculada (quando triggerRef já desmontou) */
    initialPos?: { top: number; left: number };
}

export function ReactionPicker({ triggerRef, onSelect, onClose, inline = false, initialPos }: ReactionPickerProps) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const _triggerRef = triggerRef ?? { current: null } as React.RefObject<any>;
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
    const pickerRef = useRef<HTMLDivElement>(null);

    // Calcula posição via getBoundingClientRect após montar
    useLayoutEffect(() => {
        if (inline) return;
        if (initialPos) { setPos(initialPos); return; }
        if (!_triggerRef.current) return;
        const rect = _triggerRef.current.getBoundingClientRect();

        let top = rect.bottom + 6;
        let left = rect.left;

        // Clamp vertical
        if (top + PICKER_H > window.innerHeight - 8) {
            top = rect.top - PICKER_H - 6;
        }
        // Clamp horizontal
        if (left + PICKER_W > window.innerWidth - 8) {
            left = window.innerWidth - PICKER_W - 8;
        }
        if (left < 8) left = 8;

        setPos({ top, left });
    }, [inline, _triggerRef, initialPos]);

    // Fecha ao clicar fora ou pressionar ESC
    useEffect(() => {
        if (inline) return;

        function onMouseDown(e: MouseEvent) {
            if (
                pickerRef.current &&
                !pickerRef.current.contains(e.target as Node) &&
                (!_triggerRef.current || !_triggerRef.current.contains(e.target as Node))
            ) {
                onClose();
            }
        }
        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape") onClose();
        }

        document.addEventListener("mousedown", onMouseDown);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onMouseDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [inline, onClose, triggerRef]);

    const content = (
        <div className="flex flex-wrap gap-1 p-2 w-[208px]">
            {QUICK_REACTIONS.map((emoji) => (
                <button
                    key={emoji}
                    type="button"
                    onClick={() => onSelect(emoji)}
                    className="w-7 h-7 flex items-center justify-center text-base hover:bg-[#E0E7FF] dark:hover:bg-[#2d3347]/60 rounded-lg transition-all hover:scale-110"
                >
                    {emoji}
                </button>
            ))}
        </div>
    );

    // Modo inline (dentro de modal pai)
    if (inline) {
        return <div ref={pickerRef}>{content}</div>;
    }

    // Aguarda posição calculada
    if (!pos) return null;

    return createPortal(
        <div
            ref={pickerRef}
            style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
            className="bg-[#EEF2FF] dark:bg-[#1e2536]/95 backdrop-blur-sm border border-[#A5B4FC] dark:border-[#4a5568]/50 rounded-xl shadow-2xl shadow-black/40 animate-in fade-in zoom-in-95 duration-150"
        >
            {content}
        </div>,
        document.body
    );
}
