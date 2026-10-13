import { test } from "node:test";
import assert from "node:assert/strict";
import { filtrarLabels } from "./labels";

// Nomes reais do banco (17 tags), incluindo o espaço duplo de "FERRAZ DE VASC".
const tags = [
    { name: "AGÊNCIA" },
    { name: "ESCOLA PÚBLICA - BARUERI" },
    { name: "MAIRIPORÃ - PÚBLICA" },
    { name: "POÁ PÚBLICA" },
    { name: "SUZANO - PARTICULAR" },
    { name: "TRANSPORTADOR ESCOLAR" },
];

test("query vazia devolve tudo", () => {
    assert.equal(filtrarLabels(tags, "").length, tags.length);
    assert.equal(filtrarLabels(tags, "   ").length, tags.length);
});

test("ignora acento nos dois lados", () => {
    assert.deepEqual(filtrarLabels(tags, "agencia").map(t => t.name), ["AGÊNCIA"]);
    assert.deepEqual(filtrarLabels(tags, "AGÊNCIA").map(t => t.name), ["AGÊNCIA"]);
    assert.deepEqual(filtrarLabels(tags, "mairipora").map(t => t.name), ["MAIRIPORÃ - PÚBLICA"]);
});

test("ignora caixa e casa no meio do nome", () => {
    assert.equal(filtrarLabels(tags, "publica").length, 3);
    assert.deepEqual(filtrarLabels(tags, "escolar").map(t => t.name), ["TRANSPORTADOR ESCOLAR"]);
});

test("sem resultado devolve lista vazia, nao a lista inteira", () => {
    assert.deepEqual(filtrarLabels(tags, "xyz"), []);
});
