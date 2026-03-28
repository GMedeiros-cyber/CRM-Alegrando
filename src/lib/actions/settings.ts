"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";

import { SETTING_DEFAULTS } from "@/lib/settings_helper";

// =============================================
// GET
// =============================================

/**
 * Busca uma configuração do CRM pela chave.
 * Retorna o valor salvo ou o fallback padrão.
 */
export async function getSetting(chave: string): Promise<string> {
    const supabase = createServerSupabaseClient();
    const { data } = await supabase
        .from("crm_settings")
        .select("valor")
        .eq("chave", chave)
        .maybeSingle();

    return data?.valor ?? SETTING_DEFAULTS[chave] ?? "";
}

// =============================================
// UPDATE
// =============================================

/**
 * Atualiza (ou insere) uma configuração do CRM.
 */
export async function updateSetting(
    chave: string,
    valor: string
): Promise<{ success: boolean }> {
    await requireAuth();
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


