import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchEvolutionProfilePicture } from "@/lib/whatsapp/sender";

export async function POST(req: NextRequest): Promise<NextResponse> {
    const payload = await req.json();
    console.log(`[EVO-WEBHOOK] event=${payload.event}`);
    if (payload.event === "messages.reaction") return handleReaction(payload);
    if (payload.event === "messages.upsert") return handleUpsert(payload);
    return NextResponse.json({ status: "skipped", event: payload.event });
}

async function handleReaction(payload: Record<string, unknown>): Promise<NextResponse> {
    try {
        const reactionData = (payload as { data?: Record<string, unknown> }).data;
        const key = (reactionData as { key?: Record<string, unknown> } | undefined)?.key;
        const rawReactPhone = ((key?.remoteJid as string | undefined) ?? "").replace(/@.*$/, "");
        const isReactFromMe = key?.fromMe === true;

        // Só processar reações do lead (não da Márcia)
        if (isReactFromMe || !rawReactPhone) return NextResponse.json({ status: "skipped" });

        const reactDigits = rawReactPhone.replace(/\D/g, "");
        const reactPhone = reactDigits.startsWith("55") && reactDigits.length >= 12 ? reactDigits : `55${reactDigits}`;

        const reaction = (reactionData as { reaction?: { key?: { id?: string }; text?: string } } | undefined)?.reaction;
        const targetMessageId = reaction?.key?.id || "";
        const reactionEmoji = reaction?.text || "";

        if (!targetMessageId) return NextResponse.json({ status: "skipped" });

        const supabaseReact = createServerSupabaseClient();

        const { data: targetMsg } = await supabaseReact
            .from("messages")
            .select("id, reactions")
            .eq("telefone", reactPhone)
            .eq("metadata->>messageId", targetMessageId)
            .maybeSingle();

        if (targetMsg) {
            const reactions = (targetMsg.reactions as Record<string, string[]>) || {};
            const reacterKey = "lead";

            const newReactions: Record<string, string[]> = {};
            for (const [e, users] of Object.entries(reactions)) {
                const filtered = (users as string[]).filter((u) => u !== reacterKey);
                if (filtered.length > 0) newReactions[e] = filtered;
            }
            if (reactionEmoji) {
                newReactions[reactionEmoji] = [...(newReactions[reactionEmoji] ?? []), reacterKey];
            }

            await supabaseReact
                .from("messages")
                .update({ reactions: newReactions })
                .eq("id", targetMsg.id);
        }

        return NextResponse.json({ status: "ok" });
    } catch (err) {
        console.error("[EVO-WEBHOOK] Erro ao processar reação:", err);
        return NextResponse.json({ status: "error" });
    }
}

type EvoMediaType = "text" | "image" | "video" | "audio" | "document" | "sticker";

interface EvoMessage {
    conversation?: string;
    extendedTextMessage?: { text?: string };
    audioMessage?: { url?: string; mediaUrl?: string };
    imageMessage?: { url?: string; mediaUrl?: string; caption?: string };
    videoMessage?: { url?: string; mediaUrl?: string; caption?: string };
    documentMessage?: { url?: string; mediaUrl?: string; fileName?: string; caption?: string };
    stickerMessage?: { url?: string; mediaUrl?: string };
}

