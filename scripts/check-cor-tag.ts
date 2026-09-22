/**
 * Check do contraste automático das tags (lib/types/labels.ts). Roda com:
 *   npx tsx scripts/check-cor-tag.ts
 * Falha = tag que some (texto claro em fundo claro ou o inverso).
 */
import assert from "node:assert/strict";
import { LABEL_PRESETS, contraste, luminancia, normalizarHex, paresDeContraste, textoEscuroSobre } from "../src/lib/types/labels";

// Amarelo claro (o exemplo da decisão) → texto escuro.
assert.equal(textoEscuroSobre("#fff59d"), true);
// Os 8 presets são pastéis → todos com texto escuro, como as tags antigas.
for (const p of LABEL_PRESETS) assert.equal(textoEscuroSobre(p.hex), true, p.nome);
// Cores saturadas/escuras → texto claro.
for (const hex of ["#1e3a8a", "#7f1d1d", "#000000", "#4c1d95", "#b91c1c"]) assert.equal(textoEscuroSobre(hex), false, hex);
// Branco e preto nos extremos.
assert.equal(luminancia("#ffffff").toFixed(3), "1.000");
assert.equal(luminancia("#000000"), 0);

// Contraste WCAG com o texto REAL, nos DOIS temas, numa varredura do cubo RGB.
// No claro o piso teórico é ~4,3:1 (fundo cinza médio: nenhum texto faz
// melhor). No escuro o fundo efetivo é hex a 22% sobre #0f1829 — sempre
// escuro —, então o piso é mais alto.
const pior = { claro: [Infinity, ""] as [number, string], escuro: [Infinity, ""] as [number, string] };
for (let r = 0; r < 256; r += 17) for (let g = 0; g < 256; g += 17) for (let b = 0; b < 256; b += 17) {
    const hex = "#" + [r, g, b].map(c => c.toString(16).padStart(2, "0")).join("");
    const pares = paresDeContraste(hex);
    for (const tema of ["claro", "escuro"] as const) {
        const [fundo, texto] = pares[tema];
        const c = contraste(luminancia(fundo), luminancia(texto));
        if (c < pior[tema][0]) pior[tema] = [c, hex];
    }
}
assert.ok(pior.claro[0] >= 4.3, `claro: pior contraste ${pior.claro[0].toFixed(2)} em ${pior.claro[1]} < 4.3`);
assert.ok(pior.escuro[0] >= 4.5, `escuro: pior contraste ${pior.escuro[0].toFixed(2)} em ${pior.escuro[1]} < 4.5`);
// Pastéis (o caso real das tags): folgados no claro; no escuro a garantia é a
// da WCAG — o design antigo (text-300 sobre 500/20) também não passava de 7 no
// vermelho, então exigir mais seria inventar régua.
for (const p of LABEL_PRESETS) {
    const pares = paresDeContraste(p.hex);
    assert.ok(contraste(luminancia(pares.claro[0]), luminancia(pares.claro[1])) >= 7, `${p.nome} claro`);
    assert.ok(contraste(luminancia(pares.escuro[0]), luminancia(pares.escuro[1])) >= 4.5, `${p.nome} escuro`);
}

// Normalização.
assert.equal(normalizarHex(" #ABCDEF "), "#abcdef");
assert.equal(normalizarHex("abcdef"), "#abcdef");
assert.equal(normalizarHex("#abc"), null);
assert.equal(normalizarHex("red"), null);

console.log(`ok — contraste de tag: claro ${pior.claro[0].toFixed(2)}:1 em ${pior.claro[1]} · escuro ${pior.escuro[0].toFixed(2)}:1 em ${pior.escuro[1]}`);
