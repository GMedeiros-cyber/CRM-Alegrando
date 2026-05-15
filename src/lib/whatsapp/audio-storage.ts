import type { SupabaseClient } from "@supabase/supabase-js";
import { proxyMediaFromZapi } from "./media-storage";

/**
 * @deprecated Use `proxyMediaFromZapi` de `@/lib/whatsapp/media-storage`.
 *
 * Mantido como shim porque os webhooks da Z-API (e os blocos de grupo) ainda
 * importam o nome antigo. Em PR seguinte, migrar call sites e remover.
 */
export async function proxyAudioToStorage(
  supabase: SupabaseClient,
  sourceUrl: string,
  telefone: string,
  messageId: string,
): Promise<string | null> {
  const result = await proxyMediaFromZapi(
    supabase,
    sourceUrl,
    telefone,
    messageId,
    "audio",
  );
  return result?.publicUrl ?? null;
}
