"use client";

import { Pin, X } from "lucide-react";
import type { LeadMessage } from "@/lib/actions/leads";

interface PinnedMessageBannerProps {
    pinnedMessages: LeadMessage[];
    onScrollTo: (msgId: string) => void;
    onUnpin: (msg: LeadMessage) => void;
}

export function PinnedMessageBanner({ pinnedMessages, onScrollTo, onUnpin }: PinnedMessageBannerProps) {
    if (pinnedMessages.length === 0) return null;

    const latest = pinnedMessages[pinnedMessages.length - 1];
    const preview = latest.content.length > 80 ? latest.content.slice(0, 80) + "..." : latest.content;

    return (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 text-sm">
            <Pin className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <button
                type="button"
                onClick={() => onScrollTo(latest.id)}
                className="flex-1 text-left text-amber-800 dark:text-amber-200 hover:underline truncate"
            >
                {pinnedMessages.length > 1 && (
                    <span className="font-medium mr-1">{pinnedMessages.length} fixadas -</span>
                )}
                {preview}
            </button>
            <button
                type="button"
                onClick={() => onUnpin(latest)}
                className="p-0.5 text-amber-500 hover:text-amber-700 dark:hover:text-amber-300"
                title="Desafixar"
            >
                <X className="h-3.5 w-3.5" />
            </button>
        </div>
    );
}
