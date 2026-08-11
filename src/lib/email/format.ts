/**
 * Helpers puros do envio de e-mail (usados no cliente e no servidor).
 */

import { EMAIL_FIELD_ORDER, type EmailFieldKey } from "@/lib/types/email";

// Validação deliberadamente simples: pega erro de digitação (falta de @, espaço,
// domínio sem ponto) sem tentar implementar a RFC 5322 inteira.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(value: string): boolean {
    return EMAIL_RE.test(value.trim());
}

const HTML_ESCAPES: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
};

/**
 * Converte o texto simples digitado pela equipe em HTML mínimo pro Gmail.
 *
 * O n8n não processa nada — manda o `body` cru como HTML. Então a conversão
 * precisa garantir que (a) nada que ela digitou vire tag e (b) as quebras de
 * linha sobrevivam.
 *
 * Linha em branco separa parágrafo (`<p>`), quebra simples vira `<br>`.
 */
export function plainTextToHtml(text: string): string {
    const escaped = text.replace(/[&<>"]/g, (c) => HTML_ESCAPES[c]);

    return escaped
        .split(/\n{2,}/)
        .map((block) => block.trim())
        .filter((block) => block.length > 0)
        .map((block) => `<p>${block.replace(/\n/g, "<br>")}</p>`)
        .join("\n");
}

const ENTIDADES: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
    "&nbsp;": " ",
};

/**
 * Reduz o HTML de uma resposta a texto puro.
 *
 * O corpo de uma resposta vem de FORA — é a escola que escreve. Renderizar
 * esse HTML no painel abriria uma porta de XSS por um caminho que não
 * controlamos, então o CRM mostra sempre o texto. `body_text` costuma existir
 * (todo cliente decente manda multipart), e isto aqui é o plano B.
 */
export function htmlParaTexto(html: string): string {
    return html
        .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&[a-z#0-9]+;/gi, (e) => ENTIDADES[e.toLowerCase()] ?? e)
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

/**
 * Marcadores do começo do histórico citado, aplicados sobre o texto inteiro.
 *
 * O primeiro aceita a linha de atribuição QUEBRADA. O Gmail enrola o corpo em
 * 78 colunas, então na prática ela chega assim:
 *
 *   Em ter., 11 de ago. de 2026 às 00:01, Silvana Gomes Moura <
 *   contato@alegrando.com.br> escreveu:
 *
 * Procurar "escreveu:" no fim da MESMA linha que começa com "Em" não acha
 * nada aí — era por isso que a atribuição sobrevivia ao corte e o histórico
 * do lead virava um paredão.
 */
const MARCADORES_CITACAO: RegExp[] = [
    /^[ \t]*(?:Em|On)\b[\s\S]{0,400}?\b(?:escreveu|wrote):[ \t]*\r?$/m,
    /^[ \t]*-{2,}\s*(?:Mensagem original|Mensagem encaminhada|Original Message|Forwarded message)/im,
    /^[ \t]*>/m,
];

/**
 * Separa o que a pessoa escreveu do histórico citado abaixo.
 *
 * Toda resposta arrasta a conversa inteira colada no fim, e isso piora a cada
 * troca: na terceira resposta o corpo carrega as duas anteriores aninhadas.
 *
 * Conservador de propósito: sem marcador reconhecido — ou com marcador logo no
 * caractere zero, que deixaria a resposta vazia — devolve o texto inteiro.
 * Citação a mais é bem menos ruim que resposta sumida.
 */
export function separarCitacao(texto: string): { principal: string; citacao: string } {
    let corte = -1;
    for (const marcador of MARCADORES_CITACAO) {
        const achado = marcador.exec(texto);
        if (achado && (corte === -1 || achado.index < corte)) corte = achado.index;
    }

    if (corte <= 0) return { principal: texto.trim(), citacao: "" };

    return {
        principal: texto.slice(0, corte).trim(),
        citacao: texto.slice(corte).trim(),
    };
}

/**
 * Corta o bloco citado do HTML antes de virar texto.
 *
 * É o caminho mais confiável quando o e-mail veio em HTML: o Gmail marca a
 * citação com `gmail_quote`, então não há adivinhação de marcador nenhuma.
 */
export function removerCitacaoHtml(html: string): string {
    const marcador = /<(?:div|blockquote)[^>]*class="[^"]*gmail_quote/i;
    const achado = marcador.exec(html);
    return achado && achado.index > 0 ? html.slice(0, achado.index) : html;
}

/** As colunas de e-mail de `Clientes _WhatsApp`, como vêm do Supabase. */
export type LeadEmailColumns = Record<EmailFieldKey, string | null>;

/** Extrai só os endereços preenchidos e com formato válido, por tipo. */
export function extractEmails(
    row: Partial<LeadEmailColumns>,
): Partial<Record<EmailFieldKey, string>> {
    const out: Partial<Record<EmailFieldKey, string>> = {};
    for (const key of EMAIL_FIELD_ORDER) {
        const raw = row[key];
        if (typeof raw !== "string") continue;
        const value = raw.trim();
        if (value && isValidEmail(value)) out[key] = value;
    }
    return out;
}

/**
 * Endereços de um lead para os tipos escolhidos, deduplicados.
 * O mesmo endereço pode estar em dois campos (ex: coordenadora == diretora).
 */
export function pickEmails(
    emails: Partial<Record<EmailFieldKey, string>>,
    fields: EmailFieldKey[],
): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const key of EMAIL_FIELD_ORDER) {
        if (!fields.includes(key)) continue;
        const value = emails[key];
        if (!value) continue;
        const dedupeKey = value.toLowerCase();
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        out.push(value);
    }
    return out;
}
