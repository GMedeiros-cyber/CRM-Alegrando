/**
 * Script one-shot: para todas as mensagens com media_type=audio cujo content
 * é uma URL externa (não Supabase Storage), faz download e upload para o
 * bucket `audios`, depois atualiza o content para a URL permanente.
 *
 * Uso: npm run backfill:audios [-- --dry-run] [-- --limit=N]
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const DRY_RUN = process.argv.includes("--dry-run");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) : undefined;

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SB_URL || !SB_SERVICE_KEY) {
  console.error("Faltando NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SB_URL, SB_SERVICE_KEY);
const BUCKET = "audios";

function getPublicUrlPrefix(): string {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl("x");
  return data.publicUrl.slice(0, -1);
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

async function main() {
  const publicPrefix = getPublicUrlPrefix();
  console.log(`MODE: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log(`Bucket prefix: ${publicPrefix}`);
  if (LIMIT) console.log(`Limit: ${LIMIT}`);

  let query = supabase
    .from("messages")
    .select("id, telefone, content, metadata")
    .eq("media_type", "audio")
    .like("content", "http%")
    .not("content", "like", `${publicPrefix}%`)
    .order("created_at", { ascending: false });

  if (LIMIT) query = query.limit(LIMIT);

  const { data: rows, error } = await query;
  if (error) { console.error(error); process.exit(1); }

  const total = rows?.length ?? 0;
  console.log(`Áudios candidatos ao backfill: ${total}`);

  let ok = 0, skipped = 0, fail = 0;
  for (let i = 0; i < total; i++) {
    const row = rows![i];
    const id = row.id as string;
    const telefone = String(row.telefone || "");
    const sourceUrl = String(row.content || "");
    const metadata = (row.metadata as Record<string, unknown>) || {};
    const messageId = (metadata.messageId as string) || `row-${id}`;

    if (!telefone || !sourceUrl.startsWith("http")) { skipped++; continue; }

    try {
      const res = await fetch(sourceUrl);
      if (!res.ok) {
        console.warn(`  [${i + 1}/${total}] FAIL download ${res.status} (${id})`);
        fail++;
        continue;
      }
      const contentType = res.headers.get("content-type") || "audio/ogg";
      const buf = Buffer.from(await res.arrayBuffer());
      const ext = extFromUrl(sourceUrl) || extFromContentType(contentType);
      const digits = telefone.replace(/\D/g, "");
      const safeId = messageId.replace(/[^a-zA-Z0-9_-]/g, "_");
      const path = `${digits}/${safeId}.${ext}`;

      if (DRY_RUN) {
        console.log(`  [${i + 1}/${total}] DRY → ${path} (${buf.length} bytes)`);
        ok++;
        continue;
      }

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, buf, { contentType, upsert: true });
      if (upErr) {
        console.warn(`  [${i + 1}/${total}] FAIL upload ${upErr.message} (${id})`);
        fail++;
        continue;
      }
      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const publicUrl = urlData.publicUrl;

      const { error: updErr } = await supabase
        .from("messages")
        .update({ content: publicUrl })
        .eq("id", id);
      if (updErr) {
        console.warn(`  [${i + 1}/${total}] FAIL update ${updErr.message} (${id})`);
        fail++;
        continue;
      }

      ok++;
      if ((i + 1) % 10 === 0 || i + 1 === total) {
        console.log(`  Progresso: ${i + 1}/${total} (ok=${ok}, skipped=${skipped}, fail=${fail})`);
      }
    } catch (err) {
      console.warn(`  [${i + 1}/${total}] EXC ${err} (${id})`);
      fail++;
    }

    await new Promise((r) => setTimeout(r, 150));
  }

  console.log(`\nFinalizado. ok=${ok} skipped=${skipped} fail=${fail}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
