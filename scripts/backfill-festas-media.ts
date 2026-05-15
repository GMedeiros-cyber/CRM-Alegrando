/**
 * Backfill de mídia do canal festas.
 *
 * Problema: mensagens antigas têm content apontando pra URLs encriptadas
 * (mmg.whatsapp.net/...enc) porque o Fluxo Marcia (n8n) falhava no INSERT
 * por causa do índice único — o arquivo decifrado ficava no Storage mas o DB
 * continuava referenciando a URL .enc ilegível pelo browser.
 *
 * O script chama POST /chat/getBase64FromMediaMessage/{instance} da Evolution
 * API pra cada mensagem candidata, faz upload do conteúdo decifrado pro
 * Supabase Storage e atualiza o content com a URL permanente.
 *
 * Uso:
 *   npm run backfill:festas-media               # processa todas
 *   npm run backfill:festas-media -- --dry-run   # só loga, sem UPDATE
 *   npm run backfill:festas-media -- --telefone=5511981753545
 *   npm run backfill:festas-media -- --tipo=audio
 *   npm run backfill:festas-media -- --limit=50
 *
 * Env vars necessárias (em .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   EVOLUTION_API_URL        ex: https://evo.alegrando.cloud
 *   EVOLUTION_API_KEY
 *   EVOLUTION_INSTANCE       ex: Festas
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

// ─── Args ─────────────────────────────────────────────────────────────────────
const DRY_RUN = process.argv.includes("--dry-run");
const telefoneArg = process.argv.find((a) => a.startsWith("--telefone="))?.split("=")[1];
const tipoArg = process.argv.find((a) => a.startsWith("--tipo="))?.split("=")[1] as MediaType | undefined;
const limitArg = process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1];
const LIMIT = limitArg ? parseInt(limitArg, 10) : undefined;
const DELAY_MS = 300; // entre chamadas à Evolution API

// ─── Env ──────────────────────────────────────────────────────────────────────
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const EVO_URL = process.env.EVOLUTION_API_URL!;
const EVO_KEY = process.env.EVOLUTION_API_KEY!;
const EVO_INSTANCE = process.env.EVOLUTION_INSTANCE!;

for (const [k, v] of Object.entries({ NEXT_PUBLIC_SUPABASE_URL: SB_URL, SUPABASE_SERVICE_ROLE_KEY: SB_KEY, EVOLUTION_API_URL: EVO_URL, EVOLUTION_API_KEY: EVO_KEY, EVOLUTION_INSTANCE: EVO_INSTANCE })) {
  if (!v) { console.error(`Faltando env var: ${k}`); process.exit(1); }
}

const supabase = createClient(SB_URL, SB_KEY);

// ─── Tipos ────────────────────────────────────────────────────────────────────
type MediaType = "audio" | "image" | "video" | "document" | "sticker";

const MEDIA_TYPES: MediaType[] = ["audio", "image", "video", "document", "sticker"];

const MIME_TO_EXT: Record<string, string> = {
  "audio/ogg": "ogg", "audio/opus": "ogg", "audio/mpeg": "mp3",
  "audio/mp3": "mp3", "audio/mp4": "m4a", "audio/webm": "webm",
  "audio/wav": "wav", "image/jpeg": "jpg", "image/jpg": "jpg",
  "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
  "application/pdf": "pdf",
};

function extFromMime(mime: string, mediaType: MediaType): string {
  const direct = MIME_TO_EXT[mime.toLowerCase()];
  if (direct) return direct;
  for (const [k, v] of Object.entries(MIME_TO_EXT)) {
    if (mime.toLowerCase().startsWith(k)) return v;
  }
  const fallbacks: Record<MediaType, string> = { audio: "ogg", image: "jpg", video: "mp4", document: "bin", sticker: "webp" };
  return fallbacks[mediaType];
}

function sanitizeName(s: string) {
  return s.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
}

// ─── Paths no Storage ─────────────────────────────────────────────────────────
function storagePath(mediaType: MediaType, telefone: string, messageId: string, ext: string, fileName?: string): { bucket: string; path: string } {
  const digits = telefone.replace(/\D/g, "");
  const safeId = sanitizeName(messageId);
  if (mediaType === "audio") {
    return { bucket: "audios", path: `${digits}/bf-${safeId}.${ext}` };
  }
  // Com fileName: bf-{id}-{fileName}  →  idempotência + nome legível
  // Sem fileName: bf-{id}.{ext}
  const suffix = fileName
    ? `-${sanitizeName(fileName)}`
    : `.${ext}`;
  const safeSuffix = suffix.includes(".") ? suffix : `${suffix}.${ext}`;
  return { bucket: "documents", path: `chat-festas/${digits}/bf-${safeId}${safeSuffix}` };
}

// ─── Evolution API ────────────────────────────────────────────────────────────
interface EvoBase64Response {
  base64?: string;
  mimetype?: string;
  fileName?: string;
  seconds?: number;
}

async function fetchBase64(messageId: string, remoteJid: string, fromMe: boolean): Promise<EvoBase64Response | null> {
  try {
    const res = await fetch(`${EVO_URL}/chat/getBase64FromMediaMessage/${EVO_INSTANCE}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: EVO_KEY },
      body: JSON.stringify({
        message: {
          key: { id: messageId, remoteJid, fromMe },
          // message field não é enviado — Evolution resolve pelo messageId
        },
        convertToMp4: false,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(`    Evolution ${res.status}: ${text.slice(0, 200)}`);
      return null;
    }
    return await res.json() as EvoBase64Response;
  } catch (err) {
    console.warn(`    Evolution fetch error: ${err}`);
    return null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseContent(content: string): { url: string; caption: string } {
  const idx = content.indexOf("|||");
  if (idx !== -1) return { url: content.slice(0, idx), caption: content.slice(idx + 3) };
  return { url: content, caption: "" };
}

function buildContent(mediaType: MediaType, publicUrl: string, caption: string): string {
  if (mediaType === "audio" || mediaType === "sticker") return publicUrl;
  return caption ? `${publicUrl}|||${caption}` : publicUrl;
}

function isEncUrl(url: string): boolean {
  return url.includes("mmg.whatsapp.net") || url.endsWith(".enc") || url.includes(".enc?");
}

function getSupabasePubPrefix(bucket: string): string {
  const { data } = supabase.storage.from(bucket).getPublicUrl("x");
  return data.publicUrl.slice(0, -1);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=".repeat(60));
  console.log(`backfill-festas-media | MODE=${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  if (telefoneArg) console.log(`  Filtro telefone: ${telefoneArg}`);
  if (tipoArg) console.log(`  Filtro tipo: ${tipoArg}`);
  if (LIMIT) console.log(`  Limite: ${LIMIT}`);
  console.log("=".repeat(60));

  const audioPubPrefix = getSupabasePubPrefix("audios");
  const docPubPrefix = getSupabasePubPrefix("documents");

  // Busca candidatas: URL encriptada ou ainda apontando pro mmg.whatsapp
  let query = supabase
    .from("messages")
    .select("id, telefone, sender_type, content, media_type, metadata")
    .eq("canal", "festas")
    .in("media_type", tipoArg ? [tipoArg] : MEDIA_TYPES)
    .or("content.like.%mmg.whatsapp.net%,content.like.%.enc%")
    .order("created_at", { ascending: true });

  if (telefoneArg) query = query.eq("telefone", telefoneArg);
  if (LIMIT) query = query.limit(LIMIT);

  const { data: rows, error: qErr } = await query;
  if (qErr) { console.error("Erro na query:", qErr); process.exit(1); }

  const total = rows?.length ?? 0;
  console.log(`\nCandidatas encontradas: ${total}\n`);
  if (total === 0) { console.log("Nada a processar."); return; }

  let ok = 0, skipped = 0, failed = 0;
  const failures: { id: string; reason: string }[] = [];

  for (let i = 0; i < total; i++) {
    const row = rows![i];
    const rowId = row.id as string;
    const telefone = String(row.telefone || "");
    const senderType = row.sender_type as string;
    const mediaType = row.media_type as MediaType;
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const messageId = meta.messageId as string | undefined;
    const { url: rawUrl, caption } = parseContent(String(row.content || ""));

    const prefix = `  [${i + 1}/${total}] ${rowId.slice(0, 8)}… (${mediaType}, ${telefone})`;

    // Já tem URL do Storage → skip
    if (rawUrl.startsWith(audioPubPrefix) || rawUrl.startsWith(docPubPrefix)) {
      console.log(`${prefix} → SKIP (já no Storage)`);
      skipped++;
      continue;
    }

    if (!messageId) {
      console.warn(`${prefix} → SKIP (sem messageId no metadata)`);
      skipped++;
      failures.push({ id: rowId, reason: "sem messageId" });
      continue;
    }

    const remoteJid = `${telefone.replace(/\D/g, "")}@s.whatsapp.net`;
    const fromMe = senderType === "equipe";

    console.log(`${prefix} → buscando base64…`);
    const evo = await fetchBase64(messageId, remoteJid, fromMe);

    if (!evo?.base64) {
      console.warn(`${prefix} → FAIL (Evolution não retornou base64 — mídia expirou?)`);
      failed++;
      failures.push({ id: rowId, reason: "Evolution sem base64" });
      await sleep(DELAY_MS);
      continue;
    }

    const mimetype = evo.mimetype ?? "application/octet-stream";
    const ext = extFromMime(mimetype, mediaType);
    // Para documento, prioriza fileName da Evolution; senão usa caption já extraída
    const fileName = mediaType === "document" ? (evo.fileName ?? caption ?? undefined) : undefined;
    const { bucket, path } = storagePath(mediaType, telefone, messageId, ext, fileName);

    const buffer = Buffer.from(evo.base64, "base64");

    if (DRY_RUN) {
      console.log(`${prefix} → DRY OK → ${bucket}/${path} (${buffer.length} bytes, ${mimetype})`);
      ok++;
      await sleep(DELAY_MS);
      continue;
    }

    // Upload
    const { error: upErr } = await supabase.storage
      .from(bucket)
      .upload(path, buffer, { contentType: mimetype, upsert: true });

    if (upErr) {
      console.warn(`${prefix} → FAIL upload: ${upErr.message}`);
      failed++;
      failures.push({ id: rowId, reason: `upload: ${upErr.message}` });
      await sleep(DELAY_MS);
      continue;
    }

    const { data: pubData } = supabase.storage.from(bucket).getPublicUrl(path);
    const publicUrl = pubData.publicUrl;

    // Label para documento: usa fileName da Evolution ou caption original
    const docLabel = mediaType === "document"
      ? (evo.fileName ?? caption ?? "")
      : caption;
    const newContent = buildContent(mediaType, publicUrl, docLabel);

    // metadata atualizado com audioSeconds (se áudio)
    const newMeta: Record<string, unknown> = { ...meta };
    if (mediaType === "audio" && typeof evo.seconds === "number") {
      newMeta.audioSeconds = evo.seconds;
    }

    const { error: updErr } = await supabase
      .from("messages")
      .update({ content: newContent, metadata: newMeta })
      .eq("id", rowId);

    if (updErr) {
      console.warn(`${prefix} → FAIL update: ${updErr.message}`);
      failed++;
      failures.push({ id: rowId, reason: `update: ${updErr.message}` });
      await sleep(DELAY_MS);
      continue;
    }

    console.log(`${prefix} → OK → ${bucket}/${path}`);
    ok++;

    if ((i + 1) % 20 === 0) {
      console.log(`\n  Progresso: ${i + 1}/${total} | ok=${ok} skip=${skipped} fail=${failed}\n`);
    }

    await sleep(DELAY_MS);
  }

  console.log("\n" + "=".repeat(60));
  console.log(`Finalizado. ok=${ok} | skipped=${skipped} | failed=${failed}`);
  if (failures.length > 0) {
    console.log("\nFalhas:");
    for (const f of failures) console.log(`  ${f.id}: ${f.reason}`);
  }
  console.log("=".repeat(60));
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((e) => { console.error(e); process.exit(1); });
