import { test } from "node:test";
import assert from "node:assert/strict";
import { infoVersoes, lerVersao, ModeloIndisponivel, trocarVersao, voltarVersao, type BucketModelos } from "./modelo-contrato-versoes";

/** Bucket falso em memória; `falha` liga erros por operação. */
/** `gravacoesQueFalham`: números (1, 2, 3...) das chamadas de upload que devolvem erro. */
function bucketFalso(arquivos: Record<string, Uint8Array>, falha: { list?: boolean; download?: boolean; gravacoesQueFalham?: number[] } = {}): BucketModelos {
    let gravacao = 0;
    return {
        async list(pasta) {
            if (falha.list) return { data: null, error: { message: "rede" } };
            const nomes = Object.keys(arquivos).filter((c) => c.startsWith(pasta + "/")).map((c) => c.slice(pasta.length + 1));
            return { data: nomes.map((name) => ({ name, updated_at: "2026-10-19T18:00:00Z" })), error: null };
        },
        async download(caminho) {
            if (falha.download || !arquivos[caminho]) return { data: null, error: { message: "{}" } };
            return { data: new Blob([new Uint8Array(arquivos[caminho])]), error: null };
        },
        async upload(caminho, bytes) {
            gravacao++;
            if (falha.gravacoesQueFalham?.includes(gravacao)) return { data: null, error: { message: `gravação ${gravacao} falhou` } };
            arquivos[caminho] = bytes;
            return { data: { path: caminho }, error: null };
        },
        async remove(caminhos) { for (const c of caminhos) delete arquivos[c]; return { data: [], error: null }; },
    };
}
const DOCX = new Uint8Array([1, 2, 3]);

test("não existe → null (e só nesse caso)", async () => {
    assert.equal(await lerVersao(bucketFalso({}), "atual"), null);
});

test("existe → os bytes", async () => {
    assert.deepEqual(await lerVersao(bucketFalso({ "contrato/atual.docx": DOCX }), "atual"), DOCX);
});

test("falha ao listar → erro, não 'nenhum modelo'", async () => {
    await assert.rejects(lerVersao(bucketFalso({ "contrato/atual.docx": DOCX }, { list: true }), "atual"), ModeloIndisponivel);
});

test("existe mas o download falha → erro, não null", async () => {
    await assert.rejects(lerVersao(bucketFalso({ "contrato/atual.docx": DOCX }, { download: true }), "atual"), ModeloIndisponivel);
});

test("info: falha ao listar → erro; lista vazia → as duas versões ausentes", async () => {
    await assert.rejects(infoVersoes(bucketFalso({}, { list: true })), ModeloIndisponivel);
    assert.deepEqual(await infoVersoes(bucketFalso({})), { atual: null, anterior: null });
    assert.deepEqual(await infoVersoes(bucketFalso({ "contrato/atual.docx": DOCX })), {
        atual: { atualizadoEm: "2026-10-19T18:00:00Z" },
        anterior: null,
    });
});

// ===== Nenhum caminho de falha perde uma versão (item 4) =====

const A = new Uint8Array([0xa]), B = new Uint8Array([0xb]), N = new Uint8Array([0xc]);
const estado = (arq: Record<string, Uint8Array>) => ({
    atual: arq["contrato/atual.docx"]?.[0], anterior: arq["contrato/anterior.docx"]?.[0], troca: arq["contrato/troca.docx"]?.[0],
});
/** Nenhum conteúdo que existia antes some de todos os caminhos. */
const nadaPerdido = (arq: Record<string, Uint8Array>, antes: number[]) =>
    antes.every((v) => Object.values(arq).some((b) => b[0] === v));

test("voltar: troca atual e anterior, e limpa o caminho de troca", async () => {
    const arq = { "contrato/atual.docx": A, "contrato/anterior.docx": B };
    assert.equal(await voltarVersao(bucketFalso(arq)), true);
    assert.deepEqual(estado(arq), { atual: 0xb, anterior: 0xa, troca: undefined });
});

test("voltar: falha na 2ª gravação — nada muda e nenhuma versão some", async () => {
    const arq = { "contrato/atual.docx": A, "contrato/anterior.docx": B };
    await assert.rejects(voltarVersao(bucketFalso(arq, { gravacoesQueFalham: [2] })));
    assert.equal(estado(arq).atual, 0xa);
    assert.equal(estado(arq).anterior, 0xb);
    assert.ok(nadaPerdido(arq, [0xa, 0xb]));
});

test("voltar: falha na 3ª gravação — desfaz e volta ao estado de antes", async () => {
    const arq = { "contrato/atual.docx": A, "contrato/anterior.docx": B };
    await assert.rejects(voltarVersao(bucketFalso(arq, { gravacoesQueFalham: [3] })));
    assert.equal(estado(arq).atual, 0xa);
    assert.equal(estado(arq).anterior, 0xb);
});

test("voltar: falha na 3ª E no desfazer — a versão nova fica no caminho de troca", async () => {
    const arq = { "contrato/atual.docx": A, "contrato/anterior.docx": B };
    await assert.rejects(voltarVersao(bucketFalso(arq, { gravacoesQueFalham: [3, 4] })));
    assert.equal(estado(arq).troca, 0xa);
    assert.ok(nadaPerdido(arq, [0xa, 0xb]));
});

test("enviar versão nova: o atual vira o anterior", async () => {
    const arq = { "contrato/atual.docx": A, "contrato/anterior.docx": B };
    await trocarVersao(bucketFalso(arq), N);
    assert.deepEqual(estado(arq), { atual: 0xc, anterior: 0xa, troca: undefined });
});

test("enviar versão nova: falha na 2ª gravação — nada muda, nenhuma versão some", async () => {
    const arq = { "contrato/atual.docx": A, "contrato/anterior.docx": B };
    await assert.rejects(trocarVersao(bucketFalso(arq, { gravacoesQueFalham: [2] }), N));
    assert.equal(estado(arq).atual, 0xa);
    assert.equal(estado(arq).anterior, 0xb);
    assert.ok(nadaPerdido(arq, [0xa, 0xb]));
});

test("enviar versão nova: falha na gravação do novo — desfaz o anterior", async () => {
    const arq = { "contrato/atual.docx": A, "contrato/anterior.docx": B };
    await assert.rejects(trocarVersao(bucketFalso(arq, { gravacoesQueFalham: [3] }), N));
    assert.equal(estado(arq).atual, 0xa);
    assert.equal(estado(arq).anterior, 0xb);
});

test("enviar versão nova sem nenhum modelo antes: só grava o atual", async () => {
    const arq: Record<string, Uint8Array> = {};
    await trocarVersao(bucketFalso(arq), N);
    assert.deepEqual(estado(arq), { atual: 0xc, anterior: undefined, troca: undefined });
});
