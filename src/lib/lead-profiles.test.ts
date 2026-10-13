import { test } from "node:test";
import assert from "node:assert/strict";
import { definicaoDoLead, normalizarNomeTag, perfilDoLead, PERFIS } from "./lead-profiles";

const t = (...nomes: string[]) => nomes.map((name) => ({ name }));

test("tag de transportador dá o perfil transportador", () => {
    assert.equal(perfilDoLead(t("TRANSPORTADOR ESCOLAR")), "transportador");
});

test("tag de parceiro dá o perfil parceiro", () => {
    assert.equal(perfilDoLead(t("PARCEIROS")), "parceiro");
});

test("precedência: com as duas tags, transportador ganha — em qualquer ordem", () => {
    assert.equal(perfilDoLead(t("TRANSPORTADOR ESCOLAR", "PARCEIROS")), "transportador");
    assert.equal(perfilDoLead(t("PARCEIROS", "TRANSPORTADOR ESCOLAR")), "transportador");
    // Com outras tags no meio, continua determinístico.
    assert.equal(perfilDoLead(t("NOVO LEAD", "PARCEIROS", "AGÊNCIA", "TRANSPORTADOR ESCOLAR")), "transportador");
});

test("tag desconhecida cai em escola", () => {
    assert.equal(perfilDoLead(t("LEAD RECORRENTE")), "escola");
    assert.equal(perfilDoLead(t("SUZANO - PÚBLICA", "CRM NEO GEO")), "escola");
});

test("lead sem tag nenhuma cai em escola", () => {
    assert.equal(perfilDoLead([]), "escola");
    assert.equal(perfilDoLead(null), "escola");
    assert.equal(perfilDoLead(undefined), "escola");
});

test("nome sujo casa: espaço duplo, minúsculo, espaço nas pontas", () => {
    // A base tem nome com espaço duplo (medido): a tag de perfil pode nascer assim.
    assert.equal(perfilDoLead(t("TRANSPORTADOR  ESCOLAR")), "transportador");
    assert.equal(perfilDoLead(t("  transportador escolar  ")), "transportador");
    assert.equal(perfilDoLead(t("Transportador   Escolar")), "transportador");
    assert.equal(perfilDoLead(t("parceiros")), "parceiro");
    assert.equal(perfilDoLead(t(" PARCEIROS ")), "parceiro");
});

test("normalizarNomeTag colapsa espaço e sobe a caixa", () => {
    assert.equal(normalizarNomeTag("  POÁ   PÚBLICA "), "POÁ PÚBLICA");
    assert.equal(normalizarNomeTag("suzano -  particular"), "SUZANO - PARTICULAR");
    // Acento NÃO é removido: os nomes do banco têm acento e a comparação é entre iguais.
    assert.equal(normalizarNomeTag("MAIRIPORÃ  - PÚBLICA"), "MAIRIPORÃ - PÚBLICA");
});

test("o que cada perfil mostra", () => {
    // Escola é o padrão: mostra tudo, como antes dos perfis existirem.
    assert.deepEqual(PERFIS.escola, {
        rotulo: "Escola",
        documento: "cnpj",
        blocoInstituicao: true,
        contratos: true,
    });
    // Transportador é pessoa física: CPF, e nada de escola.
    assert.equal(PERFIS.transportador.documento, "cpf");
    // blocoInstituicao=false esconde tambem as datas de aniversario, que vivem dentro dele.
    assert.equal(PERFIS.transportador.blocoInstituicao, false);
    assert.equal(PERFIS.transportador.contratos, false);
    // Parceiro pode ser empresa: CNPJ, mas também não é escola.
    assert.equal(PERFIS.parceiro.documento, "cnpj");
    assert.equal(PERFIS.parceiro.blocoInstituicao, false);
    assert.equal(PERFIS.parceiro.contratos, false);
});

test("definicaoDoLead entrega a definição pronta", () => {
    assert.equal(definicaoDoLead(t("TRANSPORTADOR ESCOLAR")).documento, "cpf");
    assert.equal(definicaoDoLead(t("PARCEIROS")).documento, "cnpj");
    assert.equal(definicaoDoLead([]).blocoInstituicao, true);
});

// ===== Documento com fallback por valor (decisão B, 13/10/2026) =====

import { camposDocumento, temValor } from "./lead-profiles";

test("temValor: null, undefined e string vazia são vazios", () => {
    assert.equal(temValor(null), false);
    assert.equal(temValor(undefined), false);
    assert.equal(temValor(""), false);
    assert.equal(temValor("   "), false);
    assert.equal(temValor("123"), true);
});

test("transportador com só CNPJ: CPF visível (vazio) + CNPJ visível (com valor)", () => {
    assert.deepEqual(camposDocumento("transportador", { cnpj: "12.345.678/0001-00", cpf: null }), ["cpf", "cnpj"]);
});

test("transportador com só CPF: CPF visível, CNPJ ausente", () => {
    assert.deepEqual(camposDocumento("transportador", { cpf: "123.456.789-00", cnpj: null }), ["cpf"]);
});

test("transportador sem nada: CPF visível, CNPJ ausente", () => {
    assert.deepEqual(camposDocumento("transportador", { cpf: null, cnpj: null }), ["cpf"]);
    assert.deepEqual(camposDocumento("transportador", {}), ["cpf"]);
});

test("transportador com CNPJ vazio ('') : CNPJ ausente, não visível-e-vazio", () => {
    assert.deepEqual(camposDocumento("transportador", { cnpj: "", cpf: null }), ["cpf"]);
    assert.deepEqual(camposDocumento("transportador", { cnpj: "   ", cpf: null }), ["cpf"]);
});

test("parceiro com só CNPJ: CNPJ visível, CPF ausente", () => {
    assert.deepEqual(camposDocumento("parceiro", { cnpj: "12.345.678/0001-00", cpf: null }), ["cnpj"]);
});

test("parceiro sem nada: CNPJ visível, CPF ausente", () => {
    assert.deepEqual(camposDocumento("parceiro", { cpf: null, cnpj: null }), ["cnpj"]);
});

test("parceiro com CPF preenchido: o fallback aparece e se cura ao ser limpo", () => {
    assert.deepEqual(camposDocumento("parceiro", { cpf: "123.456.789-00", cnpj: null }), ["cnpj", "cpf"]);
    // Operador move o numero e limpa o antigo: no proximo render o campo sai.
    assert.deepEqual(camposDocumento("parceiro", { cpf: "", cnpj: "12.345.678/0001-00" }), ["cnpj"]);
});

test("escola não muda: só cnpj no nível do lead, qualquer que seja o cpf", () => {
    assert.deepEqual(camposDocumento("escola", { cpf: null, cnpj: null }), ["cnpj"]);
    assert.deepEqual(camposDocumento("escola", { cpf: "123.456.789-00", cnpj: null }), ["cnpj"]);
    assert.deepEqual(camposDocumento("escola", { cpf: "123.456.789-00", cnpj: "12.345.678/0001-00" }), ["cnpj"]);
});
