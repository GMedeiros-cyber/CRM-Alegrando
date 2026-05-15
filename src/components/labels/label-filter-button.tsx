"use client";

import { useState, useEffect, useRef } from "react";
import { Tag, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { LABEL_COLOR_CLASSES, type Label } from "@/lib/types/labels";

interface LabelFilterButtonProps {
    selectedIds: string[];
    onChange: (ids: string[]) => void;
    availableLabels: Label[];
}

export function LabelFilterButton({
    selectedIds,
    onChange,
    availableLabels,
}: LabelFilterButtonProps) {
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

    const isEmpty = availableLabels.length === 0;
    const count = selectedIds.length;

    function toggle(id: string) {
        if (selectedIds.includes(id)) {
            onChange(selectedIds.filter((x) => x !== id));
        } else {
            onChange([...selectedIds, id]);
        }
    }

    // Label do botão
    let buttonLabel: React.ReactNode;
    if (count === 0) {
        buttonLabel = <span className="font-semibold">Tags</span>;
    } else if (count === 1) {
        const single = availableLabels.find((l) => l.id === selectedIds[0]);
        if (single) {
            const c = LABEL_COLOR_CLASSES[single.color];
            buttonLabel = (
                <>
                    <span className={cn("rounded-full w-2 h-2", c.dotBg)} />
                    <span className="font-semibold truncate max-w-[90px]">{single.name}</span>
                </>
            );
        } else {
            buttonLabel = <span className="font-semibold">1 tag</span>;
        }
    } else {
        buttonLabel = <span className="font-semibold">{count} tags</span>;
    }

    return (
        <div ref={wrapperRef} className="relative">
            <button
                type="button"
                disabled={isEmpty}
                onClick={() => setOpen((v) => !v)}
                title={isEmpty ? "Nenhuma tag criada. Crie tags no painel do cliente." : undefined}
                className={cn(
                    "flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-lg border transition-all",
                    "bg-[#EEF2FF] dark:bg-[#1e2536] text-[#37352F] dark:text-[#cbd5e1]",
                    !isEmpty && "hover:border-brand-500/60 hover:shadow-sm hover:shadow-brand-500/10",
                    open
                        ? "border-brand-500/70 ring-2 ring-brand-500/20"
                        : count > 0
                            ? "border-brand-500/60"
                            : "border-[#C7D2FE] dark:border-[#3d4a60]",
                    isEmpty && "opacity-50 cursor-not-allowed"
                )}
            >
                <Tag className="w-3 h-3 text-[#6366F1] dark:text-[#94a3b8]" />
                {buttonLabel}
                <ChevronDown className={cn("w-3 h-3 transition-transform", open && "rotate-180")} />
            </button>

            {open && !isEmpty && (
                <div className="absolute right-0 z-30 mt-1.5 w-56 rounded-xl border border-[#C7D2FE] dark:border-[#3d4a60] bg-[#EEF2FF] dark:bg-[#1e2536] shadow-xl shadow-black/10 dark:shadow-black/40 overflow-hidden animate-in fade-in-0 zoom-in-95 duration-100 origin-top-right">
                    <div className="px-3 pt-2 pb-1 text-[9px] font-bold uppercase tracking-wider text-[#6366F1] dark:text-[#94a3b8]">
                        Filtrar por tags
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                        {availableLabels.map((l) => {
                            const active = selectedIds.includes(l.id);
                            const c = LABEL_COLOR_CLASSES[l.color];
                            return (
                                <button
                                    key={l.id}
                                    type="button"
                                    onClick={() => toggle(l.id)}
                                    className={cn(
                                        "w-full flex items-center gap-2 px-3 py-1.5 text-[12px] transition-colors text-left",
                                        active
                                            ? "bg-brand-500/15 text-brand-500 dark:text-brand-400 font-semibold"
                                            : "text-[#37352F] dark:text-[#cbd5e1] hover:bg-[#C7D2FE]/40 dark:hover:bg-[#3d4a60]/50"
                                    )}
                                >
                                    <span className={cn("rounded-full w-2.5 h-2.5 shrink-0", c.dotBg)} />
                                    <span className="flex-1 truncate">{l.name}</span>
                                    {active && <Check className="w-3.5 h-3.5 shrink-0" />}
                                </button>
                            );
                        })}
                    </div>
                    {count > 0 && (
                        <>
                            <div className="my-1 mx-3 h-px bg-[#C7D2FE] dark:bg-[#3d4a60]" />
                            <button
                                type="button"
                                onClick={() => { onChange([]); }}
                                className="w-full text-center px-3 py-1.5 text-[11px] font-semibold text-[#6366F1] dark:text-[#94a3b8] hover:text-foreground transition-colors"
                            >
                                Limpar seleção
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
