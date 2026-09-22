/**
 * Redação de dado pessoal antes de ir pro log.
 *
 * Log de servidor não é lugar de PII: ele é lido em painel, aparece em captura
 * de tela e, no dia em que existir um log drain, sai da Vercel para um terceiro.
 * Os telefones daqui são de coordenadoras e diretoras de escola — dado de
 * pessoa, não identificador interno.
 *
 * O sufixo de 4 dígitos é o meio-termo deliberado: sobra o suficiente para
 * correlacionar duas linhas do mesmo atendimento enquanto se depura, e não
 * sobra número para ligar para ninguém.
 */
export function telefoneMascarado(telefone: string | null | undefined): string {
    const digitos = (telefone ?? "").replace(/\D/g, "");
    return digitos.length >= 4 ? `***${digitos.slice(-4)}` : "***";
}

/**
 * Só o host de uma URL, para o log dizer ONDE falhou sem dizer O QUÊ.
 *
 * URL de mídia carrega duas coisas que não podem ir pro log: o endereço do
 * arquivo do lead (o bucket do R2 é público — quem lê o log abre o anexo) e,
 * no caso da CDN do WhatsApp, os parâmetros de autenticação junto.
 */
export function hostDe(url: string | null | undefined): string {
    try {
        return new URL(url ?? "").host;
    } catch {
        return "(url inválida)";
    }
}

// Chaves cujo valor é telefone ou LID (identificador de pessoa no WhatsApp).
const CHAVES_TELEFONE = /(^|_)(phone|lid|reactionBy|participant)$|Phone$|Lid$/i;
// Chaves que podem ficar em claro: dizem O QUE o evento é, não o que foi dito.
const CHAVES_ESTRUTURA = /^(type|status|messageId|mimeType|messageType|broadcast|isGroup|fromMe|fromApi|waitingMessage|isEdit|isNewsletter)$|MessageId$|Id$/;
const CHAVES_LOCALIZACAO = /^(latitude|longitude)$/;
const PROFUNDIDADE_MAX = 8;

/**
 * Redige um payload inteiro preservando a ESTRUTURA: mesmas chaves, mesmos
 * tipos, mesmo aninhamento. Serve para descobrir o formato de um evento (ex.:
 * edição na Z-API) sem guardar o que foi dito nem para quem.
 *
 * Regras, nesta ordem: telefone/LID → máscara; URL → só o host; identificador
 * e enum (`type`, `status`, `*Id`) → em claro; qualquer outra string → só o
 * tamanho; lat/long → apagados; número/booleano/null → em claro.
 *
 * Errar para o lado de redigir demais é barato (perde-se um campo legível);
 * errar para o lado de menos é PII no banco. Por isso string desconhecida vira
 * tamanho, e não o contrário.
 */
export function redigirEstrutura(valor: unknown, chave = "", profundidade = 0): unknown {
    if (profundidade > PROFUNDIDADE_MAX) return "<profundo demais>";
    if (valor === null || valor === undefined) return valor;
    if (typeof valor === "string") {
        if (CHAVES_TELEFONE.test(chave)) return telefoneMascarado(valor);
        if (/^https?:\/\//i.test(valor)) return `<url ${hostDe(valor)}>`;
        if (CHAVES_ESTRUTURA.test(chave)) return valor;
        return `<${valor.length} chars>`;
    }
    if (typeof valor === "number") {
        return CHAVES_LOCALIZACAO.test(chave) ? "<num>" : valor;
    }
    if (typeof valor === "boolean") return valor;
    if (Array.isArray(valor)) {
        return valor.map((v) => redigirEstrutura(v, chave, profundidade + 1));
    }
    if (typeof valor === "object") {
        const saida: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
            saida[k] = redigirEstrutura(v, k, profundidade + 1);
        }
        return saida;
    }
    return `<${typeof valor}>`;
}
