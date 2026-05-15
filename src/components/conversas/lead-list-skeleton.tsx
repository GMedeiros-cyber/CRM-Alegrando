"use client";

import { cn } from "@/lib/utils";

interface LeadListSkeletonProps {
    count?: number;
    className?: string;
}

/**
 * Skeleton sutil mostrado quando a cache key da lista mudou (canalFiltro/
 * labelFiltro) e o conteúdo cacheado seria semanticamente errado. Mantém a
 * geometria do `LeadListItem` pra evitar reflow ao popular.
 */
export function LeadListSkeleton({ count = 7, className }: LeadListSkeletonProps) {
    return (
        <div
            className={cn("space-y-1.5 flex flex-col", className)}
            aria-busy="true"
            aria-live="polite"
        >
            {Array.from({ length: count }).map((_, i) => (
                <div
                    key={i}
                    className="px-3 py-2.5 rounded-xl border border-[#C7D2FE]/40 dark:border-[#3d4a60]/40 bg-[#EEF2FF]/30 dark:bg-[#1e2536]/20"
                    style={{ animationDelay: `${i * 30}ms` }}
                >
                    <div className="flex items-center gap-3 animate-pulse">
                        <div className="w-9 h-9 rounded-full bg-[#C7D2FE]/60 dark:bg-[#3d4a60]/60 shrink-0" />
                        <div className="flex-1 min-w-0 space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                                <div className="h-3 w-24 rounded bg-[#C7D2FE]/60 dark:bg-[#3d4a60]/60" />
                                <div className="h-2 w-8 rounded bg-[#C7D2FE]/40 dark:bg-[#3d4a60]/40" />
                            </div>
                            <div className="h-2.5 w-3/4 rounded bg-[#C7D2FE]/40 dark:bg-[#3d4a60]/40" />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
