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
