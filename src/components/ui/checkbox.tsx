"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Checkbox com a cor da marca em todos os estados.
 *
 * O `<input type="checkbox">` nativo só aceita `accent-color`, que tinge
 * apenas o preenchimento quando marcado — a borda do estado desmarcado e o
 * anel de foco continuam sendo os do navegador (azul no Chrome, e ainda mais
 * evidente com `color-scheme: dark`). Por isso aqui o input recebe
 * `appearance-none` e a caixa é desenhada por nós.
 *
 * Continua sendo um input nativo: mantém semântica, teclado, `disabled` e
 * participação em formulário.
 */
export function Checkbox({
    className,
    ...props
}: React.ComponentProps<"input">) {
    return (
        <span className={cn("relative inline-flex shrink-0", className)}>
            <input
                type="checkbox"
                className={cn(
                    "peer h-4 w-4 cursor-pointer appearance-none rounded-[4px] border-2 transition-colors",
                    "border-[#A5B4FC] bg-white dark:border-[#4a5568] dark:bg-[#1e2536]",
                    "checked:border-brand-500 checked:bg-brand-500",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40",
                    "disabled:cursor-not-allowed disabled:opacity-40",
                )}
                {...props}
            />
            <Check
                className="pointer-events-none absolute inset-0 m-auto h-3 w-3 text-white opacity-0 peer-checked:opacity-100"
                strokeWidth={3.5}
                aria-hidden
            />
        </span>
    );
}
