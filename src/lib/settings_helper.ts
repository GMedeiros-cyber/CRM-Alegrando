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

/** Nome do placeholder → valor. `link` é apelido de `link_google`. */
export type VarsPlaceholder = { nome?: string; link_google?: string; link?: string };

// Aceita `{nome}` e `{{nome}}` na mesma passada, com ou sem espaço dentro das
// chaves. Captura o nome do placeholder para decidir item a item.
const PLACEHOLDER = /\{\{?\s*([a-z_]+)\s*\}?\}/gi;

/**
 * Substitui placeholders na mensagem, nas DUAS convenções que convivem no
 * projeto: `{{nome}}` (textos antigos: followup_mensagem, avaliacao_mensagem)
 * e `{nome}` (textos novos: pos_passeio_mensagem, respostas rápidas).
 *
 * Por que as duas: a tela de Configurações documenta `{{nome}}` num campo e
 * `{nome}` noutro. Quem editar um texto seguindo a dica do campo errado
 * escreveria um placeholder que a função não reconhecia — e o cliente
 * receberia `{nome}` literal. Migrar os textos guardados seria risco sem
 * ganho; aceitar as duas formas resolve de um lado só.
 *
 * Placeholder DESCONHECIDO fica como está, intocado — não vira string vazia.
 * Apagar silenciosamente esconderia o erro de digitação; deixar à vista faz
 * quem revisa a mensagem perceber antes de enviar.
 *
 * Substitui TODAS as ocorrências: o `.replace()` com string trocava só a
 * primeira, então um texto com dois `{nome}` saía meio preenchido.
 */
export function applyPlaceholders(template: string, vars: VarsPlaceholder): string {
    // Um link só, dois nomes: tanto faz qual o texto usa e qual quem chama
    // passou. Resolver só num sentido deixava `{{link_google}}` literal
    // quando o chamador mandava `link` — e vice-versa.
    const link = vars.link ?? vars.link_google;
    const valores: Record<string, string | undefined> = {
        nome: vars.nome,
        link_google: link,
        link,
    };
    return template.replace(PLACEHOLDER, (original, chave: string) => {
        const valor = valores[chave.toLowerCase()];
        return valor ? valor : original;
    });
}
