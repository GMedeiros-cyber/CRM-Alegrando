import { test } from "node:test";
import assert from "node:assert/strict";
import { dentroDaJanelaFollowup, minutosEmSaoPaulo } from "./hora-sao-paulo";

// Instantes sempre em UTC explícito: o resultado não pode depender do TZ do
// processo (a Vercel roda em UTC; a máquina de quem testa, em Brasília).
const utc = (hhmm: string) => new Date(`2026-10-13T${hhmm}:00Z`);

test("12 UTC são 9h em São Paulo", () => {
    assert.equal(minutosEmSaoPaulo(utc("12:00")), 9 * 60);
});

test("meia-noite em São Paulo é 0, não 24", () => {
    assert.equal(minutosEmSaoPaulo(utc("03:00")), 0);
});

test("followup 09:00: o cron das 11, 12 e 13 UTC dá não, sim, não", () => {
    assert.equal(dentroDaJanelaFollowup("09:00", utc("11:00")), false);
    assert.equal(dentroDaJanelaFollowup("09:00", utc("12:00")), true);
    assert.equal(dentroDaJanelaFollowup("09:00", utc("13:00")), false);
});

test("fronteira: 59 minutos de distância entra, 60 não", () => {
    assert.equal(dentroDaJanelaFollowup("09:00", utc("12:59")), true);  // 09:59
    assert.equal(dentroDaJanelaFollowup("09:00", utc("13:00")), false); // 10:00
    assert.equal(dentroDaJanelaFollowup("09:00", utc("11:01")), true);  // 08:01
    assert.equal(dentroDaJanelaFollowup("09:00", utc("11:00")), false); // 08:00
});

test("aceita o formato da coluna time (HH:MM:SS)", () => {
    assert.equal(dentroDaJanelaFollowup("09:00:00", utc("12:00")), true);
    assert.equal(dentroDaJanelaFollowup("14:30:00", utc("17:30")), true);
});

// ===== Dia do passeio contado em São Paulo (19/10/2026) =====

import { diaEmSaoPaulo, diasDesdeOPasseio } from "./hora-sao-paulo";

test("o dia de hoje é o de São Paulo, mesmo quando o UTC já virou", () => {
    assert.equal(diaEmSaoPaulo(new Date("2026-10-19T15:00:00Z")), "2026-10-19");
    assert.equal(diaEmSaoPaulo(new Date("2026-10-20T02:30:00Z")), "2026-10-19"); // 23:30 em SP
    assert.equal(diaEmSaoPaulo(new Date("2026-10-20T03:00:00Z")), "2026-10-20"); // meia-noite em SP
});

test("dias desde o passeio: contados em São Paulo, em qualquer fuso do processo", () => {
    // passeio ontem, cron das 12 UTC
    assert.equal(diasDesdeOPasseio("2026-10-18", new Date("2026-10-19T12:00:00Z")), 1);
    // clique às 23h de Brasília (02:00 UTC do dia seguinte): ainda é D+1, não D+2
    assert.equal(diasDesdeOPasseio("2026-10-18", new Date("2026-10-20T02:00:00Z")), 1);
    assert.equal(diasDesdeOPasseio("2026-10-19", new Date("2026-10-19T12:00:00Z")), 0);
    assert.equal(diasDesdeOPasseio("2026-07-01", new Date("2026-08-15T12:00:00Z")), 45);
    // passeio no futuro dá negativo, não zero
    assert.equal(diasDesdeOPasseio("2026-10-25", new Date("2026-10-19T12:00:00Z")), -6);
});
