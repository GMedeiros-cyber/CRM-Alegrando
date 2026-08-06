/**
 * Constantes e helpers do editor de e-mail.
 *
 * O corpo viaja como HTML puro até o nó Gmail do n8n, então tudo aqui produz
 * **estilo inline**: cliente de e-mail não aplica <style> externo com
 * confiabilidade nenhuma.
 */

/**
 * As mesmas fontes que o Gmail oferece na composição, com os stacks que ele
 * usa. A lista é curta de propósito — são fontes web-safe, presentes em
 * praticamente todo sistema. Fonte customizada não renderiza na caixa de
 * entrada de quem recebe, cai no fallback.
 */
export const EMAIL_FONTS: { label: string; stack: string }[] = [
    { label: "Sans Serif", stack: "arial, helvetica, sans-serif" },
    { label: "Serif", stack: "georgia, times new roman, serif" },
    { label: "Largura fixa", stack: "'courier new', courier, monospace" },
    { label: "Largo", stack: "'arial black', arial, sans-serif" },
    { label: "Estreito", stack: "'arial narrow', arial, sans-serif" },
    { label: "Comic Sans MS", stack: "'comic sans ms', cursive, sans-serif" },
    { label: "Garamond", stack: "garamond, times new roman, serif" },
    { label: "Georgia", stack: "georgia, times new roman, serif" },
    { label: "Tahoma", stack: "tahoma, verdana, sans-serif" },
    { label: "Trebuchet MS", stack: "'trebuchet ms', helvetica, sans-serif" },
    { label: "Verdana", stack: "verdana, geneva, sans-serif" },
];

/** Tamanhos do Gmail (Pequeno/Normal/Grande/Enorme) em px. */
export const EMAIL_SIZES: { label: string; px: string }[] = [
    { label: "Pequeno", px: "12px" },
    { label: "Normal", px: "14px" },
    { label: "Grande", px: "18px" },
    { label: "Enorme", px: "32px" },
];

/** Paleta de cores de texto — a mesma ideia da grade do Gmail. */
export const EMAIL_COLORS: string[] = [
    "#000000", "#434343", "#666666", "#999999", "#b7b7b7", "#ffffff",
    "#980000", "#ff0000", "#ff9900", "#ffff00", "#00ff00", "#00ffff",
    "#4a86e8", "#0000ff", "#9900ff", "#ff00ff", "#e6b8af", "#d9d2e9",
];

/** Fonte/tamanho padrão do corpo — espelha o default do Gmail. */
export const EMAIL_DEFAULT_FONT = EMAIL_FONTS[0].stack;
export const EMAIL_DEFAULT_SIZE = EMAIL_SIZES[1].px;

/**
 * Limpa o HTML do editor antes de enviar.
 *
 * O contentEditable acumula lixo (spans vazios, atributos do navegador,
 * &nbsp; de sobra). Isso não é sanitização de segurança — o conteúdo vem da
 * própria equipe autenticada, não de terceiro.
 */
export function cleanEditorHtml(html: string): string {
    return html
        // Atributos que só existem pro editor funcionar.
        .replace(/\s(?:contenteditable|data-slot|spellcheck)="[^"]*"/gi, "")
        // <span> sem estilo nenhum não agrega nada ao e-mail.
        .replace(/<span>([\s\S]*?)<\/span>/gi, "$1")
        .replace(/<div><br><\/div>/gi, "<br>")
        .trim();
}

/** true quando o editor está visualmente vazio (só tags de estrutura). */
export function isEditorEmpty(html: string): boolean {
    return (
        html
            .replace(/<[^>]*>/g, "")
            .replace(/&nbsp;/gi, " ")
            .trim().length === 0
    );
}

/**
 * Envelopa o corpo com a fonte base, pra mensagem chegar com a mesma cara em
 * qualquer cliente (Outlook herda de <body>, Gmail não).
 */
export function wrapEmailHtml(inner: string): string {
    return `<div style="font-family:${EMAIL_DEFAULT_FONT};font-size:${EMAIL_DEFAULT_SIZE};color:#222222;line-height:1.5">${inner}</div>`;
}
