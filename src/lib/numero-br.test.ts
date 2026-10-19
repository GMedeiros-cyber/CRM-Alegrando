import { test } from "node:test";
import assert from "node:assert/strict";
import { formatarInteiroBR, formatarMoedaBR, lerInteiroBR, lerNumeroBR } from "./numero-br";

const valor = (r: ReturnType<typeof lerNumeroBR>) => (r.ok ? r.valor : "INVÁLIDO");
const sem = (s: string) => s.replace(/ /g, " ");

test("pt-BR: ponto é milhar, vírgula é decimal", () => {
    assert.equal(valor(lerNumeroBR("3.420")), 3420);
    assert.equal(valor(lerNumeroBR("3.420,50")), 3420.5);
    assert.equal(valor(lerNumeroBR("90,5")), 90.5);
    assert.equal(valor(lerNumeroBR("1.234.567,89")), 1234567.89);
    assert.equal(valor(lerNumeroBR("3420")), 3420);
});

test("aceita R$ e espaços (inclusive o espaço fino do Intl)", () => {
    assert.equal(valor(lerNumeroBR("R$ 90,00")), 90);
    assert.equal(valor(lerNumeroBR("R$ 3.420,00")), 3420);
    assert.equal(valor(lerNumeroBR("R$ 3.420,00")), 3420);
    assert.equal(valor(lerNumeroBR("  90,5 ")), 90.5);
});

test("regra do ambíguo: um ponto com 1 ou 2 dígitos depois é decimal; com 3 é milhar", () => {
    assert.equal(valor(lerNumeroBR("90.5")), 90.5);
    assert.equal(valor(lerNumeroBR("90.50")), 90.5);
    assert.equal(valor(lerNumeroBR("90.500")), 90500);
});

test("vazio é null, não erro", () => {
    assert.equal(valor(lerNumeroBR("")), null);
    assert.equal(valor(lerNumeroBR("   ")), null);
    assert.equal(valor(lerInteiroBR("")), null);
});

test("não é número: recusado (não vira null calado)", () => {
    for (const t of ["teste", "3,42,1", "1234.567", "12.34.56", "-5", "1.2345", "R$"]) {
        assert.equal(lerNumeroBR(t).ok, false, t);
    }
});

test("inteiro: 1.200 alunos é 1200; decimal e texto são recusados", () => {
    assert.equal(valor(lerInteiroBR("1.200")), 1200);
    assert.equal(valor(lerInteiroBR("38")), 38);
    assert.equal(valor(lerInteiroBR(" 38 ")), 38);
    for (const t of ["teste", "38,5", "1.2", "1.20", "-3"]) assert.equal(lerInteiroBR(t).ok, false, t);
});

test("formatação ao sair do campo, e ela lê de volta igual", () => {
    assert.equal(sem(formatarMoedaBR(3420)), "R$ 3.420,00");
    assert.equal(sem(formatarMoedaBR(90.5)), "R$ 90,50");
    assert.equal(formatarInteiroBR(1200), "1.200");
    assert.equal(valor(lerNumeroBR(formatarMoedaBR(3420.5))), 3420.5);
    assert.equal(valor(lerInteiroBR(formatarInteiroBR(1200))), 1200);
});
