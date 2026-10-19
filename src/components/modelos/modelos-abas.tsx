"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { ChaveMensagem } from "@/lib/mensagem-placeholders";
import { MensagensModelos } from "./mensagens-modelos";

const ABAS = [{ id: "mensagens", rotulo: "Mensagens" }] as const;
export type Aba = (typeof ABAS)[number]["id"];

/** Abas de Modelos. Setas do teclado trocam de aba, como pede o padrão de tablist. */
export function ModelosAbas({ abaInicial, textos, linkGoogle }: {
    abaInicial: Aba;
    textos: Record<ChaveMensagem, string>;
    linkGoogle: string;
}) {
    const [aba, setAba] = useState<Aba>(ABAS.some((a) => a.id === abaInicial) ? abaInicial : "mensagens");
    const botoes = useRef<Array<HTMLButtonElement | null>>([]);

    function teclado(e: React.KeyboardEvent, i: number) {
        const passo = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (!passo) return;
        e.preventDefault();
        const prox = (i + passo + ABAS.length) % ABAS.length;
        setAba(ABAS[prox].id);
        botoes.current[prox]?.focus();
    }

    return (
        <div className="space-y-6">
            <div role="tablist" aria-label="Modelos" className="inline-flex rounded-lg border border-[#C7D2FE] dark:border-[#3d4a60] bg-[#EEF2FF] dark:bg-[#1e2536] p-1 bento-enter [animation-delay:100ms]">
                {ABAS.map((a, i) => (
                    <button
                        key={a.id}
                        ref={(el) => { botoes.current[i] = el; }}
                        role="tab"
                        id={`aba-${a.id}`}
                        aria-selected={aba === a.id}
                        aria-controls={`painel-${a.id}`}
                        tabIndex={aba === a.id ? 0 : -1}
                        onClick={() => setAba(a.id)}
                        onKeyDown={(e) => teclado(e, i)}
                        className={cn(
                            "h-10 md:h-8 px-4 rounded-md text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6366F1]/50",
                            aba === a.id
                                ? "bg-card text-[#191918] dark:text-white shadow-sm"
                                : "text-[#6366F1] dark:text-[#94a3b8] hover:text-[#191918] dark:hover:text-white",
                        )}
                    >
                        {a.rotulo}
                    </button>
                ))}
            </div>

            <div role="tabpanel" id={`painel-${aba}`} aria-labelledby={`aba-${aba}`}>
                {aba === "mensagens" && <MensagensModelos textos={textos} linkGoogle={linkGoogle} />}
            </div>
        </div>
    );
}
