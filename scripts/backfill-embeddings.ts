/**
 * Script one-shot: gera embeddings OpenAI para todos os documentos
 * da tabela `documents` que estejam com embedding NULL.
 *
 * Uso: npm run backfill:embeddings [-- --dry-run] [-- --limit=N]
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

const isDryRun = process.argv.includes("--dry-run");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1]) : 999;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !OPENAI_API_KEY) {
  console.error("❌ Variáveis de ambiente faltando. Verifique .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function generateEmbedding(text: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.data[0].embedding as number[];
}

async function main() {
  console.log(`🔍 Buscando documentos sem embedding${isDryRun ? " (DRY RUN)" : ""}...`);

  const { data: docs, error } = await supabase
    .from("documents")
    .select("id, tipo_passeio, content")
    .is("embedding", null)
    .limit(limit);

  if (error) {
    console.error("❌ Erro ao buscar documentos:", error.message);
    process.exit(1);
  }

  if (!docs || docs.length === 0) {
    console.log("✅ Todos os documentos já têm embedding. Nada a fazer.");
    return;
  }

  console.log(`📋 ${docs.length} documentos sem embedding encontrados.\n`);

  let ok = 0;
  let fail = 0;

  for (const doc of docs) {
    const nome = doc.tipo_passeio || `id=${doc.id}`;
    process.stdout.write(`  → ${nome}... `);

    if (isDryRun) {
      console.log("(dry-run, pulado)");
      continue;
    }

    try {
      const embedding = await generateEmbedding(doc.content as string);

      const { error: updateErr } = await supabase
        .from("documents")
        .update({ embedding: JSON.stringify(embedding) })
        .eq("id", doc.id);

      if (updateErr) {
        console.log(`❌ erro no update: ${updateErr.message}`);
        fail++;
      } else {
        console.log("✅");
        ok++;
      }

      // Pausa para não estourar rate limit da OpenAI
      await new Promise((r) => setTimeout(r, 300));
    } catch (err: any) {
      console.log(`❌ ${err.message}`);
      fail++;
    }
  }

  console.log(`\n🏁 Concluído: ${ok} gerados, ${fail} falhas.`);
  if (fail > 0) {
    console.log("   Rode novamente para retentar os que falharam.");
    process.exit(1);
  }
}

main();
