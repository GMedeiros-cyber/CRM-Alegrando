"use client";

import { cn } from "@/lib/utils";
import { segmentarLinks } from "@/lib/email/format";

export interface TextoComLinksProps {
    texto: string;
    className?: string;
}

/**
 * Texto de e-mail com as URLs clicáveis.
 *
 * Monta nós React a partir dos segmentos, em vez de injetar HTML: o corpo vem
 * de fora (é a escola que escreve), então nada que ela mandar pode virar
 * marcação. Por isso o corpo é reduzido a texto na ingestão — e por isso o
 * link precisa ser reconstruído aqui.
 *
 * Serve aos dois lados da conversa e ao trecho citado, pra o link se comportar
 * igual em qualquer balão.
 */
export function TextoComLinks({ texto, className }: TextoComLinksProps) {
    const segmentos = segmentarLinks(texto);

    return (
        <p className={cn("whitespace-pre-wrap break-words", className)}>
            {segmentos.map((seg, i) =>
                seg.tipo === "link" ? (
                    <a
                        key={i}
                        href={seg.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        // URL de Docs é enorme: sem o break-all ela empurra a
                        // largura do balão e estoura o painel.
                        className="break-all text-brand-500 underline underline-offset-2 hover:text-brand-600 dark:text-brand-400 dark:hover:text-brand-300"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {seg.valor}
                    </a>
                ) : (
                    <span key={i}>{seg.valor}</span>
                ),
            )}
        </p>
    );
}
