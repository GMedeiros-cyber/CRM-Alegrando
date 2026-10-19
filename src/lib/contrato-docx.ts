/**
 * Contrato em Word (.docx) a partir do modelo guardado no bucket `modelos`.
 *
 * O modelo é um .docx comum com campos `{chave}` (padrão do docxtemplater).
 * Campo vazio vira marcador visível pela seção invertida que o PRÓPRIO modelo
 * traz — `{#cnpj}{cnpj}{/cnpj}{^cnpj}[PREENCHER CNPJ]{/cnpj}`, com o marcador
 * grifado de amarelo no Word —, então quem edita o modelo decide o texto do
 * marcador, não este código.
 *
 * Nunca `{@raw}`: valor de lead inserido como XML é injeção no documento.
 * Os campos simples são escapados pelo docxtemplater (`&`, `<`, aspas).
 */
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { isoParaTexto } from "./data-aniversario";
import { dataPorExtensoEmSaoPaulo } from "./hora-sao-paulo";
import { CAMPOS_CONTRATO } from "./contrato-campos";
import { formatarMoedaBR } from "./numero-br";

export { CAMPOS_CONTRATO, LIMITE_MODELO_BYTES } from "./contrato-campos";
const CHAVES = new Set(CAMPOS_CONTRATO.map((c) => c.chave));

export type LeadParaContrato = {
    nome: string | null;
    cnpj: string | null;
    endereco: string | null;
    responsavel: string | null;
    diretora_nome: string | null;
    coordenadora_nome: string | null;
};

export type ContratoParaDocx = {
    data_passeio: string | null;
    destino: string | null;
    qtd_alunos: number | null;
    qtd_professores: number | null;
    valor_por_aluno: number | null;
    valor_total: number | null;
    forma_pagamento: string | null;
    observacoes: string | null;
};

const texto = (v: string | null | undefined) => (v ?? "").trim();

/** Quem assina pela escola: responsável → diretora → coordenadora, o primeiro preenchido. */
export function representanteEscola(lead: LeadParaContrato): string {
    return [lead.responsavel, lead.diretora_nome, lead.coordenadora_nome].map(texto).find(Boolean) ?? "";
}

/** "R$ 3.420,00"; vazio quando não há valor. */
export function moedaBRL(v: number | null): string {
    return v === null || v === undefined ? "" : formatarMoedaBR(v);
}

/** Os valores do modelo. Todo campo vai como string — vazio ("") liga o marcador. */
export function dadosDoContrato(lead: LeadParaContrato, c: ContratoParaDocx, agora: Date): Record<string, string> {
    const numero = (n: number | null) => (n === null || n === undefined ? "" : String(n));
    return {
        escola: texto(lead.nome),
        cnpj: texto(lead.cnpj),
        endereco: texto(lead.endereco),
        representante_escola: representanteEscola(lead),
        data_extenso: dataPorExtensoEmSaoPaulo(agora),
        destino: texto(c.destino),
        data_passeio: isoParaTexto(c.data_passeio),
        qtd_alunos: numero(c.qtd_alunos),
        qtd_professores: numero(c.qtd_professores),
        valor_por_aluno: moedaBRL(c.valor_por_aluno),
        valor_total: moedaBRL(c.valor_total),
        forma_pagamento: texto(c.forma_pagamento),
        observacoes: texto(c.observacoes),
    };
}

/**
 * Opções comuns. `errorLogging: false`: o docxtemplater imprime o erro inteiro
 * no console, e um erro de render pode carregar dado do lead para o log.
 */
const OPCOES = { paragraphLoop: true, linebreaks: true, errorLogging: false, nullGetter: () => "" };

/** Gera o .docx preenchido. Lança se o modelo estiver quebrado (o envio já barra isso). */
export function gerarContratoDocx(modelo: Uint8Array, dados: Record<string, string>): Buffer {
    const doc = new Docxtemplater(new PizZip(modelo), OPCOES);
    doc.render(dados);
    return doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;
}

type ErroDeTag = { properties?: { id?: string; xtag?: string; openingtag?: string; closingtag?: string } };

function descreverErro(e: ErroDeTag): string {
    const p = e.properties ?? {};
    switch (p.id) {
        case "unclosed_tag": return `{${p.xtag} sem "}"`;
        case "unopened_tag": return `"}" sem "{" perto de ${p.xtag ?? "?"}`;
        case "unclosed_loop": return `{#${p.xtag}} sem {/${p.xtag}}`;
        case "unopened_loop": return `{/${p.xtag}} sem {#${p.xtag}}`;
        case "closing_tag_does_not_match_opening_tag": return `{#${p.openingtag}} fechado por {/${p.closingtag}}`;
        default: return p.xtag ? `{${p.xtag}}` : "tag inválida";
    }
}

/**
 * `null` se o modelo serve; senão, o motivo — dizendo QUAL campo. Roda antes de
 * aceitar um modelo novo: tag quebrada ou campo fora de `CAMPOS_CONTRATO`
 * (um `{escola}` digitado errado no Word) não pode chegar à geração.
 */
export function validarModeloContrato(modelo: Uint8Array): string | null {
    let zip: PizZip;
    try {
        zip = new PizZip(modelo);
    } catch {
        return "O arquivo não é um .docx válido.";
    }
    let doc: Docxtemplater;
    try {
        doc = new Docxtemplater(zip, OPCOES);
    } catch (e) {
        const erros = ((e as { properties?: { errors?: ErroDeTag[] } }).properties?.errors ?? [e as ErroDeTag]).map(descreverErro);
        if (erros.length === 1 && erros[0] === "tag inválida" && !zip.file("word/document.xml")) {
            return "O arquivo não é um .docx válido.";
        }
        return `Campo quebrado no modelo: ${[...new Set(erros)].join("; ")}.`;
    }
    // Compilou: as tags estão bem formadas. Falta conferir se todas existem.
    const partes = Object.keys(zip.files).filter((n) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n));
    const usadas = new Set<string>();
    for (const parte of partes) {
        for (const m of doc.getFullText(parte).matchAll(/\{[#^/]?([^{}]+)\}/g)) usadas.add(m[1].trim());
    }
    const desconhecidas = [...usadas].filter((c) => !CHAVES.has(c));
    return desconhecidas.length ? `Campo desconhecido no modelo: ${desconhecidas.map((c) => `{${c}}`).join(", ")}.` : null;
}

/** `Contrato - {escola} - {dd-mm-aaaa}.docx`, sem caractere que o Windows recusa. */
export function nomeArquivoContrato(escola: string | null, dataPasseio: string | null): string {
    const limpo = (escola ?? "")
        .replace(/[\\/]/g, "-")
        .replace(/[:*?"<>|\u0000-\u001f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80);
    const data = dataPasseio ? isoParaTexto(dataPasseio).replace(/\//g, "-") : "sem data";
    return `Contrato - ${limpo || "sem nome"} - ${data}.docx`;
}

/**
 * Motivo de um erro do docxtemplater para o LOG: só os `properties.id`
 * ("unclosed_tag", "multi_error", ...), que vêm do modelo e nunca carregam
 * dado de lead. Nada de `explanation` nem de valores.
 */
export function motivoDoErroDocx(e: unknown): string {
    if (typeof e !== "object" || e === null) return "desconhecido";
    const p = (e as { properties?: { id?: string; errors?: ErroDeTag[] } }).properties;
    const ids = [p?.id, ...(p?.errors ?? []).map((x) => x.properties?.id)].filter((x): x is string => !!x);
    return ids.length ? [...new Set(ids)].join(", ") : ((e as { name?: string }).name ?? "desconhecido");
}
