"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

const MARGIN = 8;
const MIN_HEIGHT = 120;

/**
 * Painel flutuante da barra de formatação (dropdowns, paleta, link).
 *
 * Vai num portal no body com posição `fixed`, e não `absolute` dentro do
 * editor: o editor e o modal têm `overflow-hidden`, então qualquer coisa
 * posicionada dentro deles seria cortada. A altura é calculada a partir do
 * espaço real disponível, e o painel vira pra cima quando não cabe embaixo —
 * sem depender da quantidade de itens nem de onde o modal está na tela.
 */
export function ToolbarPopover({
    anchor,
    onClose,
    children,
    className,
    align = "start",
}: {
    anchor: HTMLElement | null;
    onClose: () => void;
    children: React.ReactNode;
    className?: string;
    align?: "start" | "end";
}) {
    const panelRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{
        left: number;
        top?: number;
        bottom?: number;
        maxHeight: number;
    } | null>(null);

    useLayoutEffect(() => {
        if (!anchor) return;

        function place() {
            const el = anchor;
            const panel = panelRef.current;
            if (!el || !panel) return;

            const rect = el.getBoundingClientRect();
            const espacoAcima = rect.top - MARGIN;
            const espacoAbaixo = window.innerHeight - rect.bottom - MARGIN;
            // A barra fica no rodapé do editor, então o normal é abrir pra
            // cima; só desce quando lá em cima é ainda mais apertado.
            const paraCima = espacoAcima >= Math.min(espacoAbaixo, MIN_HEIGHT) || espacoAcima > espacoAbaixo;

            const largura = panel.offsetWidth || 180;
            let left = align === "end" ? rect.right - largura : rect.left;
            left = Math.max(MARGIN, Math.min(left, window.innerWidth - largura - MARGIN));

            setPos(
                paraCima
                    ? {
                          left,
                          bottom: window.innerHeight - rect.top + 4,
                          maxHeight: Math.max(MIN_HEIGHT, espacoAcima - 4),
                      }
                    : {
                          left,
                          top: rect.bottom + 4,
                          maxHeight: Math.max(MIN_HEIGHT, espacoAbaixo - 4),
                      },
            );
        }

        place();
        window.addEventListener("resize", place);
        window.addEventListener("scroll", place, true);
        return () => {
            window.removeEventListener("resize", place);
            window.removeEventListener("scroll", place, true);
        };
    }, [anchor, align]);

    useEffect(() => {
        function onDoc(e: MouseEvent) {
            const alvo = e.target as Node;
            if (panelRef.current?.contains(alvo)) return;
            if (anchor?.contains(alvo)) return;
            onClose();
        }
        function onEsc(e: KeyboardEvent) {
            if (e.key !== "Escape") return;
            // Não deixa o Esc subir e fechar o modal de composição junto.
            e.stopPropagation();
            onClose();
        }
        document.addEventListener("mousedown", onDoc);
        document.addEventListener("keydown", onEsc, true);
        return () => {
            document.removeEventListener("mousedown", onDoc);
            document.removeEventListener("keydown", onEsc, true);
        };
    }, [anchor, onClose]);

    if (typeof document === "undefined") return null;

    return createPortal(
        <div
            ref={panelRef}
            // data-toolbar-popover: o modal de composição usa isto pra saber
            // que o clique aqui não é "clique fora" e não deve fechá-lo.
            data-toolbar-popover=""
            // pointer-events-auto é OBRIGATÓRIO, não enfeite: o Dialog do Radix
            // zera os pointer-events do body enquanto está aberto, e este painel
            // é portalizado justamente no body. Sem isto ele aparece na tela mas
            // não recebe clique nenhum — nem nos botões, nem nos inputs.
            // z-[70]: acima do Dialog (z-50) e do Picker (z-61).
            className={cn(
                "fixed z-[70] pointer-events-auto rounded-lg border border-border bg-popover shadow-xl overflow-y-auto",
                className,
            )}
            style={{
                left: pos?.left ?? -9999,
                top: pos?.top,
                bottom: pos?.bottom,
                maxHeight: pos?.maxHeight,
                visibility: pos ? "visible" : "hidden",
            }}
            onMouseDown={(e) => {
                // preventDefault preserva a seleção do contentEditable quando
                // se clica num botão — mas também impede o foco de ir pro
                // elemento clicado. Em campo editável isso trava a digitação,
                // então ali o evento segue normalmente.
                const alvo = e.target as HTMLElement | null;
                if (alvo?.closest("input, textarea, select, [contenteditable]")) return;
                e.preventDefault();
            }}
        >
            {children}
        </div>,
        document.body,
    );
}
