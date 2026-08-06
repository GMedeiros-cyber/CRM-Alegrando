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
