import { test } from "node:test";
import assert from "node:assert/strict";
import { isoParaTexto, lerData, mascararData } from "./data-aniversario";

const HOJE = "2026-10-13";

test("máscara põe as barras conforme os dígitos chegam, sem barra sobrando", () => {
    assert.equal(mascararData("1"), "1");
    assert.equal(mascararData("12"), "12");
    assert.equal(mascararData("123"), "12/3");
    assert.equal(mascararData("1203"), "12/03");
    assert.equal(mascararData("12031978"), "12/03/1978");
    // Backspace sobre "12/" volta a "12": a barra nunca fica pendurada.
    assert.equal(mascararData("12/"), "12");
});

test("máscara ignora o que não é dígito e corta em 8 dígitos", () => {
    assert.equal(mascararData("12/03/1978"), "12/03/1978");
    assert.equal(mascararData("12-03-1978 "), "12/03/1978");
    assert.equal(mascararData("120319789"), "12/03/1978");
    assert.equal(mascararData("ab"), "");
});

test("ISO do banco vira texto dd/mm/aaaa, e vazio vira vazio", () => {
    assert.equal(isoParaTexto("1978-03-12"), "12/03/1978");
    assert.equal(isoParaTexto(null), "");
    assert.equal(isoParaTexto(""), "");
});

test("data completa e válida devolve o ISO", () => {
    assert.deepEqual(lerData("12/03/1978", HOJE), { tipo: "ok", iso: "1978-03-12" });
    assert.deepEqual(lerData("29/02/1980", HOJE), { tipo: "ok", iso: "1980-02-29" });
    assert.deepEqual(lerData("01/01/1940", HOJE), { tipo: "ok", iso: "1940-01-01" });
    assert.deepEqual(lerData("13/10/2026", HOJE), { tipo: "ok", iso: "2026-10-13" });
});

test("vazio e incompleto não são data — o ano é obrigatório", () => {
    assert.deepEqual(lerData("", HOJE), { tipo: "vazio" });
    assert.deepEqual(lerData("12/03", HOJE), { tipo: "incompleta" });
    assert.deepEqual(lerData("12/03/197", HOJE), { tipo: "incompleta" });
});

test("dia que não existe é inválido", () => {
    assert.equal(lerData("31/02/1980", HOJE).tipo, "invalida");
    assert.equal(lerData("29/02/1981", HOJE).tipo, "invalida");
    assert.equal(lerData("00/03/1978", HOJE).tipo, "invalida");
    assert.equal(lerData("12/13/1978", HOJE).tipo, "invalida");
});

test("fora de 1940..hoje é inválido", () => {
    assert.equal(lerData("31/12/1939", HOJE).tipo, "invalida");
    assert.equal(lerData("14/10/2026", HOJE).tipo, "invalida");
});
