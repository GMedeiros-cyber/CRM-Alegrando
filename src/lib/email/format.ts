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
 * Separa o que a pessoa escreveu do histórico citado abaixo.
 *
 * Toda resposta de e-mail arrasta a conversa inteira colada no fim. Sem essa
 * separação, ler uma resposta de duas linhas exige rolar por tudo que já foi
 * dito. Conservador de propósito: sem marcador reconhecido, nada é escondido.
 */
export function separarCitacao(texto: string): { principal: string; citacao: string } {
    const linhas = texto.split("\n");

    // "Em 10 de ago. de 2026 ... escreveu:" / "On ... wrote:" / "> ..."
    const marcador = /^\s*(?:>|(?:Em|On)\s.+\s(?:escreveu|wrote):\s*$|-{2,}\s*Mensagem (?:original|encaminhada))/i;

    const corte = linhas.findIndex((linha) => marcador.test(linha));
    if (corte <= 0) return { principal: texto, citacao: "" };

    return {
        principal: linhas.slice(0, corte).join("\n").trim(),
        citacao: linhas.slice(corte).join("\n").trim(),
    };
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
