"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Settings2, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { listRespostasRapidas } from "@/lib/actions/respostas-rapidas";
import { aplicarPlaceholders, filtrarRespostas, type RespostaRapida, type ValoresPlaceholder } from "@/lib/respostas-rapidas";

/**
 * Menu da "/" — a parte que mais erra, então as regras ficam aqui, num lugar só:
 *
 * - ABRE só quando a caixa VAZIA recebe "/" como primeiro caractere. "e/ou",
 *   URL e "9h30 4/5" nunca disparam: a transição observada é "" → "/".
 * - FILTRA pelo que vem depois da barra (atalho ou título).
 * - FECHA ao apagar a barra, ao inserir, ou com Esc — e depois de Esc não
 *   reabre até a caixa esvaziar de novo (senão Esc não serviria para nada).
 * - Enter insere, ↑/↓ navegam. A guarda de composição (isComposing/229) é da
 *   caixa, ANTES de chamar `onKeyDown` daqui.
 *
 * O hook é o estado; o componente abaixo só desenha.
 */
export function useRespostasRapidasMenu(opts: {
    texto: string;
    valores: ValoresPlaceholder;
    /** Recebe o conteúdo já com placeholders aplicados; quem chama põe na caixa. */
    onInserir: (conteudo: string) => void;
}) {
    const { texto, valores, onInserir } = opts;
    const [aberto, setAberto] = useState(false);
    const [indice, setIndice] = useState(0);
    const [respostas, setRespostas] = useState<RespostaRapida[] | null>(null);
    // Esc dispensa até a caixa esvaziar de novo — senão Esc não serviria para nada.
    const [dispensado, setDispensado] = useState(false);

    // Estado derivado da prop `texto`, no padrão "compara com o anterior durante
    // o render" — é o jeito sancionado de reagir a prop sem efeito. A transição
    // que abre é exatamente "" → "/"; deixar de começar com "/" fecha.
    const [textoAnterior, setTextoAnterior] = useState(texto);
    if (texto !== textoAnterior) {
        setTextoAnterior(texto);
        if (texto === "") setDispensado(false);
        if (textoAnterior === "" && texto === "/" && !dispensado) {
            setAberto(true);
            setIndice(0);
        } else if (!texto.startsWith("/")) {
            setAberto(false);
        }
    }

    // Carrega na primeira abertura; o modal de gestão chama `recarregar`.
    const recarregar = useCallback(() => listRespostasRapidas().then(setRespostas), []);
    useEffect(() => {
        if (!aberto || respostas !== null) return;
        let vivo = true;
        listRespostasRapidas().then(r => { if (vivo) setRespostas(r); });
        return () => { vivo = false; };
    }, [aberto, respostas]);

    const query = aberto ? texto.slice(1) : "";
    const itens = useMemo(() => (aberto ? filtrarRespostas(respostas ?? [], query) : []), [aberto, respostas, query]);
    const indiceValido = Math.min(indice, Math.max(itens.length - 1, 0));

    const fechar = useCallback(() => { setAberto(false); setDispensado(true); }, []);
    const inserir = useCallback((r: RespostaRapida) => {
        setAberto(false);
        onInserir(aplicarPlaceholders(r.conteudo, valores));
    }, [onInserir, valores]);

    /** Devolve `true` se consumiu a tecla — a caixa então não faz mais nada com ela. */
    const onKeyDown = useCallback((e: React.KeyboardEvent): boolean => {
        if (!aberto) return false;
        if (e.key === "Escape") { e.preventDefault(); fechar(); return true; }
        if (e.key === "ArrowDown") { e.preventDefault(); setIndice(i => (itens.length ? (i + 1) % itens.length : 0)); return true; }
        if (e.key === "ArrowUp") { e.preventDefault(); setIndice(i => (itens.length ? (i - 1 + itens.length) % itens.length : 0)); return true; }
        if (e.key === "Enter" && !e.shiftKey && !e.altKey) {
            e.preventDefault();
            const alvo = itens[indiceValido];
            if (alvo) inserir(alvo);
            return true;
        }
        return false;
    }, [aberto, itens, indiceValido, fechar, inserir]);

    return { aberto, query, itens, indice: indiceValido, setIndice, carregando: aberto && respostas === null, inserir, fechar, onKeyDown, recarregar };
}

export type RespostasRapidasMenuState = ReturnType<typeof useRespostasRapidasMenu>;

