import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { InfoModelos } from "@/lib/contrato-campos";

/**
 * O modelo do contrato mora no bucket `modelos` do Supabase: PRIVADO, só
 * .docx, até 5 MB, sem policy em storage.objects — só o service role, no
 * servidor, lê e escreve. O repositório é público: o modelo real da Alegrando
 * nunca entra no git (fica em `.local/`, ignorado).
 *
 * Duas versões, para dar volta: `contrato/atual.docx` e `contrato/anterior.docx`.
 */
const BUCKET = "modelos";
const CAMINHO = { atual: "contrato/atual.docx", anterior: "contrato/anterior.docx" } as const;
export type VersaoModelo = keyof typeof CAMINHO;
export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function lerModelo(versao: VersaoModelo): Promise<Uint8Array | null> {
    const { data, error } = await createServerSupabaseClient().storage.from(BUCKET).download(CAMINHO[versao]);
    if (error || !data) return null;
    return new Uint8Array(await data.arrayBuffer());
}

async function gravar(versao: VersaoModelo, bytes: Uint8Array): Promise<void> {
    const { error } = await createServerSupabaseClient().storage
        .from(BUCKET)
        .upload(CAMINHO[versao], bytes, { upsert: true, contentType: DOCX_MIME });
    if (error) throw new Error(`Falha ao gravar o modelo (${versao}): ${error.message}`);
}

export type { InfoModelos };

export async function infoModelos(): Promise<InfoModelos> {
    const { data } = await createServerSupabaseClient().storage.from(BUCKET).list("contrato");
    const achar = (nome: string) => {
        const o = data?.find((x) => x.name === nome);
        return o ? { atualizadoEm: o.updated_at ?? o.created_at ?? "" } : null;
    };
    return { atual: achar("atual.docx"), anterior: achar("anterior.docx") };
}

/** O atual vira o anterior, o novo vira o atual. */
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
