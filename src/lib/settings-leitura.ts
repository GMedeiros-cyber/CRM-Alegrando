import { createServerSupabaseClient } from "@/lib/supabase/server";
import { SETTING_DEFAULTS } from "@/lib/settings_helper";

/**
 * Leitura de `crm_settings` para código de SERVIDOR: o cron (sem sessão), as
 * server actions que já fizeram `requireAuth` e as páginas renderizadas no
 * servidor.
 *
 * Sem "use server" de propósito. A action exportada `getSetting`
 * (lib/actions/settings.ts) exige sessão, porque server action pode ser
 * invocada por QUALQUER página, inclusive as públicas do proxy (/sign-in).
 * Pôr `requireAuth` direto na leitura quebraria o follow-up, que roda sem
 * sessão — por isso as duas portas.
 *
 * Usa o service role: nunca importar em arquivo "use client".
 */
export async function lerSetting(chave: string): Promise<string> {
    const { data } = await createServerSupabaseClient()
        .from("crm_settings")
        .select("valor")
        .eq("chave", chave)
        .maybeSingle();
    return data?.valor ?? SETTING_DEFAULTS[chave] ?? "";
}