/** Altura fixa por item (título + uma linha de prévia) e quantos cabem inteiros. */
const ALTURA_ITEM = 52;
const ITENS_VISIVEIS = 5;

/**
 * Popover acima da caixa. Posicionado pelo pai (`absolute bottom-full`), que
 * precisa ser `relative`. Não rouba o foco: a caixa continua recebendo as
 * teclas e repassa para `menu.onKeyDown`.
 */
export function RespostasRapidasMenu({ menu, onGerenciar }: {
    menu: RespostasRapidasMenuState;
    onGerenciar: () => void;
}) {
    const listaRef = useRef<HTMLUListElement>(null);
    // Mantém o item selecionado à vista ao navegar com as setas.
    useEffect(() => {
        listaRef.current?.querySelector<HTMLElement>(`[data-indice="${menu.indice}"]`)?.scrollIntoView({ block: "nearest" });
    }, [menu.indice]);

    if (!menu.aberto) return null;

    return (
        <div
            role="listbox"
            aria-label="Respostas rápidas"
            // Largura própria, ancorada à esquerda: com 8 títulos curtos, ocupar o
            // chat inteiro engolia a conversa atrás. `mb-3` é o respiro até a caixa.
            className="absolute bottom-full left-0 mb-3 z-30 w-[460px] max-w-full rounded-xl border-2 border-[#C7D2FE] dark:border-[#3d4a60] bg-[#F7F7F5] dark:bg-[#0f1829] shadow-2xl shadow-black/20 overflow-hidden animate-in fade-in slide-in-from-bottom-1 duration-150"
        >
            <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#6366F1] dark:text-[#94a3b8] border-b border-[#C7D2FE] dark:border-[#3d4a60]">
                <Zap className="w-3 h-3" />
                Respostas rápidas
                {menu.query && <span className="normal-case tracking-normal font-normal">· filtro “{menu.query}”</span>}
                <span className="ml-auto normal-case tracking-normal font-normal">
                    {menu.itens.length > ITENS_VISIVEIS ? `${menu.itens.length} — role para ver todas` : `${menu.itens.length}`}
                </span>
            </div>

            {/* Item de altura FIXA e a lista com altura de N itens inteiros: o corte
                nunca cai no meio de uma frase (lia como quebrado, não como "rola"). */}
            <ul ref={listaRef} className="overflow-y-auto py-1" style={{ maxHeight: ITENS_VISIVEIS * ALTURA_ITEM + 8 }}>
                {menu.carregando && (
                    <li className="px-3 py-2 text-xs text-[#6366F1] dark:text-[#94a3b8]">Carregando…</li>
                )}
                {!menu.carregando && menu.itens.length === 0 && (
                    <li className="px-3 py-2 text-xs text-[#6366F1] dark:text-[#94a3b8]">
                        Nenhuma resposta para “/{menu.query}”.
                    </li>
                )}
                {menu.itens.map((r, i) => (
                    <li key={r.id} data-indice={i}>
                        <button
                            type="button"
                            role="option"
                            aria-selected={i === menu.indice}
                            // mousedown, não click: click vem depois do blur da caixa.
                            onMouseDown={(e) => { e.preventDefault(); menu.inserir(r); }}
                            onMouseEnter={() => menu.setIndice(i)}
                            style={{ height: ALTURA_ITEM }}
                            className={cn(
                                "w-full text-left px-3 flex flex-col justify-center gap-0.5 transition-colors",
                                i === menu.indice ? "bg-brand-500/15" : "hover:bg-[#EEF2FF] dark:hover:bg-[#1e2536]",
                            )}
                        >
                            <span className="flex items-center gap-2 text-sm">
                                <span className="font-mono text-[11px] text-brand-500 dark:text-brand-400 shrink-0">{r.atalho}</span>
                                <span className="font-medium text-[#191918] dark:text-white truncate">{r.titulo}</span>
                            </span>
                            <span className="text-[11px] text-[#6366F1] dark:text-[#94a3b8] line-clamp-1">{r.conteudo}</span>
                        </button>
                    </li>
                ))}
            </ul>

            <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); menu.fechar(); onGerenciar(); }}
                className="w-full flex items-center gap-1.5 px-3 py-2 text-[11px] font-semibold text-brand-500 dark:text-brand-400 border-t border-[#C7D2FE] dark:border-[#3d4a60] hover:bg-brand-500/10 transition-colors"
            >
                <Settings2 className="w-3 h-3" />
                Gerenciar respostas
            </button>
        </div>
    );
}
