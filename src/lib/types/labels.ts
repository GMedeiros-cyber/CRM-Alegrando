/**
 * Cor da tag = hex livre ('#rrggbb', minúsculo). Decisão de 22/09/2026:
 * substituiu os 8 nomes (`slate|red|…`) — manter os dois modelos dobraria o
 * render para sempre. As 16 tags existentes foram convertidas para o tom que
 * já aparecia na tela (o *-200 do Tailwind v4), ver migration_labels_cor_hex.sql.
 */
export type LabelColor = string;

/** Os 8 tons de antes, agora como presets do seletor. Mesma cara das tags antigas. */
export const LABEL_PRESETS: ReadonlyArray<{ hex: string; nome: string }> = [
    { hex: "#e2e8f0", nome: "Cinza" },
    { hex: "#ffc9c9", nome: "Vermelho" },
    { hex: "#ffd6a7", nome: "Laranja" },
    { hex: "#fee685", nome: "Âmbar" },
    { hex: "#b9f8cf", nome: "Verde" },
    { hex: "#bedbff", nome: "Azul" },
    { hex: "#ddd6ff", nome: "Violeta" },
    { hex: "#fccee8", nome: "Rosa" },
];

export const COR_TAG_PADRAO = "#bedbff";
export const HEX_RE = /^#[0-9a-f]{6}$/;

export interface Label {
    id: string;
    name: string;
    color: LabelColor;
    createdAt: Date;
    updatedAt: Date;
}

export interface LeadLabel {
    id: string;
    name: string;
    color: LabelColor;
}

/** Normaliza para '#rrggbb' minúsculo; `null` se não for hex de 6 dígitos (aceita sem '#'). */
export function normalizarHex(valor: string): string | null {
    const v = valor.trim().toLowerCase();
    const hex = v.startsWith("#") ? v : `#${v}`;
    return HEX_RE.test(hex) ? hex : null;
}

/** Luminância relativa (WCAG 2.x), 0 = preto, 1 = branco. */
export function luminancia(hex: string): number {
    const n = parseInt(hex.slice(1), 16);
    const canal = (c: number) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255);
}

