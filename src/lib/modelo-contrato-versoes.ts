/**
 * Leitura das versões do modelo de contrato, separada do Supabase para poder
 * ser testada com um bucket falso (`modelo-contrato-versoes.test.ts`).
 *
 * "Não existe" e "não consegui ler" são coisas diferentes e não podem cair no
 * mesmo null: antes, uma falha de rede aparecia na tela como "nenhum modelo
 * enviado". O Storage não ajuda a separar pelo erro — medido em 19/10/2026,
 * arquivo inexistente e bucket inexistente devolvem o MESMO
 * `StorageUnknownError` com mensagem `{}`. Então a existência vem da LISTAGEM
 * da pasta: erro ao listar = erro; arquivo fora da lista = não existe; erro ao
 * baixar um arquivo que está na lista = erro.
 */
import type { InfoModelos } from "./contrato-campos";

export const PASTA = "contrato";
export const CAMINHO = { atual: `${PASTA}/atual.docx`, anterior: `${PASTA}/anterior.docx` } as const;
export type VersaoModelo = keyof typeof CAMINHO;

type Resposta<T> = { data: T | null; error: unknown };
/** O pedaço da API de Storage do supabase-js que este módulo usa. */
export type BucketModelos = {
    list(pasta: string): Promise<Resposta<Array<{ name: string; updated_at?: string | null; created_at?: string | null }>>>;
    download(caminho: string): Promise<Resposta<Blob>>;
    upload(caminho: string, bytes: Uint8Array, opcoes?: { upsert?: boolean; contentType?: string }): Promise<Resposta<unknown>>;
    remove(caminhos: string[]): Promise<Resposta<unknown>>;
};

/** O modelo pode existir, mas não deu para ler agora (rede, Storage fora). */
export class ModeloIndisponivel extends Error {
    constructor(onde: string, causa: unknown) {
        super(`não consegui ${onde}: ${causa instanceof Error ? causa.message : JSON.stringify(causa)}`);
        this.name = "ModeloIndisponivel";
    }
}

async function listar(bucket: BucketModelos) {
    const { data, error } = await bucket.list(PASTA);
    if (error || !data) throw new ModeloIndisponivel("listar os modelos", error);
    return data;
}

/** Bytes da versão; `null` SÓ quando ela não existe. Qualquer falha lança. */
export async function lerVersao(bucket: BucketModelos, versao: VersaoModelo): Promise<Uint8Array | null> {
    const nome = CAMINHO[versao].slice(PASTA.length + 1);
    if (!(await listar(bucket)).some((o) => o.name === nome)) return null;
    const { data, error } = await bucket.download(CAMINHO[versao]);
    if (error || !data) throw new ModeloIndisponivel(`baixar o modelo (${versao})`, error);
    return new Uint8Array(await data.arrayBuffer());
}

/** Quando cada versão foi gravada. Falha ao listar lança, em vez de dizer "nenhuma". */
export async function infoVersoes(bucket: BucketModelos): Promise<InfoModelos> {
    const itens = await listar(bucket);
    const achar = (versao: VersaoModelo) => {
        const o = itens.find((x) => x.name === CAMINHO[versao].slice(PASTA.length + 1));
        return o ? { atualizadoEm: o.updated_at ?? o.created_at ?? "" } : null;
    };
    return { atual: achar("atual"), anterior: achar("anterior") };
}
