import { test } from "node:test";
import assert from "node:assert/strict";
import { enviaAvaliacao, enviaFollowup, FOLLOWUP_TOLERANCIA_DIAS } from "./followup-regra";

const FD = 45; // followup_dias padrão

test("follow-up: atraso 0, 1 e 7 envia; 8 não", () => {
    assert.equal(enviaFollowup(FD + 0, FD, false), true);
    assert.equal(enviaFollowup(FD + 1, FD, false), true);
    assert.equal(enviaFollowup(FD + 7, FD, false), true);
    assert.equal(enviaFollowup(FD + 8, FD, false), false);
    assert.equal(FOLLOWUP_TOLERANCIA_DIAS, 7);
});

test("follow-up antes do vencimento não envia", () => {
    assert.equal(enviaFollowup(FD - 1, FD, false), false);
});

test("follow-up já enviado não envia de novo, mesmo dentro da tolerância", () => {
    assert.equal(enviaFollowup(FD + 3, FD, true), false);
});

test("D+1 continua exato: diffDias 1 envia, 2 não", () => {
    assert.equal(enviaAvaliacao(1), true);
    assert.equal(enviaAvaliacao(2), false);
    assert.equal(enviaAvaliacao(0), false);
});

test("os 3 presos de hoje (34, 59 e 60 dias de atraso) não recebem", () => {
    assert.equal(enviaFollowup(16 + 34, 16, false), false); // Colégio Adonai
    assert.equal(enviaFollowup(45 + 59, 45, false), false); // Colégio VIP
    assert.equal(enviaFollowup(45 + 60, 45, false), false); // Regina
});

/**
 * O que o cron faz com UM lead ao longo dos dias, na ordem da rota: D+1
 * (trava de 23h e envio) e depois follow-up (trava e envio, marcando
 * `followup_enviado`). `equipeFalou[d]` = a equipe falou nas 23h antes da
 * execução do dia d — além do que o próprio cron grava ao enviar.
 */
function simula(followupDias: number, dias: number[], equipeFalou: Record<number, boolean> = {}) {
    let enviado = false;
    const saidas: string[] = [];
    for (const d of dias) {
        let falou = !!equipeFalou[d];
        if (enviaAvaliacao(d)) {
            if (falou) continue;
            saidas.push(`D+${d} avaliacao`);
            falou = true; // o cron grava a mensagem como 'equipe'
        }
        if (enviaFollowup(d, followupDias, enviado)) {
            if (falou) continue;
            saidas.push(`D+${d} follow-up`);
            enviado = true;
        }
    }
    return saidas;
}

test("trava de 23h no dia do vencimento: o follow-up sai no dia seguinte", () => {
    // O caso que motivou a regra: com igualdade exata, este lead se perdia.
    assert.deepEqual(simula(FD, [45, 46, 47], { 45: true }), ["D+46 follow-up"]);
});

test("enviado uma vez, os dias seguintes da tolerância não reenviam", () => {
    assert.deepEqual(simula(FD, [45, 46, 47, 48, 49, 50, 51, 52, 53]), ["D+45 follow-up"]);
});

test("followup_dias = 1: avaliação no D+1, follow-up no D+2 (a trava pula o do mesmo dia)", () => {
    assert.deepEqual(simula(1, [1, 2, 3]), ["D+1 avaliacao", "D+2 follow-up"]);
});
