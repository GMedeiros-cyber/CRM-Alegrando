"use client";

import { cn } from "@/lib/utils";
import type { ContagensAbas, ListaAba } from "@/lib/actions/leads";

/**
 * `contagem: false` em "Todas" não é esquecimento.
 *
 * O número dela é o total da base, que já passa de 99 e virava um "99+" — um
 * selo que ocupa o maior espaço da barra e não informa nada, já que "Todas" é,
 * por definição, tudo. Tirando ele, as quatro pílulas cabem lado a lado na
 * coluna de 350px sem rolagem; com ele, a quarta ficava fora da tela.
 */
const ABAS: { valor: ListaAba; rotulo: string; chave: keyof ContagensAbas; contagem: boolean }[] = [
    { valor: "todas", rotulo: "Todas", chave: "todas", contagem: false },
    { valor: "nao_lidas", rotulo: "Não lidas", chave: "naoLidas", contagem: true },
    { valor: "favoritos", rotulo: "Favoritos", chave: "favoritos", contagem: true },
    { valor: "emails", rotulo: "E-mails", chave: "emails", contagem: true },
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
            // `mt-3` separa da linha "ORDENAR POR", que antes ficava colada.
            // Sem rolagem horizontal: as quatro dividem a largura por igual
            // (`flex-1`), então nenhuma fica fora da tela nem sobra pílula meio
            // cortada na borda — que era o que parecia desalinhado.
            className="mt-3 flex items-stretch gap-1"
        >
            {ABAS.map(({ valor, rotulo, chave, contagem }) => {
                const ativa = aba === valor;
                const n = contagens[chave];
                const mostrarSelo = contagem && !carregando && n > 0;

                return (
                    <button
                        key={valor}
                        type="button"
                        role="tab"
                        aria-selected={ativa}
                        onClick={() => onChange(valor)}
                        className={cn(
                            "flex min-w-0 flex-1 items-center justify-center gap-1 rounded-full border px-1.5 py-1.5",
                            "text-[11px] font-semibold leading-none transition-colors",
                            ativa
                                ? "border-brand-500 bg-brand-500 text-white"
                                : "border-[#C7D2FE] dark:border-[#3d4a60] bg-card text-[#37352F] dark:text-[#cbd5e1] hover:border-brand-500/50",
                        )}
                    >
                        {/* `truncate` em vez de encolher a fonte: numa coluna
                            estreita "Favoritos" corta com reticências e a altura
                            do alvo de toque não muda. */}
                        <span className="truncate">{rotulo}</span>
                        {/* Some enquanto carrega em vez de mostrar o número da
                            consulta anterior — contagem velha ao lado de lista
                            nova é pior do que contagem nenhuma. */}
                        {mostrarSelo && (
                            <span
                                className={cn(
                                    "shrink-0 rounded-full px-1 text-[10px] font-bold leading-4",
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
