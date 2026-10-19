/**
 * Placeholders das mensagens editáveis em Configurações: catálogo, prévia e
 * validação. Puro — o `EditorMensagem` usa, e o teste cobre sem navegador.
 *
 * O texto gravado continua sendo texto puro (`Olá {nome}!`): nada muda no
 * formato do banco nem em `applyPlaceholders`, que segue aceitando `{x}` e
 * `{{x}}`. Por isso a prévia também reconhece as duas formas.
 */

import { applyPlaceholders, type VarsPlaceholder } from "./settings_helper";

export type Placeholder = { chave: string; rotulo: string; exemplo: string };

/** As mensagens automáticas editáveis em Modelos › Mensagens. */
export const CHAVES_MENSAGEM = [
    "aniversario_mensagem",
    "followup_mensagem",
    "avaliacao_mensagem",
    "pos_passeio_mensagem",
] as const;
export type ChaveMensagem = (typeof CHAVES_MENSAGEM)[number];

/**
 * O mesmo fallback do envio (`process.env.GOOGLE_REVIEW_LINK || ...` no cron e
 * em `sendManualFollowup`). Quem tem o env passa o valor real para a prévia.
 */
export const LINK_GOOGLE_PADRAO = "https://g.page/alegrando";

/**
 * Catálogo de cada mensagem = o que o código de envio DELA preenche (medido em
 * 19/10/2026), não o que a tela gostaria:
 * - aniversário: `{ nome }` — o disparo (ainda fora do ar) só passa o nome;
 * - follow-up e avaliação: `{ nome, link_google }` — cron e envio manual
 *   passam os dois aos dois textos;
 * - pós-passeio: `{ nome, link }` — o link colado no painel na hora do envio.
 */
export function catalogoDaMensagem(chave: ChaveMensagem, linkGoogle: string = LINK_GOOGLE_PADRAO): Placeholder[] {
    const nomeLead: Placeholder = { chave: "nome", rotulo: "Nome", exemplo: "Escola Monte Verde" };
    switch (chave) {
        case "aniversario_mensagem":
            return [{ chave: "nome", rotulo: "Nome", exemplo: "Maria Fernanda Souza" }];
        case "followup_mensagem":
        case "avaliacao_mensagem":
            return [nomeLead, { chave: "link_google", rotulo: "Link de avaliação no Google", exemplo: linkGoogle }];
        case "pos_passeio_mensagem":
            return [nomeLead, { chave: "link", rotulo: "Link colado no envio", exemplo: "https://drive.google.com/drive/folders/exemplo" }];
    }
}

/**
 * Validação do lado do servidor (`updateSetting`): só para as mensagens.
 * `null` = pode gravar. Outras chaves de `crm_settings` passam direto.
 */
export function validarSetting(chave: string, valor: string): string | null {
    if (!(CHAVES_MENSAGEM as readonly string[]).includes(chave)) return null;
    return validarMensagem(valor, catalogoDaMensagem(chave as ChaveMensagem));
}

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

/**
 * A prévia passa pela MESMA função do envio (`applyPlaceholders`), com os
 * exemplos do catálogo no lugar dos valores reais — o que aparece no balão é
 * o que sairia. O que sobra entre chaves é o que o envio mandaria literal ao
 * cliente, e vem marcado.
 */
export function previaDaMensagem(texto: string, catalogo: Placeholder[]): ParteMensagem[] {
    const exemplos = Object.fromEntries(catalogo.map((p) => [p.chave, p.exemplo])) as VarsPlaceholder;
    return partesDaMensagem(applyPlaceholders(texto, exemplos), []);
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
