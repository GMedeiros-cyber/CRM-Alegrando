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
