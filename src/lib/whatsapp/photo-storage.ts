import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "avatars";

function getPublicUrlPrefix(supabase: SupabaseClient): string {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl("x");
  return data.publicUrl.slice(0, -1);
}

function extFromContentType(ct: string): string {
  const lower = ct.toLowerCase();
  if (lower.includes("png")) return "png";
  if (lower.includes("webp")) return "webp";
  if (lower.includes("gif")) return "gif";
  if (lower.includes("svg")) return "svg";
  return "jpg";
}

/**
 * Faz download da foto de perfil na URL de origem (WhatsApp pps.whatsapp.net /
 * mmg.whatsapp.net etc.) e sobe para o bucket `avatars` do Supabase Storage,
 * retornando uma URL pública permanente. URLs do WhatsApp expiram em ~6 dias
 * (parâmetro `oe=` no querystring), então cacheamos no Storage para a foto
 * nunca sumir do CRM.
 *
 * Idempotente: se `sourceUrl` já aponta para o nosso Storage, devolve a própria
 * URL sem refazer o upload.
 *
 * O nome do arquivo é determinístico (`<telefone-sanitizado>.jpg`), portanto
 * fotos novas substituem a anterior (upsert) — mantemos sempre a mais recente.
 */
export async function proxyPhotoToStorage(
  supabase: SupabaseClient,
  sourceUrl: string,
  telefone: string
): Promise<string | null> {
  if (!sourceUrl || !telefone) return null;

  const publicPrefix = getPublicUrlPrefix(supabase);
  if (sourceUrl.startsWith(publicPrefix)) {
    return sourceUrl;
  }

  try {
    const res = await fetch(sourceUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AlegrandoCRM/1.0)" },
    });
    if (!res.ok) {
      console.error(`[PHOTO-PROXY] Download ${res.status} de ${sourceUrl.slice(0, 120)}`);
      return null;
    }

    const contentType = res.headers.get("content-type") || "image/jpeg";
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength === 0) {
      console.warn("[PHOTO-PROXY] Resposta vazia para", sourceUrl.slice(0, 120));
      return null;
    }

    const ext = extFromContentType(contentType);
    const safeTelefone = telefone.replace(/[^a-zA-Z0-9_-]/g, "_");
    const path = `${safeTelefone}.${ext}`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType, upsert: true });

    if (error) {
      console.error("[PHOTO-PROXY] Upload falhou:", error.message);
      return null;
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    // Cache-bust para o navegador pegar a foto nova quando ela muda
    return `${data.publicUrl}?v=${Date.now()}`;
  } catch (err) {
    console.error("[PHOTO-PROXY] Exceção:", err);
    return null;
  }
}
