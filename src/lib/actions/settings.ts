"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";

import { validarSetting } from "@/lib/mensagem-placeholders";
import { lerSetting } from "@/lib/settings-leitura";

// =============================================
// GET
// =============================================

/**
 * Busca uma configuração do CRM pela chave — para quem chama do NAVEGADOR.
 * Exige sessão: server action pode ser invocada por qualquer página, inclusive
 * as públicas do proxy (/sign-in), e sem esta checagem devolvia os textos a
 * quem não está logado. Código de servidor (cron, actions que já fizeram
 * requireAuth, páginas) usa `lerSetting` de lib/settings-leitura.ts.
 */
export async function getSetting(chave: string): Promise<string> {
    await requireAuth();
    return lerSetting(chave);
}

// =============================================
// UPDATE
// =============================================

/**
 * Atualiza (ou insere) uma configuração do CRM.
 *
 * Mensagem com texto vazio ou placeholder fora do catálogo DAQUELA chave é
 * recusada aqui, não só na tela: o envio mandaria `{nmoe}` literal ao cliente.
 * Recusa volta como `{ success: false, error }`, e não como exceção — em
 * produção o Next troca a mensagem de erro de server action por um digest, e
 * a tela não saberia dizer qual placeholder corrigir.
 */
export async function updateSetting(
    chave: string,
    valor: string
): Promise<{ success: true } | { success: false; error: string }> {
    await requireAuth();
    const recusa = validarSetting(chave, valor);
    if (recusa) return { success: false, error: recusa };
    const supabase = createServerSupabaseClient();

    const { error } = await supabase.from("crm_settings").upsert(
        {
            chave,
            valor,
            updated_at: new Date().toISOString(),
        },
        { onConflict: "chave" }
    );

    if (error) {
        throw new Error(`Erro ao salvar configuração: ${error.message}`);
    }

    return { success: true };
}


