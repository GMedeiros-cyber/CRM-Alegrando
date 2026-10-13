import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { enviarFollowupComReserva, type LeadFollowup } from "./followup-envio";
import { enviaFollowup } from "./followup-regra";

/**
 * Banco falso, só o que o fluxo usa: `update().eq()...select()` e `insert()`.
 * O update confere os filtros e grava NO MESMO passo, depois de uma latência
 * simulada — é o que o `UPDATE ... WHERE` do Postgres garante, e é o que faz
 * o teste de concorrência significar alguma coisa.
 */
function bancoFalso(lead: LeadFollowup, falhas: { update?: (valores: Record<string, unknown>) => boolean; insert?: boolean } = {}) {
    const linha: Record<string, unknown> = { ...lead };
    const mensagens: unknown[] = [];
    const db = {
        from() {
            return {
                update(valores: Record<string, unknown>) {
                    const filtros: Array<[string, unknown]> = [];
                    const consulta = {
                        eq(coluna: string, valor: unknown) { filtros.push([coluna, valor]); return consulta; },
                        select() { return consulta; },
                        then(ok: (r: unknown) => unknown, erro: (e: unknown) => unknown) {
                            return (async () => {
                                await new Promise((r) => setTimeout(r, 1));
                                if (falhas.update?.(valores)) return { data: null, error: { message: "update falhou" } };
                                if (!filtros.every(([c, v]) => linha[c] === v)) return { data: [], error: null };
                                Object.assign(linha, valores);
                                return { data: [{ id: linha.id }], error: null };
                            })().then(ok, erro);
                        },
                    };
                    return consulta;
                },
                async insert(row: unknown) {
                    if (falhas.insert) return { error: { message: "insert falhou" } };
                    mensagens.push(row);
                    return { error: null };
                },
            };
        },
    };
    return { db: db as unknown as SupabaseClient, linha, mensagens };
}

const LEAD: LeadFollowup = {
    id: "lead-uuid-1",
    telefone: "5511999990000",
    followup_enviado: false,
    followup_enviado_em: null,
};
const ok = async () => ({ success: true });
const falha = async () => ({ success: false, error: "Z-API 500" });

let erroLog: ReturnType<typeof mock.method>;
const silenciaLog = () => { erroLog = mock.method(console, "error", () => {}); mock.method(console, "warn", () => {}); };
afterEach(() => mock.restoreAll());

test("reserva pega: envio chamado 1 vez, lead marcado, mensagem registrada", async () => {
    const { db, linha, mensagens } = bancoFalso(LEAD);
    const enviar = mock.fn(ok);
    assert.equal(await enviarFollowupComReserva(db, LEAD, "oi", enviar), "enviado");
    assert.equal(enviar.mock.callCount(), 1);
    assert.equal(linha.followup_enviado, true);
    assert.equal(mensagens.length, 1);
});

test("reserva volta 0 linhas (já marcado): envio NÃO chamado", async () => {
    const { db } = bancoFalso({ ...LEAD, followup_enviado: true });
    const enviar = mock.fn(ok);
    assert.equal(await enviarFollowupComReserva(db, LEAD, "oi", enviar), "ja-reservado");
    assert.equal(enviar.mock.callCount(), 0);
});

test("envio falha: reserva desfeita e o lead volta a ser elegível na rodada seguinte", async () => {
    silenciaLog();
    const anterior = { ...LEAD, followup_enviado_em: "2026-01-01T00:00:00.000Z" };
    const { db, linha } = bancoFalso(anterior);
    assert.equal(await enviarFollowupComReserva(db, anterior, "oi", falha), "erro");
    assert.equal(linha.followup_enviado, false);
    assert.equal(linha.followup_enviado_em, "2026-01-01T00:00:00.000Z");

    // Rodada seguinte (dia seguinte, dentro da tolerância): elegível e sai.
    assert.equal(enviaFollowup(46, 45, linha.followup_enviado as boolean), true);
    const enviar = mock.fn(ok);
    assert.equal(await enviarFollowupComReserva(db, anterior, "oi", enviar), "enviado");
    assert.equal(enviar.mock.callCount(), 1);
});

test("envio que LANÇA exceção conta como falha: reserva desfeita", async () => {
    silenciaLog();
    const { db, linha } = bancoFalso(LEAD);
    const explode = async (): Promise<{ success: boolean }> => { throw new Error("timeout"); };
    assert.equal(await enviarFollowupComReserva(db, LEAD, "oi", explode), "erro");
    assert.equal(linha.followup_enviado, false);
});

test("envio falha e o desfazer falha: erro logado com o id, sem novo envio na mesma rodada", async () => {
    silenciaLog();
    // Só o desfazer falha (o update que NÃO marca true).
    const { db, linha } = bancoFalso(LEAD, { update: (v) => v.followup_enviado !== true });
    const enviar = mock.fn(falha);
    assert.equal(await enviarFollowupComReserva(db, LEAD, "oi", enviar), "erro");
    assert.equal(enviar.mock.callCount(), 1);
    assert.equal(linha.followup_enviado, true); // pior caso aceito: lead sem mensagem
    const logs = erroLog.mock.calls.map((c) => String(c.arguments[0])).join("\n");
    assert.match(logs, /lead-uuid-1/);
});

test("envio ok e insert em messages falha: reserva mantida", async () => {
    silenciaLog();
    const { db, linha } = bancoFalso(LEAD, { insert: true });
    assert.equal(await enviarFollowupComReserva(db, LEAD, "oi", ok), "enviado");
    assert.equal(linha.followup_enviado, true);
    assert.equal(erroLog.mock.callCount() > 0, true);
});

test("duas execuções concorrentes sobre o mesmo lead: 1 envio só", async () => {
    const { db } = bancoFalso(LEAD);
    const enviar = mock.fn(ok);
    const resultados = await Promise.all([
        enviarFollowupComReserva(db, LEAD, "oi", enviar),
        enviarFollowupComReserva(db, LEAD, "oi", enviar),
    ]);
    assert.equal(enviar.mock.callCount(), 1);
    assert.deepEqual(resultados.sort(), ["enviado", "ja-reservado"]);
});
