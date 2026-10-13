/**
 * Placeholders das mensagens editáveis em Configurações: catálogo, prévia e
 * validação. Puro — o `EditorMensagem` usa, e o teste cobre sem navegador.
 *
 * O texto gravado continua sendo texto puro (`Olá {nome}!`): nada muda no
 * formato do banco nem em `applyPlaceholders`, que segue aceitando `{x}` e
 * `{{x}}`. Por isso a prévia também reconhece as duas formas.
 */

export type Placeholder = { chave: string; rotulo: string; exemplo: string };

/** Catálogo da mensagem de aniversário: só o nome de quem faz aniversário. */
export const PLACEHOLDERS_ANIVERSARIO: Placeholder[] = [
    { chave: "nome", rotulo: "Nome", exemplo: "Maria Fernanda Souza" },
];

export type ParteMensagem =
    | { tipo: "texto"; valor: string }
    | { tipo: "placeholder"; valor: string; original: string }
    | { tipo: "desconhecido"; valor: string };

// Qualquer coisa entre chaves, simples ou duplas — não só [a-z_]: `{escola 2}`
// também é placeholder que o envio não sabe preencher e não pode passar.
const ENTRE_CHAVES = /\{\{?([^{}]*)\}?\}/g;

const chaveDe = (bruto: string) => bruto.trim().toLowerCase();

/** O texto em pedaços, para a prévia: conhecido vira o exemplo, desconhecido fica marcado. */
export function partesDaMensagem(texto: string, catalogo: Placeholder[]): ParteMensagem[] {
    const partes: ParteMensagem[] = [];
    let desde = 0;
    for (const m of texto.matchAll(ENTRE_CHAVES)) {
        if (m.index > desde) partes.push({ tipo: "texto", valor: texto.slice(desde, m.index) });
        const p = catalogo.find((c) => c.chave === chaveDe(m[1]));
        partes.push(p ? { tipo: "placeholder", valor: p.exemplo, original: m[0] } : { tipo: "desconhecido", valor: m[0] });
        desde = m.index + m[0].length;
    }
    if (desde < texto.length) partes.push({ tipo: "texto", valor: texto.slice(desde) });
    return partes;
}

/** `null` se pode salvar; senão, o aviso que diz o que corrigir. */
export function validarMensagem(texto: string, catalogo: Placeholder[]): string | null {
    if (!texto.trim()) return "Escreva a mensagem antes de salvar.";
    const desconhecidos = [...new Set(
        partesDaMensagem(texto, catalogo).filter((p) => p.tipo === "desconhecido").map((p) => p.valor),
    )];
    if (!desconhecidos.length) return null;
    const validos = catalogo.map((c) => `{${c.chave}}`).join(", ");
    return `Não reconheço ${desconhecidos.join(", ")}. Use ${validos}.`;
}

/** Troca a seleção [inicio, fim) pelo bloco e devolve onde o cursor fica. */
export function inserirNoCursor(texto: string, inicio: number, fim: number, bloco: string) {
    return { texto: texto.slice(0, inicio) + bloco + texto.slice(fim), cursor: inicio + bloco.length };
}
