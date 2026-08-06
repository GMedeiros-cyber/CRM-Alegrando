"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { EMAIL_FIELD_LABELS, type EmailFieldKey } from "@/lib/types/email";

/** px por segundo do carrossel — devagar de propósito, é pra ler, não correr. */
const MARQUEE_SPEED = 26;
/** Pausa nas pontas antes de voltar. */
const EDGE_PAUSE_MS = 900;

export interface EmailChipsProps {
    entries: { key: EmailFieldKey; address: string }[];
    /** Pra montar o link que abre o lead em Conversas. */
    telefone: string;
    canal: string;
    className?: string;
}

/**
 * Lista horizontal de endereços de um lead, separados por barra.
 *
 * Quando não cabe: no hover vira carrossel lento, e a qualquer momento dá pra
 * arrastar com o mouse. Clicar num endereço abre o lead em **aba nova**, no
 * campo correspondente — aba nova de propósito, porque isso costuma ser usado
 * no meio de um disparo e navegar na mesma aba jogaria fora o rascunho.
 */
export function EmailChips({ entries, telefone, canal, className }: EmailChipsProps) {
    const trackRef = useRef<HTMLDivElement>(null);
    const [overflowing, setOverflowing] = useState(false);

    const hovering = useRef(false);
    const dragging = useRef(false);
    const dragMoved = useRef(false);
    const dragStart = useRef({ x: 0, scroll: 0 });
    const rafId = useRef<number | null>(null);

    // Só liga o carrossel se o conteúdo realmente estourar a caixa.
    useEffect(() => {
        const el = trackRef.current;
        if (!el) return;
        const check = () => setOverflowing(el.scrollWidth > el.clientWidth + 1);
        check();
        const observer = new ResizeObserver(check);
        observer.observe(el);
        return () => observer.disconnect();
    }, [entries]);

    const stopMarquee = useCallback(() => {
        if (rafId.current !== null) {
            cancelAnimationFrame(rafId.current);
            rafId.current = null;
        }
    }, []);

    const startMarquee = useCallback(() => {
        const el = trackRef.current;
        if (!el) return;
        stopMarquee();

        let last = performance.now();
        let direction: 1 | -1 = 1;
        let pausedUntil = 0;

        const step = (now: number) => {
            const dt = (now - last) / 1000;
            last = now;

            if (!hovering.current || dragging.current) {
                rafId.current = null;
                return;
            }

            if (now >= pausedUntil) {
                const max = el.scrollWidth - el.clientWidth;
                el.scrollLeft += direction * MARQUEE_SPEED * dt;

                if (direction === 1 && el.scrollLeft >= max - 0.5) {
                    el.scrollLeft = max;
                    direction = -1;
                    pausedUntil = now + EDGE_PAUSE_MS;
                } else if (direction === -1 && el.scrollLeft <= 0.5) {
                    el.scrollLeft = 0;
                    direction = 1;
                    pausedUntil = now + EDGE_PAUSE_MS;
                }
            }

            rafId.current = requestAnimationFrame(step);
        };

        rafId.current = requestAnimationFrame(step);
    }, [stopMarquee]);

    useEffect(() => stopMarquee, [stopMarquee]);

    function handleEnter() {
        hovering.current = true;
        if (!overflowing) return;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        startMarquee();
    }

    function handleLeave() {
        hovering.current = false;
        stopMarquee();
        trackRef.current?.scrollTo({ left: 0, behavior: "smooth" });
    }

    function handlePointerDown(e: React.PointerEvent) {
        if (!overflowing) return;
        const el = trackRef.current;
        if (!el) return;
        dragging.current = true;
        dragMoved.current = false;
        dragStart.current = { x: e.clientX, scroll: el.scrollLeft };
        stopMarquee();
        el.setPointerCapture(e.pointerId);
    }

    function handlePointerMove(e: React.PointerEvent) {
        if (!dragging.current) return;
        const el = trackRef.current;
        if (!el) return;
        const delta = e.clientX - dragStart.current.x;
        if (Math.abs(delta) > 3) dragMoved.current = true;
        el.scrollLeft = dragStart.current.scroll - delta;
    }

    function handlePointerUp(e: React.PointerEvent) {
        if (!dragging.current) return;
        dragging.current = false;
        trackRef.current?.releasePointerCapture(e.pointerId);
        // Volta o carrossel só se o mouse ainda estiver por cima.
        if (hovering.current && overflowing) startMarquee();
    }

    function openLead(e: React.MouseEvent, field: EmailFieldKey) {
        // Dentro do modal a linha inteira é um <label> que marca o checkbox:
        // sem isso, conferir o endereço desmarcaria o lead sem querer.
        e.preventDefault();
        e.stopPropagation();
        if (dragMoved.current) return; // foi arrasto, não clique

        const params = new URLSearchParams({ telefone, canal, focus: field });
        window.open(`/conversas?${params}`, "_blank", "noopener");
    }

    return (
        <div
            className={cn("relative min-w-0", className)}
            onMouseEnter={handleEnter}
            onMouseLeave={handleLeave}
        >
            <div
                ref={trackRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className={cn(
                    "flex items-center gap-1.5 overflow-x-auto whitespace-nowrap scrollbar-none",
                    overflowing && "cursor-grab active:cursor-grabbing",
                )}
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
                {entries.map(({ key, address }, index) => (
                    <span key={key} className="flex items-center gap-1.5 shrink-0">
                        {index > 0 && (
                            <span className="text-border select-none" aria-hidden>
                                │
                            </span>
                        )}
                        <a
                            href={`/conversas?telefone=${encodeURIComponent(telefone)}&canal=${encodeURIComponent(canal)}&focus=${key}`}
                            onClick={(e) => openLead(e, key)}
                            title={`${EMAIL_FIELD_LABELS[key]} — abrir o cadastro em nova aba`}
                            className="text-[11px] text-muted-foreground hover:text-brand-500 dark:hover:text-brand-400 hover:underline underline-offset-2 transition-colors"
                        >
                            {address}
                        </a>
                    </span>
                ))}
            </div>

            {/* Fade na borda: sinaliza que tem mais coisa pro lado. */}
            {overflowing && (
                <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent"
                />
            )}
        </div>
    );
}