/** Contraste WCAG entre duas luminâncias (1 = igual, 21 = preto/branco). */
export function contraste(l1: number, l2: number): number {
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** Mistura dois hex nos canais sRGB (o que `color-mix(in srgb)` faz), peso de `b` em [0,1]. */
function misturar(a: string, b: string, pesoB: number): string {
    const na = parseInt(a.slice(1), 16), nb = parseInt(b.slice(1), 16);
    const canal = (shift: number) => Math.round(((na >> shift) & 255) * (1 - pesoB) + ((nb >> shift) & 255) * pesoB);
    return "#" + [16, 8, 0].map(sh => canal(sh).toString(16).padStart(2, "0")).join("");
}

const TEXTO_ESCURO = "#111111";
const TEXTO_CLARO = "#ffffff";

/**
 * Cor do texto legível sobre o fundo: preto ou branco, o que der MAIS
 * contraste (corte fixo de luminância falha nos tons médios — medido no
 * check: 2,1:1). Depois tinge 12% com a própria cor, para "combinar" como o
 * text-<cor>-800 combinava, mas só se o contraste continuar ≥ 4,5; senão o
 * texto fica puro. Piso teórico num fundo cinza médio é ~4,3:1 — é o máximo
 * que QUALQUER texto alcança ali, e o check garante que não se fica abaixo.
 */
export function corTextoSobre(hex: string): string {
    const cor = normalizarHex(hex) ?? COR_TAG_PADRAO;
    const lf = luminancia(cor);
    const base = contraste(lf, luminancia(TEXTO_ESCURO)) >= contraste(lf, luminancia(TEXTO_CLARO)) ? TEXTO_ESCURO : TEXTO_CLARO;
    const tingido = misturar(base, cor, 0.12);
    return contraste(lf, luminancia(tingido)) >= 4.5 ? tingido : base;
}

/** Só para o check e para quem precisa da decisão binária. */
export function textoEscuroSobre(hex: string): boolean {
    return luminancia(corTextoSobre(hex)) < 0.5;
}

/** Hex → HSL (h em graus, s/l em [0,1]) e volta. Só para recolorir mantendo o matiz. */
function hexParaHsl(hex: string): [number, number, number] {
    const n = parseInt(hex.slice(1), 16);
    const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, sat, l];
}
function hslParaHex(h: number, sat: number, l: number): string {
    const f = (n: number) => {
        const k = (n + h / 30) % 12;
        const a = sat * Math.min(l, 1 - l);
        return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255).toString(16).padStart(2, "0");
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

/** Fundo do tema escuro (globals.css `[data-theme="dark"] --background`). */
const FUNDO_ESCURO = "#0f1829";
const ALFA_ESCURO = 0.20;

/**
 * As variáveis do badge para os DOIS temas, decididas pela cor, não pelo tema
 * em runtime: o componente usa `TAG_CLASSES` (`bg-[var(--tag-bg)] dark:bg-[var(--tag-bg-escuro)]` …)
 * e o CSS troca sozinho.
 *
 * Claro: fundo = hex sólido, texto = preto/branco pelo maior contraste,
 * tingido 12% (a fórmula do `bg-200` + `text-800` de antes).
 *
 * Escuro (medido em 22/09/2026 com as 16 tags reais): hex SÓLIDO vira bloco —
 * sete pêssegos dominavam a lista. Então: fundo = hex a 20% de alfa (a "tinta"
 * de antes), texto e ponto = MESMO MATIZ, saturados (o `text-300`/ponto `500`
 * de antes), e o contraste é conferido sobre a cor RESULTANTE da mistura com o
 * fundo da UI; se o matiz saturado não chega a 4,5:1, cai para preto/branco.
 */
export function estiloTag(hex: string): Record<`--tag-${string}`, string> {
    const cor = normalizarHex(hex) ?? COR_TAG_PADRAO;
    const textoClaro = corTextoSobre(cor);

    const [h, sat] = hexParaHsl(cor);
    // Cinza continua cinza: só se satura o que já tem matiz (o check pegou um
    // "Cinza" de saturação 0,33 virando azul). L 0,82 no texto é o peso do
    // text-<cor>-300 de antes.
    const temMatiz = sat >= 0.4;
    const matizForte = hslParaHex(h, temMatiz ? Math.max(sat, 0.75) : sat, 0.82);
    const pontoEscuro = hslParaHex(h, temMatiz ? Math.max(sat, 0.85) : sat, 0.56);
    // O fundo do escuro é o PONTO (o "500" da cor) a 20%, não o pastel: pastel
    // a 20% sobre azul-escuro vira cinza, e a tinta de antes era bg-<cor>-500/20.
    const resultante = misturar(FUNDO_ESCURO, pontoEscuro, ALFA_ESCURO);
    const textoEscuro = contraste(luminancia(resultante), luminancia(matizForte)) >= 4.5
        ? matizForte
        : corTextoSobre(resultante);

    return {
        "--tag-bg": cor,
        "--tag-fg": textoClaro,
        "--tag-bd": `${textoClaro}59`,
        "--tag-dot": textoClaro,
        "--tag-bg-escuro": `${pontoEscuro}${Math.round(ALFA_ESCURO * 255).toString(16).padStart(2, "0")}`,
        "--tag-fg-escuro": textoEscuro,
        "--tag-bd-escuro": `${pontoEscuro}66`,
        "--tag-dot-escuro": pontoEscuro,
    };
}

/** Classes que leem as variáveis de `estiloTag`. Literais, para o JIT do Tailwind enxergar. */
export const TAG_CLASSES = "bg-[var(--tag-bg)] text-[var(--tag-fg)] border-[var(--tag-bd)] dark:bg-[var(--tag-bg-escuro)] dark:text-[var(--tag-fg-escuro)] dark:border-[var(--tag-bd-escuro)]";
export const TAG_DOT_CLASSES = "bg-[var(--tag-dot)] dark:bg-[var(--tag-dot-escuro)]";

/** Só para o check: cores efetivas de fundo e texto em cada tema. */
export function paresDeContraste(hex: string): { claro: [string, string]; escuro: [string, string] } {
    const v = estiloTag(hex);
    return {
        claro: [v["--tag-bg"], v["--tag-fg"]],
        escuro: [misturar(FUNDO_ESCURO, v["--tag-dot-escuro"], ALFA_ESCURO), v["--tag-fg-escuro"]],
    };
}
