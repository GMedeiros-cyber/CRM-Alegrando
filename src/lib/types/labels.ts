export const LABEL_COLORS = [
    "slate", "red", "orange", "amber",
    "green", "blue", "violet", "pink",
] as const;
export type LabelColor = typeof LABEL_COLORS[number];

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

// Mapa de cor → classes Tailwind para badges e pills (claro/escuro).
// Strings literais explícitas garantem que o JIT do Tailwind v4 detecte cada
// utilitário em build (varredura de conteúdo).
export const LABEL_COLOR_CLASSES: Record<LabelColor, {
    bg: string;
    text: string;
    border: string;
    dotBg: string;
}> = {
    slate:  { bg: "bg-slate-200 dark:bg-slate-500/20",   text: "text-slate-800 dark:text-slate-300",   border: "border-slate-400 dark:border-slate-500/40",   dotBg: "bg-slate-500" },
    red:    { bg: "bg-red-200 dark:bg-red-500/20",       text: "text-red-800 dark:text-red-300",       border: "border-red-400 dark:border-red-500/40",       dotBg: "bg-red-500" },
    orange: { bg: "bg-orange-200 dark:bg-orange-500/20", text: "text-orange-800 dark:text-orange-300", border: "border-orange-400 dark:border-orange-500/40", dotBg: "bg-orange-500" },
    amber:  { bg: "bg-amber-200 dark:bg-amber-500/20",   text: "text-amber-800 dark:text-amber-300",   border: "border-amber-400 dark:border-amber-500/40",   dotBg: "bg-amber-500" },
    green:  { bg: "bg-green-200 dark:bg-green-500/20",   text: "text-green-800 dark:text-green-300",   border: "border-green-400 dark:border-green-500/40",   dotBg: "bg-green-500" },
    blue:   { bg: "bg-blue-200 dark:bg-blue-500/20",     text: "text-blue-800 dark:text-blue-300",     border: "border-blue-400 dark:border-blue-500/40",     dotBg: "bg-blue-500" },
    violet: { bg: "bg-violet-200 dark:bg-violet-500/20", text: "text-violet-800 dark:text-violet-300", border: "border-violet-400 dark:border-violet-500/40", dotBg: "bg-violet-500" },
    pink:   { bg: "bg-pink-200 dark:bg-pink-500/20",     text: "text-pink-800 dark:text-pink-300",     border: "border-pink-400 dark:border-pink-500/40",     dotBg: "bg-pink-500" },
};

export const LABEL_COLOR_LABELS_PT: Record<LabelColor, string> = {
    slate:  "Cinza",
    red:    "Vermelho",
    orange: "Laranja",
    amber:  "Âmbar",
    green:  "Verde",
    blue:   "Azul",
    violet: "Violeta",
    pink:   "Rosa",
};
