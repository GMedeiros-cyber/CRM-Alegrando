/**
 * Script one-shot: busca foto de perfil para contatos sem foto_url e faz
 * proxy para o Supabase Storage (bucket `avatars`), gerando uma URL pública
 * permanente. URLs do WhatsApp (pps.whatsapp.net) expiram em ~6 dias.
 *
 * Uso:
 *   npm run backfill:pics [-- --dry-run] [-- --canal=alegrando|festas|all]
 *                         [-- --refresh-wpp]
 *
 * --refresh-wpp: inclui também contatos cuja foto_url é uma URL bruta do
 * WhatsApp (pps.whatsapp.net / whatsapp.net) — re-baixa e cacheia no Storage
 * para não expirar. Sem essa flag, só processa contatos com foto_url=NULL.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const DRY_RUN = process.argv.includes("--dry-run");
const REFRESH_WPP = process.argv.includes("--refresh-wpp");
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
        // Z-API devolve a STRING "null" quando não há foto/autorização — filtrar.
        const link = body.link;
        if (!link || link === "null" || link === "undefined" || !link.startsWith("http")) return null;
        return link;
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

const PHOTO_BUCKET = "avatars";

function extFromContentType(ct: string): string {
    const lower = ct.toLowerCase();
    if (lower.includes("png")) return "png";
    if (lower.includes("webp")) return "webp";
    if (lower.includes("gif")) return "gif";
    return "jpg";
}

async function proxyToStorage(
    client: SupabaseClient,
    sourceUrl: string,
    telefone: string
): Promise<string | null> {
    try {
        const res = await fetch(sourceUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; AlegrandoCRM/1.0)" },
        });
        if (!res.ok) return null;
        const ct = res.headers.get("content-type") || "image/jpeg";
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.byteLength === 0) return null;
        const ext = extFromContentType(ct);
        const safe = telefone.replace(/[^a-zA-Z0-9_-]/g, "_");
        const path = `${safe}.${ext}`;
        const { error } = await client.storage
            .from(PHOTO_BUCKET)
            .upload(path, buf, { contentType: ct, upsert: true });
        if (error) return null;
        const { data } = client.storage.from(PHOTO_BUCKET).getPublicUrl(path);
        return `${data.publicUrl}?v=${Date.now()}`;
    } catch {
        return null;
    }
}

function isGroupId(telefone: string): boolean {
    return telefone.endsWith("-group");
}

async function runCanal(canal: string) {
    console.log(`\n=== Canal: ${canal} ${REFRESH_WPP ? "(incluindo refresh de URLs WhatsApp)" : ""} ===`);
    let query = supabase
        .from("Clientes _WhatsApp")
        .select("telefone, nome")
        .eq("canal", canal);
    // Sem refresh: só quem está sem foto. Com refresh: também os que têm URL
    // crua do WhatsApp (`pps.whatsapp.net`/`whatsapp.net`) que vai expirar.
    if (REFRESH_WPP) {
        query = query.or(
            "foto_url.is.null,foto_url.ilike.%whatsapp.net%,foto_url.ilike.%pps.whatsapp%"
        );
    } else {
        query = query.is("foto_url", null);
    }
    const { data: leads, error } = await query;
    if (error) { console.error(error); process.exit(1); }

    console.log(`Total de contatos a processar: ${leads?.length ?? 0}`);
    const fetcher = canal === "festas" ? fetchPicEvolution : fetchPicZapi;
    let ok = 0, fail = 0, cached = 0;
    for (let i = 0; i < (leads?.length ?? 0); i++) {
        const lead = leads![i];
        const tel = String(lead.telefone);
        // Grupos: passar o ID exato; números individuais: garantir prefixo 55
        const fetchKey = isGroupId(tel)
            ? tel
            : (tel.startsWith("55") ? tel : `55${tel}`);
        const url = await fetcher(fetchKey);
        if (url) {
            const cachedUrl = await proxyToStorage(supabase, url, tel);
            const finalUrl = cachedUrl ?? url;
            if (cachedUrl) cached++;
            if (!DRY_RUN) {
                await supabase
                    .from("Clientes _WhatsApp")
                    .update({ foto_url: finalUrl })
                    .eq("telefone", lead.telefone)
                    .eq("canal", canal);
            }
            ok++;
            const marker = cachedUrl ? "OK (cached)" : "OK (URL only)";
            console.log(`  [${i + 1}/${leads!.length}] ${tel} ${lead.nome ?? ""} ${marker}`);
        } else {
            fail++;
        }
        if ((i + 1) % 10 === 0) {
            console.log(`  Progresso: ${i + 1}/${leads!.length} (ok=${ok}, cached=${cached}, fail=${fail})`);
        }
        await new Promise(r => setTimeout(r, 500));
    }
    console.log(`Finalizado canal ${canal}. Com foto: ${ok} (cached=${cached}). Sem foto: ${fail}.`);
}

async function main() {
    console.log(`MODE: ${DRY_RUN ? "DRY RUN" : "LIVE"} | Canais: ${CANAIS.join(", ")}`);
    for (const canal of CANAIS) {
        await runCanal(canal);
    }
}

main().catch(e => { console.error(e); process.exit(1); });
