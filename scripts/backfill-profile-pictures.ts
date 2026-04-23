/**
 * Script one-shot: busca foto de perfil para contatos sem foto_url.
 * Uso: npm run backfill:pics [-- --dry-run] [-- --canal=alegrando|festas|all]
 * Canal padrão: alegrando (Z-API). Para canal festas usa Evolution API.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const DRY_RUN = process.argv.includes("--dry-run");
const CANAL_ARG = process.argv.find(a => a.startsWith("--canal="))?.split("=")[1] ?? "alegrando";
const CANAIS = CANAL_ARG === "all" ? ["alegrando", "festas"] : [CANAL_ARG];

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ZAPI_INSTANCE = process.env.ZAPI_INSTANCE;
const ZAPI_TOKEN = process.env.ZAPI_TOKEN;
const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN;
const EVO_URL = process.env.EVOLUTION_API_URL;
const EVO_INSTANCE = process.env.EVOLUTION_INSTANCE;
const EVO_KEY = process.env.EVOLUTION_API_KEY;

if (!SB_URL || !SB_SERVICE_KEY) {
    console.error("Faltando NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
}

const supabase = createClient(SB_URL, SB_SERVICE_KEY);

async function fetchPicZapi(phone: string): Promise<string | null> {
    if (!ZAPI_INSTANCE || !ZAPI_TOKEN || !ZAPI_CLIENT_TOKEN) return null;
    const url = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/profile-picture?phone=${phone}`;
    try {
        const res = await fetch(url, { headers: { "Client-Token": ZAPI_CLIENT_TOKEN } });
        if (!res.ok) return null;
        const body = (await res.json()) as { link?: string };
        return body.link || null;
    } catch {
        return null;
    }
}

async function fetchPicEvolution(phone: string): Promise<string | null> {
    if (!EVO_URL || !EVO_INSTANCE || !EVO_KEY) return null;
    try {
        const res = await fetch(`${EVO_URL}/chat/fetchProfilePictureUrl/${EVO_INSTANCE}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: EVO_KEY },
            body: JSON.stringify({ number: phone }),
        });
        if (!res.ok) return null;
        const body = (await res.json()) as { profilePictureUrl?: string };
        return body.profilePictureUrl || null;
    } catch {
        return null;
    }
}

async function runCanal(canal: string) {
    console.log(`\n=== Canal: ${canal} ===`);
    const { data: leads, error } = await supabase
        .from("Clientes _WhatsApp")
        .select("telefone, nome")
        .is("foto_url", null)
        .eq("canal", canal);
    if (error) { console.error(error); process.exit(1); }

    console.log(`Total de contatos sem foto: ${leads?.length ?? 0}`);
    const fetcher = canal === "festas" ? fetchPicEvolution : fetchPicZapi;
    let ok = 0, fail = 0;
    for (let i = 0; i < (leads?.length ?? 0); i++) {
        const lead = leads![i];
        const tel = String(lead.telefone);
        const url = await fetcher(tel.startsWith("55") ? tel : `55${tel}`);
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
    console.log(`Finalizado canal ${canal}. Com foto: ${ok}. Sem foto: ${fail}.`);
}

async function main() {
    console.log(`MODE: ${DRY_RUN ? "DRY RUN" : "LIVE"} | Canais: ${CANAIS.join(", ")}`);
    for (const canal of CANAIS) {
        await runCanal(canal);
    }
}

main().catch(e => { console.error(e); process.exit(1); });
