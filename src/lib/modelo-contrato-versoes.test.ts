import { test } from "node:test";
import assert from "node:assert/strict";
import { infoVersoes, lerVersao, ModeloIndisponivel, type BucketModelos } from "./modelo-contrato-versoes";

/** Bucket falso em memória; `falha` liga erros por operação. */
function bucketFalso(arquivos: Record<string, Uint8Array>, falha: { list?: boolean; download?: boolean } = {}): BucketModelos {
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
        async upload(caminho, bytes) { arquivos[caminho] = bytes; return { data: { path: caminho }, error: null }; },
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
