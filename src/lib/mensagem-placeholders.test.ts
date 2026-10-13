import { test } from "node:test";
import assert from "node:assert/strict";
import { inserirNoCursor, partesDaMensagem, PLACEHOLDERS_ANIVERSARIO, validarMensagem } from "./mensagem-placeholders";

const CAT = PLACEHOLDERS_ANIVERSARIO;

test("catálogo do aniversário: só {nome}, com exemplo", () => {
    assert.deepEqual(CAT.map((p) => p.chave), ["nome"]);
    assert.equal(CAT[0].exemplo, "Maria Fernanda Souza");
});

test("prévia: placeholder conhecido vira o exemplo; texto em volta fica", () => {
    assert.deepEqual(partesDaMensagem("Olá {nome}!", CAT), [
        { tipo: "texto", valor: "Olá " },
        { tipo: "placeholder", valor: "Maria Fernanda Souza", original: "{nome}" },
        { tipo: "texto", valor: "!" },
    ]);
});

test("prévia: {{nome}} e { nome } também são o nome (o envio aceita as duas formas)", () => {
    assert.equal(partesDaMensagem("{{nome}}", CAT)[0].tipo, "placeholder");
    assert.equal(partesDaMensagem("{ nome }", CAT)[0].tipo, "placeholder");
    assert.equal(partesDaMensagem("{Nome}", CAT)[0].tipo, "placeholder");
});

test("prévia: placeholder desconhecido fica marcado, com o texto original", () => {
    assert.deepEqual(partesDaMensagem("Oi {nmoe}", CAT), [
        { tipo: "texto", valor: "Oi " },
        { tipo: "desconhecido", valor: "{nmoe}" },
    ]);
    // Qualquer coisa entre chaves que não esteja no catálogo, não só [a-z_].
    assert.equal(partesDaMensagem("{escola 2}", CAT)[0].tipo, "desconhecido");
});

test("prévia: chave solta não é placeholder", () => {
    assert.deepEqual(partesDaMensagem("a { b", CAT), [{ tipo: "texto", valor: "a { b" }]);
});

test("salvar: texto vazio bloqueia", () => {
    assert.equal(validarMensagem("", CAT), "Escreva a mensagem antes de salvar.");
    assert.equal(validarMensagem("   \n ", CAT), "Escreva a mensagem antes de salvar.");
});

test("salvar: placeholder fora do catálogo bloqueia e diz qual", () => {
    assert.equal(validarMensagem("Olá {nmoe}!", CAT), "Não reconheço {nmoe}. Use {nome}.");
    assert.equal(validarMensagem("{a} e {b} e {a}", CAT), "Não reconheço {a}, {b}. Use {nome}.");
});

test("salvar: texto válido passa", () => {
    assert.equal(validarMensagem("Olá {nome}! 🎉", CAT), null);
    assert.equal(validarMensagem("Sem placeholder nenhum.", CAT), null);
});

test("inserir no cursor: substitui a seleção e devolve o cursor depois do bloco", () => {
    assert.deepEqual(inserirNoCursor("Olá !", 4, 4, "{nome}"), { texto: "Olá {nome}!", cursor: 10 });
    assert.deepEqual(inserirNoCursor("Olá XX!", 4, 6, "{nome}"), { texto: "Olá {nome}!", cursor: 10 });
});
