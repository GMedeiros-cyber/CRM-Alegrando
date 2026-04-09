"use client";

import { useState, useRef, useEffect } from "react";
import { Smile } from "lucide-react";

const EMOJI_CATEGORIES: { label: string; emojis: string[] }[] = [
    {
        label: "Smileys",
        emojis: ["😀", "😂", "🤣", "😊", "😍", "🥰", "😘", "😜", "🤔", "😎", "🥳", "😢", "😭", "😡", "🤯", "😱", "🥺", "😴", "🤗", "🙄"],
    },
    {
        label: "Gestos",
        emojis: ["👍", "👎", "👏", "🙌", "🤝", "💪", "🙏", "✌️", "🤞", "👋", "🤙", "👀", "💅", "🫶", "❤️", "🔥", "⭐", "✨", "💯", "🎉"],
    },
    {
        label: "Objetos",
        emojis: ["📱", "💻", "📧", "📦", "🎁", "🏠", "🚗", "✈️", "⏰", "📅", "💰", "🛒", "📝", "📌", "🔔", "🎯", "🏆", "💡", "🔑", "📷"],
    },
    {
        label: "Símbolos",
        emojis: ["✅", "❌", "⚠️", "ℹ️", "❓", "❗", "➡️", "⬅️", "🔄", "➕", "➖", "🟢", "🔴", "🟡", "⚡", "🌟", "💫", "🎶", "💬", "🔗"],
    },
];

interface EmojiPickerInputProps {
    onEmojiSelect: (emoji: string) => void;
}

export function EmojiPickerInput({ onEmojiSelect }: EmojiPickerInputProps) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        if (open) {
            document.addEventListener("mousedown", handleClickOutside);
            return () => document.removeEventListener("mousedown", handleClickOutside);
        }
    }, [open]);

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                title="Emoji"
            >
                <Smile className="h-5 w-5" />
            </button>

            {open && (
                <div className="absolute bottom-full left-0 mb-2 w-[320px] max-h-[280px] overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl z-50 p-2">
                    {EMOJI_CATEGORIES.map((cat) => (
                        <div key={cat.label} className="mb-2">
                            <p className="text-xs text-gray-400 font-medium mb-1 px-1">{cat.label}</p>
                            <div className="flex flex-wrap gap-0.5">
                                {cat.emojis.map((emoji) => (
                                    <button
                                        key={emoji}
                                        type="button"
                                        onClick={() => {
                                            onEmojiSelect(emoji);
                                            setOpen(false);
                                        }}
                                        className="w-8 h-8 flex items-center justify-center text-lg hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                                    >
                                        {emoji}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
