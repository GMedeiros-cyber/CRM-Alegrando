"use client";

import { memo } from "react";
import Image from "next/image";
import type { ClienteListItem } from "@/lib/actions/leads";
import { cn } from "@/lib/utils";

function isRecentlyCreated(createdAt: Date | null): boolean {
    if (!createdAt) return false;
    return Date.now() - new Date(createdAt).getTime() < 60_000;
}

function formatLastMessageTime(date: Date | null): string {
    if (!date) return "";
    const now = new Date();
    const d = new Date(date);

    // Comparar dias-calendário no timezone local (não ms brutos)
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dMidnight    = new Date(d.getFullYear(),   d.getMonth(),   d.getDate());
    const diffDays = Math.round(
        (todayMidnight.getTime() - dMidnight.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays === 0) {
        return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    }
    if (diffDays === 1) return "Ontem";
    if (diffDays <= 6) {
        const dias = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
        return dias[d.getDay()];
    }
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

interface LeadListItemProps {
    item: ClienteListItem;
    isSelected: boolean;
    onClick: () => void;
    tick: number;
}

const LeadListItemInner = function LeadListItem({ item, isSelected, onClick }: LeadListItemProps) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "w-full text-left px-3 py-3 rounded-xl transition-all duration-150 border-2",
                isSelected
                    ? "bg-card border-brand-500 shadow-lg shadow-brand-500/15"
                    : "bg-card/60 border-border/50 hover:bg-card hover:border-muted-foreground/40"
            )}
        >
            <div className="flex items-center gap-3">
                {/* Avatar */}
                <div className="w-9 h-9 rounded-full bg-[#E0E7FF] dark:bg-[#2d3347] shrink-0 border border-[#A5B4FC] dark:border-[#4a5568] overflow-hidden flex items-center justify-center text-sm font-bold text-[#191918] dark:text-white">
                    {item.fotoUrl ? (
                        <Image
                            src={item.fotoUrl}
                            alt={item.nome || "avatar"}
                            width={36}
                            height={36}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                                (e.currentTarget as HTMLImageElement).style.display = "none";
                                const fallback = e.currentTarget.parentElement;
                                if (fallback) fallback.textContent = (item.nome || String(item.telefone)).charAt(0).toUpperCase();
                            }}
                            unoptimized={item.fotoUrl.includes("pps.whatsapp.net")}
                        />
                    ) : (
                        (item.nome || String(item.telefone)).charAt(0).toUpperCase()
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                        <p className={cn(
                            "text-sm font-bold truncate",
                            isSelected
                                ? "text-brand-400"
                                : "text-[#191918] dark:text-white"
                        )}>
                            {item.nome || item.telefone}
                        </p>
                        <span className="text-[10px] text-[#6366F1] dark:text-[#94a3b8] shrink-0 ml-auto">
                            {formatLastMessageTime(item.lastMessageAt)}
                        </span>
                        {item.unreadCount > 0 && (
                            <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-brand-500 text-[#191918] dark:text-white text-[10px] font-bold flex items-center justify-center shrink-0 animate-in zoom-in-50">
                                {item.unreadCount > 99 ? "99+" : item.unreadCount}
                            </span>
                        )}
                    </div>
                    <p className="text-[11px] font-mono text-[#191918] dark:text-white font-medium truncate mt-0.5">
                        {item.telefone}
                    </p>
                </div>
            </div>
            <div className="mt-2 flex justify-end gap-1.5 min-h-[20px]">
                {item.statusAtendimento === "novo" && isRecentlyCreated(item.createdAt) && (
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/40">
                        NOVO
                    </span>
                )}
                {!item.iaAtiva && item.canal !== "festas" && (
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-orange-200 text-orange-800 border border-orange-400">
                        Manual
                    </span>
                )}
                {item.canal === "festas" && (
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-pink-200 text-pink-800 border border-pink-400">
                        🎉 Festas
                    </span>
                )}
            </div>
        </button>
    );
};

export const LeadListItem = memo(LeadListItemInner);
