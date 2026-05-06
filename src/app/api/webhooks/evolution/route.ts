import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchEvolutionProfilePicture } from "@/lib/whatsapp/sender";
import { verifyEvolutionWebhook } from "@/lib/webhook-auth";
import { proxyAudioToStorage } from "@/lib/whatsapp/audio-storage";
import { fetchWithTimeout } from "@/lib/fetch-utils";

export async function POST(req: NextRequest): Promise<NextResponse> {
    const auth = verifyEvolutionWebhook(req);
    if (!auth.ok) {
        return NextResponse.json({ error: auth.message }, { status: auth.status });
    }

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
            .eq("canal", "festas")
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

async function forwardToMarcia(payload: Record<string, unknown>): Promise<void> {
    const url = process.env.N8N_EVOLUTION_WEBHOOK_URL;
    if (!url) {
        console.warn("[EVO-WEBHOOK] N8N_EVOLUTION_WEBHOOK_URL não configurada — repasse desativado.");
        return;
    }
    try {
        const res = await fetchWithTimeout(
            url,
            { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
            8_000,
        );
        if (!res.ok) {
            console.error(`[EVO-WEBHOOK] n8n retornou ${res.status}`);
        }
    } catch (err) {
        console.error("[EVO-WEBHOOK] Falha ao repassar para Márcia n8n:", err);
    }
}

async function handleUpsert(payload: Record<string, unknown>): Promise<NextResponse> {
    const data = (payload as { data?: Record<string, unknown> }).data as
        | {
              key?: { fromMe?: boolean; remoteJid?: string; id?: string };
              pushName?: string;
              participant?: string;
              message?: EvoMessage;
              messageTimestamp?: number;
          }
        | undefined;
    const instance = (payload as { instance?: string }).instance;
    const isFromMe = data?.key?.fromMe === true;

    const rawPhone = (data?.key?.remoteJid ?? "").replace(/@.*$/, "");
    if (!rawPhone || rawPhone.includes("@g.us")) {
        return NextResponse.json({ status: "skipped" }); // ignorar grupos
    }

    const supabaseEarly = createServerSupabaseClient();
    const digitsEarly = rawPhone.replace(/\D/g, "");
    const phone =
        digitsEarly.startsWith("55") && digitsEarly.length >= 12 ? digitsEarly : `55${digitsEarly}`;

    // Atualizar foto e nome do contato quando ele manda mensagem (canal festas)
    if (!isFromMe) {
        const pushName = data?.pushName || null;

        // Garantir que o cliente exista no canal festas (mesmo número pode estar
        // também em "alegrando" — unique (telefone, canal) permite os dois).
        await supabaseEarly.from("Clientes _WhatsApp").upsert(
            {
                telefone: phone,
                canal: "festas",
                ia_ativa: false,
                ...(pushName ? { nome: pushName } : {}),
            },
            { onConflict: "telefone,canal" }
        );

        // Backfill de foto: se o lead ainda não tem foto_url, busca via Evolution API
        supabaseEarly
            .from("Clientes _WhatsApp")
            .select("telefone, foto_url")
            .eq("telefone", phone)
            .eq("canal", "festas")
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
                        .eq("canal", "festas")
                        .then(({ error }) => {
                            if (error) console.error("[EVO-WEBHOOK] Falha backfill foto:", error.message);
                        });
                }
            });

        // Salvar mensagem recebida do cliente
        const messageIdClient = data?.key?.id;
        const extractedClient = extractEvoContent(data?.message);
        if (extractedClient && extractedClient.content && messageIdClient) {
            const { data: existingClient } = await supabaseEarly
                .from("messages")
                .select("id")
                .eq("telefone", phone)
                .eq("canal", "festas")
                .eq("metadata->>messageId", messageIdClient)
                .maybeSingle();

            if (!existingClient) {
                let { content: clientContent, media_type: clientMediaType } = extractedClient;
                if (clientMediaType === "audio" && clientContent.startsWith("http")) {
                    const proxied = await proxyAudioToStorage(supabaseEarly, clientContent, phone, messageIdClient);
                    if (proxied) clientContent = proxied;
                }
                await supabaseEarly.from("messages").insert({
                    telefone: phone,
                    canal: "festas",
                    sender_type: "cliente",
                    sender_name: pushName || "Cliente",
                    content: clientContent,
                    media_type: clientMediaType,
                    created_at: data?.messageTimestamp
                        ? new Date(data.messageTimestamp * 1000).toISOString()
                        : new Date().toISOString(),
                    metadata: { messageId: messageIdClient, source: "evolution-marcia" },
                });
            }
        }

        // Encaminhar ao n8n da Márcia para processamento IA (await: evita abort na Vercel)
        await forwardToMarcia(payload);
        return NextResponse.json({ status: "ok" });
    }

    const messageId = data?.key?.id;
    const extracted = extractEvoContent(data?.message);
    if (!extracted || !extracted.content || !messageId) {
        const msgKeys = data?.message ? Object.keys(data.message) : [];
        console.log(`[EVO-WEBHOOK] fromMe skipped — sem conteúdo. messageId=${messageId}, tipos=${msgKeys.join(",")}`);
        return NextResponse.json({ status: "skipped" });
    }

    const { content: rawContent, media_type } = extracted;
    const supabase = supabaseEarly;

    // Idempotência: messageId é único por (telefone, canal)
    const { data: existing } = await supabase
        .from("messages")
        .select("id")
        .eq("telefone", phone)
        .eq("canal", "festas")
        .eq("metadata->>messageId", messageId)
        .maybeSingle();

    if (existing) return NextResponse.json({ status: "duplicate" });

    let finalContent = rawContent;
    if (media_type === "audio" && rawContent.startsWith("http")) {
        const proxied = await proxyAudioToStorage(supabase, rawContent, phone, messageId);
        if (proxied) finalContent = proxied;
    }

    // Garantir que o cliente exista no canal festas antes de salvar a mensagem
    await supabase.from("Clientes _WhatsApp").upsert(
        {
            telefone: phone,
            canal: "festas",
            ia_ativa: false,
            ...(data.pushName ? { nome: data.pushName } : {}),
        },
        { onConflict: "telefone,canal" }
    );

    // sender_name dinâmico: usa pushName real do operador. Se a Evolution não
    // expõe (alguns eventos não trazem), cai para o nome da instância e em
    // último caso "Festas". Antes era hardcoded "Márcia" — apagava a info real.
    const senderName = data.pushName || instance || "Festas";

    await supabase.from("messages").insert({
        telefone: phone,
        canal: "festas",
        sender_type: "equipe",
        sender_name: senderName,
        content: finalContent,
        media_type,
        created_at: data.messageTimestamp
            ? new Date(data.messageTimestamp * 1000).toISOString()
            : new Date().toISOString(),
        metadata: { messageId, source: "evolution-marcia" },
    });

    return NextResponse.json({ status: "ok" });
}
