/**
 * Script one-shot: backfill de nome e foto de GRUPOS do WhatsApp.
 *
 * Grupos criados antes do handler dedicado ficaram como "Grupo WhatsApp" sem
 * foto. A Z-API expõe GET /group-metadata/{id} com `subject` (nome) e `photo`
 * — dá pra corrigir agora, sem esperar nova mensagem do grupo.
 *
 * Idempotente: só atualiza nome genérico/vazio e foto ausente. A foto passa
 * pelo proxyPhotoToStorage (bucket avatars) para não expirar.
 *
 * Uso:
 *   npm run backfill:grupos -- --dry-run   (valida sem escrever nada)
 *   npm run backfill:grupos
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { proxyPhotoToStorage } from "../src/lib/whatsapp/photo-storage";

config({ path: ".env.local" });

const isDryRun = process.argv.includes("--dry-run");

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ZAPI_INSTANCE = process.env.ZAPI_INSTANCE!;
const ZAPI_TOKEN = process.env.ZAPI_TOKEN!;
const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN!;

if (!SB_URL || !SB_SERVICE_KEY || !ZAPI_INSTANCE || !ZAPI_TOKEN || !ZAPI_CLIENT_TOKEN) {
    console.error("Faltando env vars (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ZAPI_*)");
    process.exit(1);
}

const supabase = createClient(SB_URL, SB_SERVICE_KEY);

// Z-API devolve a STRING "null" (não JSON null) em vários campos — filtrar sempre.
function clean(v: unknown): string | null {
    if (typeof v !== "string") return null;
    if (!v || v === "null" || v === "undefined") return null;
    return v;
}

let loggedRaw = false;

async function fetchGroupMeta(phone: string): Promise<{ nome: string | null; foto: string | null } | null> {
    // Tenta o ID sem o sufixo "-group" primeiro; algumas versões da Z-API
    // esperam o phone completo — fallback cobre as duas.
    const candidates = [phone.replace("-group", ""), phone];
    for (const id of candidates) {
        const url = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/group-metadata/${id}`;
        try {
            const res = await fetch(url, { headers: { "Client-Token": ZAPI_CLIENT_TOKEN } });
            if (!res.ok) continue;
            const d = (await res.json()) as Record<string, unknown>;
            if (!loggedRaw) {
                loggedRaw = true;
                console.log("\n--- Retorno cru do primeiro group-metadata (confirmar nomes dos campos) ---");
                console.log(JSON.stringify(d, null, 2).slice(0, 2000));
                console.log("---\n");
            }
            const nome = clean(d?.subject) ?? clean(d?.name);
            const foto = clean(d?.photo) ?? clean(d?.profilePicture);
            if (nome || foto) return { nome, foto };
        } catch { /* tenta o próximo candidato */ }
    }
    return null;
}

async function main() {
    const { data: grupos, error } = await supabase
        .from("Clientes _WhatsApp")
        .select("telefone, nome, foto_url, canal")
        .like("telefone", "%-group");
    if (error) { console.error(error.message); process.exit(1); }
    if (!grupos?.length) { console.log("Sem grupos."); return; }

    console.log(`${grupos.length} grupos encontrados${isDryRun ? " (DRY RUN)" : ""}\n`);
    let ok = 0, completos = 0, semMeta = 0;
    for (const g of grupos) {
        const tel = String(g.telefone);
        const precisaNome = !g.nome || g.nome === "Grupo WhatsApp";
        const precisaFoto = !g.foto_url;
        if (!precisaNome && !precisaFoto) { completos++; continue; }

        process.stdout.write(`  ${tel}... `);
        const meta = await fetchGroupMeta(tel);
        if (!meta) { console.log("sem metadata"); semMeta++; continue; }

        const update: Record<string, string> = {};
        if (precisaNome && meta.nome) update.nome = meta.nome;
        if (precisaFoto && meta.foto) {
            if (isDryRun) {
                // Dry-run não pode ter side-effect — o proxy sobe arquivo no Storage.
                update.foto_url = `(proxy de ${meta.foto.slice(0, 80)}...)`;
            } else {
                const stored = await proxyPhotoToStorage(supabase, meta.foto, tel).catch(() => null);
                if (stored) update.foto_url = stored;
            }
        }
        if (!Object.keys(update).length) { console.log("nada novo"); continue; }
        if (isDryRun) { console.log("dry:", JSON.stringify(update)); ok++; continue; }

        const { error: e } = await supabase
            .from("Clientes _WhatsApp")
            .update(update)
            .eq("telefone", tel)
            .eq("canal", g.canal);
        if (e) console.log("erro:", e.message);
        else { console.log("✅", update.nome ?? "(foto)"); ok++; }
        await new Promise(r => setTimeout(r, 400));
    }
    console.log(`\n🏁 ${ok} ${isDryRun ? "seriam atualizados" : "atualizados"}, ${completos} já completos, ${semMeta} sem metadata.`);
}

main().catch(e => { console.error(e); process.exit(1); });