function extractEvoContent(msg: EvoMessage | undefined): { content: string; media_type: EvoMediaType } | null {
    if (!msg) return null;
    if (msg.conversation)
        return { content: msg.conversation, media_type: "text" };
    if (msg.extendedTextMessage?.text)
        return { content: msg.extendedTextMessage.text, media_type: "text" };
    if (msg.imageMessage) {
        const url = msg.imageMessage.url ?? msg.imageMessage.mediaUrl ?? "";
        const cap = msg.imageMessage.caption ?? "";
        return { content: cap ? `${url}|||${cap}` : url, media_type: "image" };
    }
    if (msg.videoMessage) {
        const url = msg.videoMessage.url ?? msg.videoMessage.mediaUrl ?? "";
        const cap = msg.videoMessage.caption ?? "";
        return { content: cap ? `${url}|||${cap}` : url, media_type: "video" };
    }
    if (msg.audioMessage) {
        return { content: msg.audioMessage.url ?? msg.audioMessage.mediaUrl ?? "", media_type: "audio" };
    }
    if (msg.documentMessage) {
        const url = msg.documentMessage.url ?? msg.documentMessage.mediaUrl ?? "";
        const label = msg.documentMessage.fileName ?? msg.documentMessage.caption ?? "";
        return { content: label ? `${url}|||${label}` : url, media_type: "document" };
    }
    if (msg.stickerMessage) {
        return { content: msg.stickerMessage.url ?? msg.stickerMessage.mediaUrl ?? "", media_type: "sticker" };
    }
    return null;
}

async function handleUpsert(payload: Record<string, unknown>): Promise<NextResponse> {
    const data = (payload as { data?: Record<string, unknown> }).data as
        | {
              key?: { fromMe?: boolean; remoteJid?: string; id?: string };
              pushName?: string;
              message?: EvoMessage;
              messageTimestamp?: number;
          }
        | undefined;
    const isFromMe = data?.key?.fromMe === true;

    const rawPhone = (data?.key?.remoteJid ?? "").replace(/@.*$/, "");
    if (!rawPhone || rawPhone.includes("@g.us")) {
        return NextResponse.json({ status: "skipped" }); // ignorar grupos
    }

    const supabaseEarly = createServerSupabaseClient();
    const digitsEarly = rawPhone.replace(/\D/g, "");
    const phone =
        digitsEarly.startsWith("55") && digitsEarly.length >= 12 ? digitsEarly : `55${digitsEarly}`;

    // Atualizar foto e nome do contato quando ele manda mensagem
    if (!isFromMe) {
        const pushName = data?.pushName || null;
        if (pushName) {
            supabaseEarly
                .from("Clientes _WhatsApp")
                .update({ nome: pushName })
                .eq("telefone", phone)
                .then();
        }

        // Backfill de foto: se o lead ainda não tem foto_url, busca via Evolution API
        supabaseEarly
            .from("Clientes _WhatsApp")
            .select("telefone, foto_url")
            .eq("telefone", phone)
            .is("foto_url", null)
            .maybeSingle()
            .then(async ({ data: leadSemFoto }) => {
                if (!leadSemFoto) return;
                const url = await fetchEvolutionProfilePicture(phone);
                if (url) {
                    supabaseEarly
                        .from("Clientes _WhatsApp")
                        .update({ foto_url: url })
                        .eq("telefone", phone)
                        .then(({ error }) => {
                            if (error) console.error("[EVO-WEBHOOK] Falha backfill foto:", error.message);
                        });
                }
            });

        return NextResponse.json({ status: "ok" });
    }

    const messageId = data?.key?.id;
    const extracted = extractEvoContent(data?.message);
    if (!extracted || !extracted.content || !messageId) {
        const msgKeys = data?.message ? Object.keys(data.message) : [];
        console.log(`[EVO-WEBHOOK] fromMe skipped — sem conteúdo. messageId=${messageId}, tipos=${msgKeys.join(",")}`);
        return NextResponse.json({ status: "skipped" });
    }

    const { content, media_type } = extracted;
    const supabase = supabaseEarly;

    // Idempotência
    const { data: existing } = await supabase
        .from("messages")
        .select("id")
        .eq("telefone", phone)
        .eq("metadata->>messageId", messageId)
        .maybeSingle();

    if (existing) return NextResponse.json({ status: "duplicate" });

    await supabase.from("messages").insert({
        telefone: phone,
        sender_type: "equipe",
        sender_name: "Márcia",
        content,
        media_type,
        created_at: data.messageTimestamp
            ? new Date(data.messageTimestamp * 1000).toISOString()
            : new Date().toISOString(),
        metadata: { messageId, source: "evolution-marcia" },
    });

    return NextResponse.json({ status: "ok" });
}
