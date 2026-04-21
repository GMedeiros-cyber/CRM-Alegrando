import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "audios";

function getPublicUrlPrefix(supabase: SupabaseClient): string {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl("x");
  // Prefixo sem o "x" — tudo antes de "/x" é o path base do bucket
  return data.publicUrl.slice(0, -1);
}

function extFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const path = u.pathname;
    const m = /\.([a-zA-Z0-9]{1,5})$/.exec(path);
    return m ? m[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

function extFromContentType(ct: string): string {
  const lower = ct.toLowerCase();
  if (lower.includes("ogg") || lower.includes("opus")) return "ogg";
  if (lower.includes("webm")) return "webm";
  if (lower.includes("mpeg") || lower.includes("mp3")) return "mp3";
  if (lower.includes("wav")) return "wav";
  if (lower.includes("mp4") || lower.includes("m4a")) return "m4a";
  return "ogg";
}

/**
 * Faz download do áudio na URL de origem (ex: backblazeb2 da Z-API) e faz
 * upload para o bucket `audios` do Supabase Storage. Retorna a URL pública
 * permanente ou null em caso de falha.
 *
 * Se `sourceUrl` já aponta para o Storage do Supabase, retorna a própria URL
 * sem refazer o upload (idempotência).
 */
export async function proxyAudioToStorage(
  supabase: SupabaseClient,
  sourceUrl: string,
  telefone: string,
  messageId: string
): Promise<string | null> {
  if (!sourceUrl || !messageId) return null;

  const publicPrefix = getPublicUrlPrefix(supabase);
  if (sourceUrl.startsWith(publicPrefix)) {
    return sourceUrl;
  }

  try {
    const res = await fetch(sourceUrl);
    if (!res.ok) {
      console.error(`[AUDIO-PROXY] Download ${res.status} de ${sourceUrl.slice(0, 120)}`);
      return null;
    }

    const contentType = res.headers.get("content-type") || "audio/ogg";
    const buffer = Buffer.from(await res.arrayBuffer());

    const ext = extFromUrl(sourceUrl) || extFromContentType(contentType);
    const digits = telefone.replace(/\D/g, "");
    const safeId = messageId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const path = `${digits}/${safeId}.${ext}`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType, upsert: true });

    if (error) {
      console.error("[AUDIO-PROXY] Upload falhou:", error.message);
      return null;
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
  } catch (err) {
    console.error("[AUDIO-PROXY] Exceção:", err);
    return null;
  }
}
