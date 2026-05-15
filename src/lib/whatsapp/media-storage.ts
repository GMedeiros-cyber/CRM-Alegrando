import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchWithTimeout } from "@/lib/fetch-utils";

type MediaType = "audio" | "image" | "video" | "document" | "sticker";

const AUDIO_BUCKET = "audios";
const DOC_BUCKET = "documents";
const FESTAS_DOC_PREFIX = "chat-festas";

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

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

function bucketAndPathForEvolution(
  mediaType: MediaType,
  telefone: string,
  fileName: string | undefined,
  ext: string,
): { bucket: string; path: string } {
  const digits = telefone.replace(/\D/g, "");
  const ts = Date.now();
  if (mediaType === "audio") {
    return { bucket: AUDIO_BUCKET, path: `${digits}/${ts}.${ext}` };
  }
  const baseName = fileName && fileName.length > 0
    ? sanitizeFileName(fileName)
    : `${ts}.${ext}`;
  const safeName = baseName.includes(".") ? baseName : `${baseName}.${ext}`;
  return {
    bucket: DOC_BUCKET,
    path: `${FESTAS_DOC_PREFIX}/${digits}/${ts}-${safeName}`,
  };
}

function bucketAndPathForZapi(
  mediaType: MediaType,
  telefone: string,
  ext: string,
  fileName?: string,
): { bucket: string; path: string } {
  const digits = telefone.replace(/\D/g, "");
  const ts = Date.now();
  if (mediaType === "audio") {
    return { bucket: AUDIO_BUCKET, path: `${digits}/${ts}.${ext}` };
  }
  const safeName = fileName
    ? sanitizeFileName(fileName.includes(".") ? fileName : `${fileName}.${ext}`)
    : `${ts}.${ext}`;
  return {
    bucket: DOC_BUCKET,
    path: `chat-alegrando/${digits}/${ts}-${safeName}`,
  };
}

export interface ProxyMediaResult {
  publicUrl: string;
  mimeType: string;
  bucket: string;
  path: string;
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
 * e faz upload pro Supabase Storage. Usar quando o conteúdo bruto vem como URL
 * `mmg.whatsapp.net/...enc` (canal festas) — `fetch` direto não decodifica.
 */
export async function proxyMediaFromEvolution(
  supabase: SupabaseClient,
  params: ProxyFromEvolutionParams,
): Promise<ProxyMediaResult | null> {
  const { key, message, telefone, mediaType } = params;
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
    const fileName = mediaType === "document" ? body.fileName : undefined;
    const { bucket, path } = bucketAndPathForEvolution(mediaType, telefone, fileName, ext);
    const buffer = Buffer.from(body.base64, "base64");

    const { error: upErr } = await supabase.storage
      .from(bucket)
      .upload(path, buffer, { contentType: mimetype, upsert: true });

    if (upErr) {
      console.error(`[MEDIA-PROXY-EVO] Upload falhou (${bucket}/${path}):`, upErr.message);
      return null;
    }

    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
    return { publicUrl: pub.publicUrl, mimeType: mimetype, bucket, path };
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
 * Faz download da URL pública (ex: Backblaze da Z-API) e faz upload no Storage.
 * Generalização do antigo `proxyAudioToStorage` para qualquer tipo de mídia.
 * Áudio → bucket `audios`; demais → bucket `documents/chat-alegrando/...`.
 *
 * Se `sourceUrl` já aponta para o Storage do Supabase, retorna a própria URL
 * (idempotência).
 */
export async function proxyMediaFromZapi(
  supabase: SupabaseClient,
  sourceUrl: string,
  telefone: string,
  messageId: string,
  mediaType: MediaType,
  fileName?: string,
): Promise<ProxyMediaResult | null> {
  if (!sourceUrl || !messageId) return null;

  const targetBucket = mediaType === "audio" ? AUDIO_BUCKET : DOC_BUCKET;
  const { data: prefixData } = supabase.storage.from(targetBucket).getPublicUrl("x");
  const publicPrefix = prefixData.publicUrl.slice(0, -1);
  if (sourceUrl.startsWith(publicPrefix)) {
    return { publicUrl: sourceUrl, mimeType: "", bucket: targetBucket, path: "" };
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

    const { bucket, path } = bucketAndPathForZapi(mediaType, telefone, ext, fileName);

    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, buffer, { contentType, upsert: true });

    if (error) {
      console.error(`[MEDIA-PROXY-ZAPI] Upload falhou (${bucket}/${path}):`, error.message);
      return null;
    }

    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
    return { publicUrl: pub.publicUrl, mimeType: contentType, bucket, path };
  } catch (err) {
    console.error("[MEDIA-PROXY-ZAPI] Exceção:", err);
    return null;
  }
}
