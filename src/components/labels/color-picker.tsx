"use client";

import { HexColorInput, HexColorPicker } from "react-colorful";
import { cn } from "@/lib/utils";
import { LABEL_PRESETS, TAG_CLASSES, estiloTag, normalizarHex } from "@/lib/types/labels";

/**
 * Seletor de cor da tag: os 8 presets (a cara das tags antigas), o picker
 * livre do react-colorful e o campo hex. A prévia usa `estiloTag`, então o
 * que se vê aqui é exatamente o badge — com o texto já no contraste certo.
 *
 * É o MESMO componente no picker de cada lead e no modal "Criar tag": dois
 * caminhos com modelos de cor diferentes é como nasce inconsistência.
 */
export function ColorPicker({ value, onChange, nomePrevia, compact = false }: {
    value: string;
    onChange: (hex: string) => void;
    /** Nome mostrado na prévia; vazio mostra "Tag". */
    nomePrevia?: string;
    /** Popover apertado (picker do lead): área de cor menor. */
    compact?: boolean;
}) {
    const atual = normalizarHex(value) ?? value;
    return (
        <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Cores sugeridas">
                {LABEL_PRESETS.map((p) => (
                    <button
                        key={p.hex}
                        type="button"
                        role="radio"
                        aria-checked={atual === p.hex}
                        aria-label={p.nome}
                        title={p.nome}
                        onClick={() => onChange(p.hex)}
                        style={{ backgroundColor: p.hex }}
                        className={cn(
                            "w-6 h-6 rounded-full border-2 transition-transform",
                            atual === p.hex ? "border-foreground scale-110" : "border-black/10 dark:border-white/20 hover:scale-105",
                        )}
                    />
                ))}
            </div>
            {/* Tamanho via `style` do próprio componente: a folha do react-colorful
                fixa 200×200 e a classe de arbitrary-variant não passou por cima. */}
            <HexColorPicker color={atual} onChange={onChange} style={{ width: "100%", height: compact ? 96 : 128 }} />
            <div className="flex items-center gap-2">
                <span className="text-[11px] text-[#6366F1] dark:text-[#94a3b8]">Hex</span>
                <HexColorInput
                    color={atual}
                    onChange={onChange}
                    prefixed
                    aria-label="Cor em hexadecimal"
                    className="w-24 px-2 py-1 rounded-md text-[12px] font-mono bg-[#F7F7F5] dark:bg-[#0f1829] border border-[#A5B4FC] dark:border-[#4a5568] text-[#191918] dark:text-white"
                />
                <span
                    style={estiloTag(atual)}
                    className={cn(TAG_CLASSES, "inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase truncate max-w-[140px]")}
                >
                    {nomePrevia?.trim() || "Tag"}
                </span>
            </div>
        </div>
    );
}
