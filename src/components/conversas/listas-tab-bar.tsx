"use client";

import { cn } from "@/lib/utils";
import type { ContagensAbas, ListaAba } from "@/lib/actions/leads";

const ABAS: { valor: ListaAba; rotulo: string; chave: keyof ContagensAbas }[] = [
    { valor: "todas", rotulo: "Todas", chave: "todas" },
    { valor: "nao_lidas", rotulo: "Não lidas", chave: "naoLidas" },
    { valor: "favoritos", rotulo: "Favoritos", chave: "favoritos" },
    { valor: "emails", rotulo: "E-mails", chave: "emails" },
];

export interface ListasTabBarProps {
    aba: ListaAba;
    onChange: (aba: ListaAba) => void;
    contagens: ContagensAbas;
    carregando: boolean;
}

/**
 * Barra de listas no estilo WhatsApp, entre os filtros e os cards.
 *
 * Grupos ficou de fora de propósito: já existe o filtro de grupo na barra de
 * ordenação, e duplicar o mesmo recorte em dois lugares faria as duas versões
 * divergirem (uma no servidor, outra no cliente).
 *
 * As contagens vêm da mesma consulta que traz a lista e refletem canal, busca e
 * tags — não o estreitamento de Grupos/IA, que roda no cliente. Por isso os
 * números não mudam ao trocar de aba: eles descrevem a base, não o recorte.
 */
export function ListasTabBar({ aba, onChange, contagens, carregando }: ListasTabBarProps) {
    return (
        <div
            role="tablist"
            aria-label="Filtrar conversas"
            // Rola em vez de espremer: em 320px os quatro rótulos com contagem
            // não cabem, e encolher a fonte tornaria o alvo de toque pequeno.
            className="flex items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
            {ABAS.map(({ valor, rotulo, chave }) => {
                const ativa = aba === valor;
                const n = contagens[chave];

                return (
                    <button
                        key={valor}
                        type="button"
                        role="tab"
                        aria-selected={ativa}
                        onClick={() => onChange(valor)}
                        className={cn(
                            "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                            ativa
                                ? "border-brand-500 bg-brand-500 text-white"
                                : "border-[#C7D2FE] dark:border-[#3d4a60] bg-card text-[#37352F] dark:text-[#cbd5e1] hover:border-brand-500/50",
                        )}
                    >
                        {rotulo}
                        {/* Some enquanto carrega em vez de mostrar o número da
                            consulta anterior — contagem velha ao lado de lista
                            nova é pior do que contagem nenhuma. */}
                        {!carregando && n > 0 && (
                            <span
                                className={cn(
                                    "rounded-full px-1.5 text-[10px] font-bold leading-4",
                                    ativa
                                        ? "bg-white/25 text-white"
                                        : "bg-[#E0E7FF] dark:bg-[#2d3347] text-[#6366F1] dark:text-[#94a3b8]",
                                )}
                            >
                                {n > 99 ? "99+" : n}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
