/**
 * Script one-shot: para todos os contatos do canal "alegrando" sem
 * foto, tenta buscar via Z-API e preencher foto_url.
 * Uso: npm run backfill:pics [-- --dry-run]
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const DRY_RUN = process.argv.includes("--dry-run");
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ZAPI_INSTANCE = process.env.ZAPI_INSTANCE!;
const ZAPI_TOKEN = process.env.ZAPI_TOKEN!;
const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN!;

if (!SB_URL || !SB_SERVICE_KEY) {
    console.error("Faltando NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
}
if (!ZAPI_INSTANCE || !ZAPI_TOKEN || !ZAPI_CLIENT_TOKEN) {
    console.error("Faltando credenciais Z-API");
    process.exit(1);
}

const supabase = createClient(SB_URL, SB_SERVICE_KEY);

async function fetchPic(phone: string): Promise<string | null> {
    const url = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/profile-picture?phone=${phone}`;
    try {
        const res = await fetch(url, {
            headers: { "Client-Token": ZAPI_CLIENT_TOKEN },
        });
        if (!res.ok) return null;
        const body = (await res.json()) as { link?: string };
        return body.link || null;
    } catch {
        return null;
    }
}

async function main() {
    console.log(`MODE: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
    const { data: leads, error } = await supabase
        .from("Clientes _WhatsApp")
        .select("telefone, nome")
        .is("foto_url", null)
        .eq("canal", "alegrando");
    if (error) { console.error(error); process.exit(1); }

    console.log(`Total de contatos sem foto: ${leads?.length ?? 0}`);
    let ok = 0, fail = 0;
    for (let i = 0; i < (leads?.length ?? 0); i++) {
        const lead = leads![i];
        const tel = String(lead.telefone);
        const url = await fetchPic(tel.startsWith("55") ? tel : `55${tel}`);
        if (url) {
            if (!DRY_RUN) {
                await supabase
                    .from("Clientes _WhatsApp")
                    .update({ foto_url: url })
                    .eq("telefone", lead.telefone);
            }
            ok++;
            console.log(`  [${i + 1}/${leads!.length}] ${tel} ${lead.nome ?? ""} OK`);
        } else {
            fail++;
        }
        if ((i + 1) % 10 === 0) {
            console.log(`  Progresso: ${i + 1}/${leads!.length} (ok=${ok}, fail=${fail})`);
        }
        await new Promise(r => setTimeout(r, 500));
    }
    console.log(`\nFinalizado. Com foto recuperada: ${ok}. Sem foto: ${fail}.`);
}

main().catch(e => { console.error(e); process.exit(1); });
