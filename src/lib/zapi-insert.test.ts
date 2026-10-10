import { test } from "node:test";
import assert from "node:assert/strict";
import { classificarErroInsert } from "./zapi-insert";

test("sem erro, gravou", () => {
    assert.equal(classificarErroInsert(null), "ok");
});

test("23505 é entrega concorrente, não falha", () => {
    assert.equal(classificarErroInsert({ code: "23505" }), "duplicada");
});

test("qualquer outro erro precisa de retentativa", () => {
    // 23503 = foreign key, 42501 = permissão, 08006 = conexão caiu.
    assert.equal(classificarErroInsert({ code: "23503" }), "falha");
    assert.equal(classificarErroInsert({ code: "42501" }), "falha");
    assert.equal(classificarErroInsert({ code: "08006" }), "falha");
});

test("erro sem code é falha, não é tratado como duplicata", () => {
    assert.equal(classificarErroInsert({}), "falha");
    assert.equal(classificarErroInsert({ code: undefined }), "falha");
});
