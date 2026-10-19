import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { InfoModelos } from "@/lib/contrato-campos";
import { infoVersoes, lerVersao, trocarVersao, voltarVersao, type BucketModelos, type VersaoModelo } from "@/lib/modelo-contrato-versoes";

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

/**
 * Envio de versão nova: o atual vira o anterior. Leitura que falha lança antes
 * de gravar, e a troca em dois passos não perde versão se uma gravação falhar
 * (`trocarVersao`, testada em modelo-contrato-versoes.test.ts).
 */
export const trocarModelo = (novo: Uint8Array) => trocarVersao(bucket(), novo);

/** Troca atual e anterior de lugar, com a mesma garantia (`voltarVersao`). */
export const voltarParaAnterior = () => voltarVersao(bucket());
