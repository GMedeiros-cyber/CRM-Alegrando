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
