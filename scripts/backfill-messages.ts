/**
 * Backfill de mensagens perdidas do canal festas (Evolution API).
 * Uso: npm run backfill:messages [-- --since=2026-05-05] [-- --dry-run]
 *
 * O script busca mensagens desde a data informada e insere as que ainda não
 * existem na tabela messages (idempotente via constraint messageId+canal).
 * Mensagens de grupo (@g.us) são ignoradas.
 * Não dispara n8n — só restaura visibilidade no CRM.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const SINCE_ARG = process.argv.find(a => a.startsWith("--since="))?.split("=")[1] ?? "2026-05-06";
const DRY_RUN = process.argv.includes("--dry-run");
const PAGE_SIZE = 100;

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const EVO_URL = (process.env.EVOLUTION_API_URL ?? "").replace(/\/$/, "");
const EVO_INSTANCE = process.env.EVOLUTION_INSTANCE!;
const EVO_KEY = process.env.EVOLUTION_API_KEY!;

if (!SB_URL || !SB_KEY || !EVO_URL || !EVO_INSTANCE || !EVO_KEY) {
    console.error("Variáveis faltando. Verifique .env.local:");
    console.error("  NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,");
    console.error("  EVOLUTION_API_URL, EVOLUTION_INSTANCE, EVOLUTION_API_KEY");
    process.exit(1);
}

const supabase = createClient(SB_URL, SB_KEY);
const sinceTs = Math.floor(new Date(SINCE_ARG + "T00:00:00Z").getTime() / 1000);

interface EvoMessageRaw {
    key: { id: string; fromMe: boolean; remoteJid: string };
    pushName?: string;
    messageTimestamp: number;
    messageType?: string;
    message?: Record<string, unknown>;
    instance?: string;
}

function extractContent(msg: EvoMessageRaw): { content: string; media_type: string } | null {
    const m = msg.message;
    if (!m) return null;

    const text = (m.conversation as string | undefined) ?? (m.extendedTextMessage as { text?: string } | undefined)?.text;
    if (text) return { content: text, media_type: "text" };

    if (m.imageMessage) {
        const img = m.imageMessage as Record<string, string>;
        const url = img.url ?? img.mediaUrl ?? "";
        const cap = img.caption ?? "";
        return { content: cap ? `${url}|||${cap}` : url, media_type: "image" };
    }
    if (m.audioMessage) {
        const aud = m.audioMessage as Record<string, string>;
        return { content: aud.url ?? aud.mediaUrl ?? "", media_type: "audio" };
    }
    if (m.videoMessage) {
        const vid = m.videoMessage as Record<string, string>;
        const url = vid.url ?? vid.mediaUrl ?? "";
        const cap = vid.caption ?? "";
        return { content: cap ? `${url}|||${cap}` : url, media_type: "video" };
    }
    if (m.documentMessage) {
        const doc = m.documentMessage as Record<string, string>;
        const url = doc.url ?? doc.mediaUrl ?? "";
        const label = doc.fileName ?? doc.caption ?? "";
        return { content: label ? `${url}|||${label}` : url, media_type: "document" };
    }
    if (m.stickerMessage) {
        const stk = m.stickerMessage as Record<string, string>;
        return { content: stk.url ?? stk.mediaUrl ?? "", media_type: "sticker" };
    }
    return null;
}

function normalizePhone(remoteJid: string): string | null {
    const raw = remoteJid.replace(/@.*$/, "");
    if (!raw || remoteJid.includes("@g.us")) return null;
    const digits = raw.replace(/\D/g, "");
    return digits.startsWith("55") && digits.length >= 12 ? digits : `55${digits}`;
}

async function fetchPage(skip: number): Promise<EvoMessageRaw[]> {
    const res = await fetch(`${EVO_URL}/chat/findMessages/${EVO_INSTANCE}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: EVO_KEY },
        body: JSON.stringify({
            where: { messageTimestamp: { gte: sinceTs } },
            limit: PAGE_SIZE,
            skip,
        }),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Evolution API ${res.status}: ${text.slice(0, 300)}`);
    }
    const body = (await res.json()) as unknown;
    if (Array.isArray(body)) return body as EvoMessageRaw[];
    if (body && typeof body === "object" && "messages" in (body as object)) {
        return (body as { messages: EvoMessageRaw[] }).messages;
    }
    return [];
}

async function main() {
    console.log(`\nMODE: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
    console.log(`Instância: ${EVO_INSTANCE} | Desde: ${SINCE_ARG} (unix=${sinceTs})`);
    console.log("─".repeat(60));

    let totalFetched = 0;
    let inserted = 0;
    let skippedDup = 0;
    let skippedSemConteudo = 0;
    let errors = 0;
    let skip = 0;

    while (true) {
        process.stdout.write(`Buscando página skip=${skip}... `);
        let msgs: EvoMessageRaw[];
        try {
            msgs = await fetchPage(skip);
        } catch (err) {
            console.error("\nErro ao buscar:", (err as Error).message);
            break;
        }

        if (!msgs.length) {
            console.log("sem resultados — fim.");
            break;
        }

        console.log(`${msgs.length} mensagens`);
        totalFetched += msgs.length;

        for (const msg of msgs) {
            const phone = normalizePhone(msg.key.remoteJid);
            if (!phone) { skippedSemConteudo++; continue; }

            const messageId = msg.key.id;
            if (!messageId) { skippedSemConteudo++; continue; }

            const extracted = extractContent(msg);
            if (!extracted || !extracted.content) { skippedSemConteudo++; continue; }

            if (!DRY_RUN) {
                const { error } = await supabase.from("messages").insert({
                    telefone: phone,
                    canal: "festas",
                    sender_type: msg.key.fromMe ? "equipe" : "cliente",
                    sender_name: msg.key.fromMe
                        ? (msg.instance ?? EVO_INSTANCE)
                        : (msg.pushName ?? "Cliente"),
                    content: extracted.content,
                    media_type: extracted.media_type,
                    created_at: new Date(msg.messageTimestamp * 1000).toISOString(),
                    metadata: { messageId, source: "backfill-evolution" },
                });

                if (error) {
                    if (error.code === "23505") { skippedDup++; continue; }
                    console.error(`  ERRO ${phone} ${messageId}: ${error.message}`);
                    errors++;
                    continue;
                }
            }

            inserted++;
        }

        console.log(`  → inseridos=${inserted} dup=${skippedDup} semConteudo=${skippedSemConteudo} erros=${errors}`);

        if (msgs.length < PAGE_SIZE) break;
        skip += PAGE_SIZE;
        await new Promise(r => setTimeout(r, 150));
    }

    console.log("\n" + "═".repeat(60));
    console.log("RESULTADO FINAL");
    console.log(`  Total buscado:        ${totalFetched}`);
    console.log(`  Inseridos:            ${inserted}`);
    console.log(`  Duplicatas (já havia): ${skippedDup}`);
    console.log(`  Sem conteúdo/grupo:   ${skippedSemConteudo}`);
    console.log(`  Erros:                ${errors}`);
    console.log("═".repeat(60));
}

main().catch(e => { console.error(e); process.exit(1); });
