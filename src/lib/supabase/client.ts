import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Token de sessão do Clerk pro Supabase (Third-Party Auth Clerk↔Supabase já
 * configurado no dashboard). Quando há sessão Clerk ativa, o browser passa a
 * falar com o Supabase como `authenticated` em vez de `anon`.
 *
 * Como `supabase` é um singleton de módulo (não um hook/provider), usamos o
 * `window.Clerk` global — não dá pra usar o hook `useAuth()` aqui. Sem sessão
 * (ou Clerk ainda não carregado) retorna null → cai em `anon`. Hoje as policies
 * de `messages` ainda são públicas, então isso não muda o comportamento atual;
 * só passa a importar quando o RLS for fechado pra `authenticated`.
 */
async function getClerkToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const clerk = (window as unknown as {
    Clerk?: { session?: { getToken?: () => Promise<string | null> } | null };
  }).Clerk;
  try {
    return (await clerk?.session?.getToken?.()) ?? null;
  } catch {
    return null;
  }
}

// `accessToken` (supabase-js v2) cobre PostgREST e Realtime: o socket também
// conecta autenticado quando há sessão Clerk.
export const supabase = createClient(supabaseUrl, supabaseKey, {
  accessToken: getClerkToken,
});
