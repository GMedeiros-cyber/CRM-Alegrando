import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchWithTimeout } from "@/lib/fetch-utils";
import { putMediaDeduped } from "./r2-client";

type MediaType = "audio" | "image" | "video" | "document" | "sticker";

// Toda mídia do WhatsApp (áudio incluído) vai pro Cloudflare R2, com dedup por
// hash. Só o bucket `avatars` (fotos de perfil) continua no Supabase Storage,
// via photo-storage.ts.
const R2_BUCKET = "alegrando-media";

// Mapa mime → ext alinhado com o nó ConvertToBinary do Fluxo Marcia (n8n).
// Mantém paridade com o que o n8n estava gravando antes da migração pro Next.js.
const MIME_TO_EXT: Record<string, string> = {
  "audio/ogg": "ogg",
  "audio/opus": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/webm": "webm",
  "audio/wav": "wav",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "application/pdf": "pdf",
};

function extFromMime(mime: string | undefined, mediaType: MediaType): string {
  if (mime) {
    const direct = MIME_TO_EXT[mime.toLowerCase()];
    if (direct) return direct;
    for (const key of Object.keys(MIME_TO_EXT)) {
      if (mime.toLowerCase().startsWith(key)) return MIME_TO_EXT[key];
    }
  }
  switch (mediaType) {
    case "audio": return "ogg";
    case "image": return "jpg";
    case "video": return "mp4";
    case "sticker": return "webp";
    case "document": return "bin";
  }
}

function extFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const m = /\.([a-zA-Z0-9]{1,5})$/.exec(u.pathname);
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

export interface ProxyMediaResult {
  publicUrl: string;
  mimeType: string;
  bucket: string;
  path: string;
}

/**
 * Upload de mídia do WhatsApp (qualquer tipo — imagem, vídeo, documento, sticker
 * e áudio) pro Cloudflare R2, com dedup GLOBAL por hash de conteúdo.
 *
 * O path é determinístico pelo SHA-256 do arquivo (`shared/<hash>.<ext>`), então
 * arquivos idênticos — mesmo vindos de telefones diferentes — colidem no mesmo
 * objeto: só existe 1 cópia no R2. Se o objeto já existe, pula o upload e retorna
 * a URL existente (é o que teria evitado as 102 duplicatas do vídeo institucional
 * mandado pra 16 telefones). A rastreabilidade por telefone/canal fica na tabela
 * `messages`, não no path do arquivo.
 */
async function uploadDocMediaToR2(
  buffer: Buffer,
  ext: string,
  contentType: string,
): Promise<ProxyMediaResult> {
  const { publicUrl, path } = await putMediaDeduped(buffer, ext, contentType);
  return { publicUrl, mimeType: contentType, bucket: R2_BUCKET, path };
}

interface EvoKey {
  id?: string;
  remoteJid?: string;
  fromMe?: boolean;
}

interface EvoInnerMessage {
  audioMessage?: { mimetype?: string; seconds?: number };
  imageMessage?: { mimetype?: string; caption?: string };
  videoMessage?: { mimetype?: string; caption?: string };
  documentMessage?: { mimetype?: string; fileName?: string; caption?: string };
  stickerMessage?: { mimetype?: string };
}

interface ProxyFromEvolutionParams {
  key: EvoKey;
  message: EvoInnerMessage;
  telefone: string;
  mediaType: MediaType;
}

interface EvoBase64Response {
  base64?: string;
  mediaType?: string;
  mimetype?: string;
  fileName?: string;
}

/**
 * Baixa mídia decifrada via Evolution API (`/chat/getBase64FromMediaMessage`)
 * e sobe pro Cloudflare R2. Usar quando o conteúdo bruto vem como URL
 * `mmg.whatsapp.net/...enc` (canal festas) — `fetch` direto não decodifica.
 */
