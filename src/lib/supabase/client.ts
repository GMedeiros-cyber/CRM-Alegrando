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
 * (ou Clerk ainda não carregado) retorna null → cai em `anon`.
 *
 * **O RLS de `messages` JÁ está fechado pra `authenticated`** — este comentário
 * dizia o contrário e ficou desatualizado. Medido: a mesma consulta devolve 0
 * linhas com a chave anon e 3 com a service key. Cair em `anon` não é mais
 * degradação silenciosa, é a conversa inteira sumir da tela.
 *
 * **Armadilha de ambiente local.** O `.env.local` aponta pro MESMO banco de
 * produção, mas usa uma instância de DESENVOLVIMENTO do Clerk (`pk_test_…`,
 * domínio `*.clerk.accounts.dev`), enquanto a produção usa `pk_live_…` em
 * `clerk.alegrando.cloud`. O Third-Party Auth do Supabase confia num emissor
 * só — o de produção. Então, rodando local, o token do Clerk é recusado, o
 * cliente vira `anon` e **as mensagens não aparecem**, embora os leads apareçam
 * (esses vêm de server actions, que usam a service key e não passam por RLS).
 * Não é banco errado nem credencial errada de Supabase: é o emissor do Clerk.
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
