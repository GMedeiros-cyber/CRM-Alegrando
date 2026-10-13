"use client";

import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Busca das tags: um componente só, usado no filtro da lista de conversas e
 * no picker do lead. São 17 tags em popover de altura fixa, com nomes longos
 * e parecidos ("MAIRIPORÃ - PÚBLICA", "MAIRIPORÃ - PARTICULAR") — rolar e ler
 * era o jeito de achar.
 *
 * Filtragem no cliente (`filtrarLabels`): as tags já estão todas em memória,
 * ir ao servidor para 17 linhas seria viagem perdida.
 *
 * Esc NÃO é tratado aqui: medido, o listener de `document` do popover pai
 * vence de todo jeito, e fechar no Esc é o idioma do app (menu, picker e
 * modal fazem isso). Quem limpa a busca é o X. Quem reabre começa limpo.
 */
export function LabelSearch({ value, onChange, className, autoFocus }: {
    value: string;
    onChange: (v: string) => void;
    className?: string;
    autoFocus?: boolean;
}) {
    return (
        <div className={cn("relative px-2 pb-1.5", className)}>
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 -mt-0.5 w-3 h-3 text-[#6366F1] dark:text-[#94a3b8] pointer-events-none" />
            <input
                type="text"
                value={value}
                autoFocus={autoFocus}
                onChange={(e) => onChange(e.target.value)}
                placeholder="Buscar tag..."
                aria-label="Buscar tag"
                className="w-full pl-7 pr-7 py-1.5 rounded-md text-[12px] bg-[#F7F7F5] dark:bg-[#0f1829] border border-[#A5B4FC] dark:border-[#4a5568] text-[#191918] dark:text-white placeholder:text-[#6366F1] dark:placeholder:text-[#94a3b8] focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none"
            />
            {value && (
                <button
                    type="button"
                    onClick={() => onChange("")}
                    aria-label="Limpar busca"
                    className="absolute right-4 top-1/2 -translate-y-1/2 -mt-0.5 p-0.5 rounded text-[#6366F1] dark:text-[#94a3b8] hover:text-[#191918] dark:hover:text-white"
                >
                    <X className="w-3 h-3" />
                </button>
            )}
        </div>
    );
}
