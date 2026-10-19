import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { InfoModelos } from "@/lib/contrato-campos";
import { CAMINHO, infoVersoes, lerVersao, type BucketModelos, type VersaoModelo } from "@/lib/modelo-contrato-versoes";

/**
 * O modelo do contrato mora no bucket `modelos` do Supabase: PRIVADO, só
 * .docx, até 5 MB, sem policy em storage.objects — só o service role, no
 * servidor, lê e escreve. O repositório é público: o modelo real da Alegrando
 * nunca entra no git (fica em `.local/`, ignorado).
 *
 * Duas versões, para dar volta: `contrato/atual.docx` e `contrato/anterior.docx`.
 * A lógica de leitura (e o que é "não existe" x "não consegui ler") está em
 * `modelo-contrato-versoes.ts`; aqui só se liga o Supabase.
 */
const BUCKET = "modelos";
export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export { ModeloIndisponivel } from "@/lib/modelo-contrato-versoes";
export type { InfoModelos, VersaoModelo };

const bucket = (): BucketModelos => createServerSupabaseClient().storage.from(BUCKET);

/** Bytes da versão; `null` só se ela não existe. Falha de leitura lança `ModeloIndisponivel`. */
export const lerModelo = (versao: VersaoModelo) => lerVersao(bucket(), versao);

/** Quando cada versão foi gravada. Falha ao listar lança `ModeloIndisponivel`. */
export const infoModelos = (): Promise<InfoModelos> => infoVersoes(bucket());

async function gravar(versao: VersaoModelo, bytes: Uint8Array): Promise<void> {
    const { error } = await bucket().upload(CAMINHO[versao], bytes, { upsert: true, contentType: DOCX_MIME });
    if (error) throw new Error(`Falha ao gravar o modelo (${versao}): ${(error as { message?: string }).message ?? error}`);
}

/**
 * O atual vira o anterior, o novo vira o atual. Se a leitura do atual falhar,
 * `lerModelo` lança e nada é gravado — antes, a falha virava "não existe" e o
 * atual era sobrescrito sem ir para o anterior.
 */
export async function trocarModelo(novo: Uint8Array): Promise<void> {
    const atual = await lerModelo("atual");
    if (atual) await gravar("anterior", atual);
    await gravar("atual", novo);
}

/** Troca atual e anterior de lugar — então "voltar" também se desfaz. */
export async function voltarParaAnterior(): Promise<boolean> {
    const [atual, anterior] = await Promise.all([lerModelo("atual"), lerModelo("anterior")]);
    if (!anterior) return false;
    await gravar("atual", anterior);
    if (atual) await gravar("anterior", atual);
    return true;
}
