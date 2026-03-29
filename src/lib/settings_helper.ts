// =============================================
// DEFAULTS E HELPERS DE CONFIGURAÇÕES
// (Sem "use server" para permitir exportação livre)
// =============================================

export const SETTING_DEFAULTS: Record<string, string> = {
    followup_mensagem:
        "Olá {{nome}}! 🌟\n\nO nosso último passeio foi incrível né? As crianças adoraram!\n\nQue tal já começarmos a planejar a próxima aventura? Temos destinos incríveis esperando pelos pequenos. 🚌\n\nSe quiser, a gente monta um novo roteiro — é só falar! 😊",
    pos_passeio_mensagem:
        "Olá {nome}! 🎉 Foi um prazer ter você no passeio! Caso queira ver as fotos ou deixar uma avaliação, o link está aqui: {link}",
    avaliacao_mensagem:
        "Olá {{nome}}! 😊\n\nEsperamos que o passeio tenha sido incrível para todos!\n\nSe puder, deixa uma avaliação pra gente no Google — ajuda muito a Alegrando a levar mais crianças a experiências incríveis! 🌟\n\n{{link_google}}",
};

/**
 * Substitui placeholders na mensagem:
 *   {{nome}} → nome do cliente
 *   {{link_google}} → link de avaliação Google
 */
export function applyPlaceholders(
    template: string,
    vars: { nome?: string; link_google?: string }
): string {
    let result = template;
    if (vars.nome) result = result.replace(/\{\{nome\}\}/g, vars.nome);
    if (vars.link_google)
        result = result.replace(/\{\{link_google\}\}/g, vars.link_google);
    return result;
}