export async function proxyMediaFromEvolution(
  supabase: SupabaseClient,
  params: ProxyFromEvolutionParams,
): Promise<ProxyMediaResult | null> {
  const { key, message, mediaType } = params;
  const url = process.env.EVOLUTION_API_URL;
  const instance = process.env.EVOLUTION_INSTANCE;
  const apiKey = process.env.EVOLUTION_API_KEY;
  if (!url || !instance || !apiKey) {
    console.error("[MEDIA-PROXY-EVO] Evolution não configurada (URL/INSTANCE/KEY)");
    return null;
  }
  if (!key?.id) {
    console.error("[MEDIA-PROXY-EVO] sem key.id");
    return null;
  }

  try {
    const res = await fetchWithTimeout(
      `${url}/chat/getBase64FromMediaMessage/${instance}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: apiKey },
        body: JSON.stringify({
          message: { key, message },
          convertToMp4: false,
        }),
      },
      15_000,
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(
        `[MEDIA-PROXY-EVO] Evolution retornou ${res.status} para msg ${key.id}: ${errText.slice(0, 200)}`,
      );
      return null;
    }

    const body = (await res.json()) as EvoBase64Response;
    if (!body.base64) {
      console.error(`[MEDIA-PROXY-EVO] sem base64 na resposta para msg ${key.id}`);
      return null;
    }

    const mimetype = body.mimetype || guessMimeForType(mediaType);
    const ext = extFromMime(mimetype, mediaType);
    const buffer = Buffer.from(body.base64, "base64");

    // Toda mídia (áudio incluído) → Cloudflare R2 com dedup global por hash.
    return await uploadDocMediaToR2(buffer, ext, mimetype);
  } catch (err) {
    console.error("[MEDIA-PROXY-EVO] Exceção:", err);
    return null;
  }
}

function guessMimeForType(mediaType: MediaType): string {
  switch (mediaType) {
    case "audio": return "audio/ogg";
    case "image": return "image/jpeg";
    case "video": return "video/mp4";
    case "sticker": return "image/webp";
    case "document": return "application/octet-stream";
  }
}

/**
 * Faz download da URL pública (ex: Backblaze da Z-API) e sobe pro Cloudflare R2.
 * Generalização do antigo `proxyAudioToStorage` para qualquer tipo de mídia —
 * áudio incluído (dedup global por hash, igual aos demais tipos).
 *
 * Se `sourceUrl` já aponta para o R2, retorna a própria URL (idempotência).
 */
export async function proxyMediaFromZapi(
  supabase: SupabaseClient,
  sourceUrl: string,
  telefone: string,
  messageId: string,
  mediaType: MediaType,
): Promise<ProxyMediaResult | null> {
  if (!sourceUrl || !messageId) return null;

  // Idempotência: se a sourceUrl já é do R2 (nosso storage), não re-baixa/re-sobe.
  if (process.env.R2_PUBLIC_URL && sourceUrl.startsWith(process.env.R2_PUBLIC_URL)) {
    return { publicUrl: sourceUrl, mimeType: "", bucket: R2_BUCKET, path: "" };
  }

  try {
    const res = await fetch(sourceUrl);
    if (!res.ok) {
      console.error(
        `[MEDIA-PROXY-ZAPI] Download ${res.status} de ${sourceUrl.slice(0, 120)}`,
      );
      return null;
    }

    const contentType = res.headers.get("content-type") || guessMimeForType(mediaType);
    const buffer = Buffer.from(await res.arrayBuffer());

    const ext =
      extFromUrl(sourceUrl) ||
      MIME_TO_EXT[contentType.toLowerCase()] ||
      (mediaType === "audio" ? extFromContentType(contentType) : extFromMime(contentType, mediaType));

    // Toda mídia (áudio incluído) → Cloudflare R2 com dedup global por hash.
    return await uploadDocMediaToR2(buffer, ext, contentType);
  } catch (err) {
    console.error("[MEDIA-PROXY-ZAPI] Exceção:", err);
    return null;
  }
}
