"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { LABEL_COLOR_CLASSES, type LabelColor } from "@/lib/types/labels";

interface LabelBadgeProps {
    name: string;
    color: LabelColor;
    size?: "sm" | "md";
    onRemove?: () => void;
    className?: string;
    title?: string;
}

export function LabelBadge({
    name,
    color,
    size = "md",
    onRemove,
    className,
    title,
}: LabelBadgeProps) {
    const c = LABEL_COLOR_CLASSES[color];
    const isSm = size === "sm";
    return (
        <span
            title={title ?? name}
            className={cn(
                "inline-flex items-center gap-1 font-semibold uppercase border rounded-full whitespace-nowrap",
                isSm ? "text-[9px] px-1.5 py-0.5" : "text-[10px] px-2 py-0.5",
                c.bg, c.text, c.border,
                className
            )}
        >
            <span className={cn("rounded-full", isSm ? "w-1.5 h-1.5" : "w-2 h-2", c.dotBg)} />
            <span className="truncate max-w-[120px]">{name}</span>
            {onRemove && (
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onRemove(); }}
                    className={cn(
                        "ml-0.5 -mr-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors flex items-center justify-center",
                        isSm ? "w-3 h-3" : "w-3.5 h-3.5"
                    )}
                    aria-label={`Remover tag ${name}`}
                >
                    <X className={cn(isSm ? "w-2 h-2" : "w-2.5 h-2.5")} />
                </button>
            )}
        </span>
    );
}
