import { test } from "node:test";
import assert from "node:assert/strict";
import PizZip from "pizzip";
import {
    CAMPOS_CONTRATO,
    dadosDoContrato,
    gerarContratoDocx,
    moedaBRL,
    nomeArquivoContrato,
    representanteEscola,
    validarModeloContrato,
    type ContratoParaDocx,
    type LeadParaContrato,
} from "./contrato-docx";
import { dataPorExtensoEmSaoPaulo } from "./hora-sao-paulo";

// ---------- modelo SINTÉTICO: empresa e dados inventados ----------

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const run = (t: string, grifo = false) =>
    `<w:r>${grifo ? '<w:rPr><w:highlight w:val="yellow"/></w:rPr>' : ""}<w:t xml:space="preserve">${t}</w:t></w:r>`;
/** Campo com marcador: {#x}{x}{/x}{^x}[PREENCHER ...]{/x}, o marcador grifado. */
const campo = (chave: string, rotulo: string) =>
    run(`{#${chave}}{${chave}}{/${chave}}{^${chave}}`) + run(`[PREENCHER ${rotulo}]`, true) + run(`{/${chave}}`);
const paragrafo = (...runs: string[]) => `<w:p>${runs.join("")}</w:p>`;

function modeloSintetico(corpo: string[]): Buffer {
    const z = new PizZip();
    z.file("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    z.file("_rels/.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    z.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${corpo.join("")}</w:body></w:document>`);
    return z.generate({ type: "nodebuffer" });
}

const MODELO_OK = modeloSintetico([
    paragrafo(run("CONTRATADA: EMPRESA EXEMPLO LTDA, representada por FULANO EXEMPLO.")),
    paragrafo(run("CONTRATANTE: "), campo("escola", "NOME DA ESCOLA"), run(", CNPJ "), campo("cnpj", "CNPJ"),
        run(", sede "), campo("endereco", "ENDEREÇO"), run(", representada por "), campo("representante_escola", "REPRESENTANTE"), run(".")),
    paragrafo(run("Destino: "), campo("destino", "DESTINO"), run(" Data: "), campo("data_passeio", "DATA")),
    paragrafo(run("Alunos: "), campo("qtd_alunos", "ALUNOS"), run(" Professores: "), campo("qtd_professores", "PROFESSORES")),
    paragrafo(run("Por aluno: "), campo("valor_por_aluno", "VALOR POR ALUNO"), run(" Total: "), campo("valor_total", "VALOR TOTAL")),
    paragrafo(run("Pagamento: "), campo("forma_pagamento", "FORMA DE PAGAMENTO")),
    paragrafo(run("Obs.: "), campo("observacoes", "OBSERVAÇÕES")),
    paragrafo(run("Local e data: Cidade Exemplo, {data_extenso}.")),
]);

const LEAD: LeadParaContrato = {
    nome: "Escola Exemplo Arco-Íris",
    cnpj: "11.222.333/0001-44",
    endereco: "Rua Inventada, 100 — Bairro Teste",
    responsavel: "Joana Responsável",
    diretora_nome: "Diretora Exemplo",
    coordenadora_nome: "Coordenadora Exemplo",
};
const CONTRATO: ContratoParaDocx = {
    data_passeio: "2026-11-05",
    destino: "Sítio do Exemplo",
    qtd_alunos: 38,
    qtd_professores: 4,
    valor_por_aluno: 90,
    valor_total: 3420,
    forma_pagamento: "PIX à vista",
    observacoes: "Levar lanche.\nSaída às 7h.",
};
const AGORA = new Date("2026-10-19T15:00:00Z");

/** Texto do documento gerado, para conferir. */
function textoDe(docx: Buffer): string {
    const xml = new PizZip(docx).file("word/document.xml")!.asText();
    return xml.replace(/<w:br\/>/g, "\n").replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

// ---------- valores ----------

test("representante: responsável → diretora → coordenadora (o primeiro preenchido)", () => {
    assert.equal(representanteEscola(LEAD), "Joana Responsável");
    assert.equal(representanteEscola({ ...LEAD, responsavel: "  " }), "Diretora Exemplo");
    assert.equal(representanteEscola({ ...LEAD, responsavel: null, diretora_nome: "" }), "Coordenadora Exemplo");
    assert.equal(representanteEscola({ ...LEAD, responsavel: null, diretora_nome: null, coordenadora_nome: null }), "");
});

test("moeda pt-BR: R$ 3.420,00", () => {
    assert.equal(moedaBRL(3420).replace(/\s/g, " "), "R$ 3.420,00");
    assert.equal(moedaBRL(90.5).replace(/\s/g, " "), "R$ 90,50");
    assert.equal(moedaBRL(null), "");
});

test("data por extenso em São Paulo, mesmo quando o UTC já virou o dia", () => {
    assert.equal(dataPorExtensoEmSaoPaulo(new Date("2026-10-19T15:00:00Z")), "19 de outubro de 2026");
    // 02:00 UTC do dia 20 = 23:00 do dia 19 em São Paulo
    assert.equal(dataPorExtensoEmSaoPaulo(new Date("2026-10-20T02:00:00Z")), "19 de outubro de 2026");
});

test("dados: datas dd/mm/aaaa, números como texto, vazios como ''", () => {
    const d = dadosDoContrato(LEAD, CONTRATO, AGORA);
    assert.equal(d.data_passeio, "05/11/2026");
    assert.equal(d.qtd_alunos, "38");
    assert.equal(d.data_extenso, "19 de outubro de 2026");
    const vazio = dadosDoContrato({ ...LEAD, cnpj: null }, { ...CONTRATO, qtd_professores: null, data_passeio: null }, AGORA);
    assert.equal(vazio.cnpj, "");
    assert.equal(vazio.qtd_professores, "");
    assert.equal(vazio.data_passeio, "");
    // 0 aluno é um número, não "vazio"
    assert.equal(dadosDoContrato(LEAD, { ...CONTRATO, qtd_professores: 0 }, AGORA).qtd_professores, "0");
});

// ---------- geração ----------

test("tudo preenchido: nenhum { sobrando e nenhum [PREENCHER", () => {
    const t = textoDe(gerarContratoDocx(MODELO_OK, dadosDoContrato(LEAD, CONTRATO, AGORA)));
    assert.ok(!t.includes("{"), t);
    assert.ok(!t.includes("[PREENCHER"), t);
    assert.ok(t.includes("Escola Exemplo Arco-Íris") && t.includes("11.222.333/0001-44") && t.includes("Joana Responsável"));
    assert.ok(t.includes("Cidade Exemplo, 19 de outubro de 2026."));
    assert.match(t, /R\$\s3\.420,00/);
    assert.ok(t.includes("Levar lanche.\nSaída às 7h."), "quebra de linha das observações vira <w:br/>");
});

test("CNPJ vazio vira [PREENCHER CNPJ], grifado no próprio modelo", () => {
    const docx = gerarContratoDocx(MODELO_OK, dadosDoContrato({ ...LEAD, cnpj: "" }, CONTRATO, AGORA));
    assert.ok(textoDe(docx).includes("CNPJ [PREENCHER CNPJ], sede"));
    const xml = new PizZip(docx).file("word/document.xml")!.asText();
    assert.match(xml, /<w:highlight w:val="yellow"\/><\/w:rPr><w:t xml:space="preserve">\[PREENCHER CNPJ\]/);
});

test("representante cai para a diretora e depois para a coordenadora, no documento", () => {
    const semResp = textoDe(gerarContratoDocx(MODELO_OK, dadosDoContrato({ ...LEAD, responsavel: null }, CONTRATO, AGORA)));
    assert.ok(semResp.includes("representada por Diretora Exemplo."));
    const soCoord = textoDe(gerarContratoDocx(MODELO_OK, dadosDoContrato({ ...LEAD, responsavel: null, diretora_nome: null }, CONTRATO, AGORA)));
    assert.ok(soCoord.includes("representada por Coordenadora Exemplo."));
});

test("nome com &, < e aspas é escapado e o XML continua válido", () => {
    const nome = 'Escola "A & B" <Teste>';
    const docx = gerarContratoDocx(MODELO_OK, dadosDoContrato({ ...LEAD, nome }, CONTRATO, AGORA));
    const xml = new PizZip(docx).file("word/document.xml")!.asText();
    assert.ok(xml.includes("A &amp; B") && xml.includes("&lt;Teste&gt;"));
    assert.ok(!xml.includes("<Teste>"));
    assert.ok(textoDe(docx).includes(nome));
    // XML válido: o próprio docxtemplater consegue abrir o resultado como modelo.
    assert.equal(validarModeloContrato(docx), null);
});

// ---------- validação do modelo enviado ----------

test("modelo válido é aceito", () => {
    assert.equal(validarModeloContrato(MODELO_OK), null);
});

test("modelo com tag quebrada é recusado, dizendo qual", () => {
    const quebrado = modeloSintetico([paragrafo(run("CONTRATANTE: {escola, CNPJ {cnpj}"))]);
    assert.match(validarModeloContrato(quebrado) ?? "", /\{escola/);
    const lacoAberto = modeloSintetico([paragrafo(run("{#cnpj}{cnpj} sem fechar"))]);
    assert.match(validarModeloContrato(lacoAberto) ?? "", /cnpj/);
});

test("modelo com campo desconhecido é recusado, dizendo qual", () => {
    const desconhecido = modeloSintetico([paragrafo(run("Escola: {escola} — {nmoe}"))]);
    assert.equal(validarModeloContrato(desconhecido), "Campo desconhecido no modelo: {nmoe}.");
});

test("arquivo que não é .docx é recusado", () => {
    assert.match(validarModeloContrato(Buffer.from("não sou zip")) ?? "", /não é um \.docx/);
});

test("o catálogo de campos cobre tudo o que o modelo usa", () => {
    const chaves = CAMPOS_CONTRATO.map((c) => c.chave).sort();
    assert.deepEqual(chaves, ["cnpj", "data_extenso", "data_passeio", "destino", "endereco", "escola", "forma_pagamento",
        "observacoes", "qtd_alunos", "qtd_professores", "representante_escola", "valor_por_aluno", "valor_total"]);
});

// ---------- nome do arquivo ----------

test("nome do arquivo: Contrato - {escola} - {data}.docx, sem caractere proibido", () => {
    assert.equal(nomeArquivoContrato("Escola Exemplo", "2026-11-05"), "Contrato - Escola Exemplo - 05-11-2026.docx");
    assert.equal(nomeArquivoContrato('Escola A/B: "X"?', "2026-11-05"), "Contrato - Escola A-B X - 05-11-2026.docx");
    assert.equal(nomeArquivoContrato("", null), "Contrato - sem nome - sem data.docx");
});
