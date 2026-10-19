"use server";

import { requireAuth } from "@/lib/auth";
import { LIMITE_MODELO_BYTES, validarModeloContrato } from "@/lib/contrato-docx";
import { infoModelos, trocarModelo, voltarParaAnterior, type InfoModelos } from "@/lib/modelo-contrato-storage";

// Arquivo "use server": só funções async exportadas (SKILL §8, item 11).

/** `info: null` = gravou, mas a releitura do bucket falhou agora. */
type Resultado = { ok: true; info: InfoModelos | null } | { ok: false; error: string };

const releitura = () => infoModelos().catch((e) => { console.error("[modelos]", e instanceof Error ? e.message : e); return null; });

export async function infoModeloContrato(): Promise<InfoModelos> {
    await requireAuth();
    return infoModelos();
}

/**
 * Recebe um modelo novo. Analisado pelo docxtemplater ANTES de aceitar: tag
 * quebrada ou campo desconhecido é recusado, dizendo qual. Só então o atual
 * vira o anterior e o novo entra.
 */
export async function enviarModeloContrato(form: FormData): Promise<Resultado> {
    await requireAuth();
    const arquivo = form.get("arquivo");
    if (!(arquivo instanceof File) || arquivo.size === 0) return { ok: false, error: "Escolha um arquivo .docx." };
    if (!/\.docx$/i.test(arquivo.name)) return { ok: false, error: "O modelo precisa ser um arquivo do Word (.docx)." };
    if (arquivo.size > LIMITE_MODELO_BYTES) return { ok: false, error: "O arquivo passa de 4 MB." };
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    const motivo = validarModeloContrato(bytes);
    if (motivo) return { ok: false, error: motivo };
    try {
        await trocarModelo(bytes);
    } catch (e) {
        console.error("[modelos] falha ao gravar modelo de contrato:", e instanceof Error ? e.message : e);
        return { ok: false, error: "Não foi possível guardar o modelo agora. Tente de novo." };
    }
    return { ok: true, info: await releitura() };
}

export async function voltarModeloAnterior(): Promise<Resultado> {
    await requireAuth();
    try {
        if (!(await voltarParaAnterior())) return { ok: false, error: "Não há versão anterior guardada." };
    } catch (e) {
        console.error("[modelos] falha ao voltar o modelo:", e instanceof Error ? e.message : e);
        return { ok: false, error: "Não foi possível voltar para a versão anterior agora." };
    }
    return { ok: true, info: await releitura() };
}
