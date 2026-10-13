"use client";

import { useRef } from "react";
import { CheckCheck, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { inserirNoCursor, partesDaMensagem, type Placeholder } from "@/lib/mensagem-placeholders";

/**
 * Editor de mensagem automática: blocos de placeholder, a caixa de texto puro
 * e a prévia como balão do WhatsApp.
 *
 * Genérico de propósito — recebe o catálogo por prop. Hoje só a mensagem de
 * aniversário usa; follow-up, avaliação e pós-passeio seguem na textarea
 * simples até migrarem.
 *
 * O que fica gravado é o texto da caixa (`Olá {nome}!`). Os blocos só
 * escrevem `{chave}` nela: clique insere no cursor; arrastar usa o drop
 * nativo da textarea (dataTransfer `text/plain`), que insere onde soltar e
 * dispara o onChange sozinho — sem biblioteca.
 */
export function EditorMensagem({ valor, onChange, placeholders, rotuloId, invalido }: {
    valor: string;
    onChange: (valor: string) => void;
    placeholders: Placeholder[];
    /** id do título do card, que nomeia a caixa para leitor de tela. */
    rotuloId: string;
    /** Salvar foi bloqueado por esta mensagem: a caixa aponta onde corrigir. */
    invalido?: boolean;
}) {
    const caixa = useRef<HTMLTextAreaElement>(null);

    function inserir(p: Placeholder) {
        const el = caixa.current;
        if (!el) return;
        const { texto, cursor } = inserirNoCursor(valor, el.selectionStart, el.selectionEnd, `{${p.chave}}`);
        onChange(texto);
        // Depois do render: devolve o foco à caixa com o cursor após o bloco.
        requestAnimationFrame(() => {
            el.focus();
            el.setSelectionRange(cursor, cursor);
        });
    }

    const partes = partesDaMensagem(valor, placeholders);

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                {placeholders.map((p) => (
                    <button
                        key={p.chave}
                        type="button"
                        draggable
                        onDragStart={(e) => {
                            e.dataTransfer.setData("text/plain", `{${p.chave}}`);
                            e.dataTransfer.effectAllowed = "copy";
                        }}
                        onClick={() => inserir(p)}
                        aria-label={`Inserir ${p.rotulo} no texto`}
                        title={`Clique para inserir onde está o cursor, ou arraste para o texto. Vira ${p.exemplo} na mensagem.`}
                        className="inline-flex items-center gap-1 h-7 pl-1.5 pr-2.5 rounded-md border border-[#A5B4FC] dark:border-[#4a5568] bg-[#EEF2FF] dark:bg-[#1e2536] text-xs font-semibold text-[#4338CA] dark:text-[#c7d2fe] hover:bg-[#E0E7FF] dark:hover:bg-[#2d3347] cursor-grab active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6366F1]/50 transition-colors"
                    >
                        <GripVertical className="w-3.5 h-3.5 opacity-60" aria-hidden />
                        {p.rotulo}
                    </button>
                ))}
                <span className="text-xs text-muted-foreground">
                    Clique para inserir no cursor, ou arraste para o texto.
                </span>
            </div>

            <textarea
                ref={caixa}
                value={valor}
                onChange={(e) => onChange(e.target.value)}
                rows={6}
                aria-labelledby={rotuloId}
                aria-invalid={invalido || undefined}
                className={cn(
                    "w-full rounded-lg border border-[#C7D2FE] dark:border-[#3d4a60] bg-[#F0F4FF] dark:bg-[#1e2536] px-4 py-3 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-[#6366F1]/50 text-[#191918] dark:text-white font-medium placeholder:text-[#9B9A97] dark:placeholder:text-[#94a3b8]",
                    "aria-invalid:border-red-500 dark:aria-invalid:border-red-400",
                )}
                placeholder="Escreva a mensagem..."
            />

            <figure>
                <figcaption className="text-xs font-semibold text-muted-foreground mb-1.5">
                    Prévia
                </figcaption>
                {/* Largura de celular: é onde a mensagem é lida, e as quebras
                    de linha de uma coluna de 1100px mentiriam. */}
                <div className="w-full max-w-[420px] rounded-lg bg-[#efeae2] dark:bg-[#0b141a] px-4 py-5">
                    <div className="ml-auto w-fit max-w-[85%] rounded-lg rounded-tr-none bg-[#d9fdd3] dark:bg-[#005c4b] px-3 pt-2 pb-1.5 shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] text-[14px] leading-[1.4] text-[#111b21] dark:text-[#e9edef] whitespace-pre-wrap break-words">
                        {partes.length === 0 ? (
                            <span className="italic text-[#667781] dark:text-[#8696a0]">A mensagem aparece aqui.</span>
                        ) : (
                            partes.map((p, i) =>
                                p.tipo === "desconhecido" ? (
                                    <mark key={i} className="rounded px-0.5 bg-red-100 text-red-700 dark:bg-red-600 dark:text-white font-semibold">
                                        {p.valor}
                                        <span className="sr-only"> (não reconhecido)</span>
                                    </mark>
                                ) : (
                                    <span key={i}>{p.valor}</span>
                                ),
                            )
                        )}
                        <span className="float-right ml-3 mt-1.5 inline-flex items-center gap-0.5 text-[11px] leading-none text-[#667781] dark:text-[#8696a0] select-none" aria-hidden>
                            09:00
                            <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb]" />
                        </span>
                    </div>
                </div>
            </figure>
        </div>
    );
}
