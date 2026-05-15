import { NextRequest, NextResponse, after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchEvolutionProfilePicture } from "@/lib/whatsapp/sender";
import { verifyEvolutionWebhook } from "@/lib/webhook-auth";
import { proxyMediaFromEvolution } from "@/lib/whatsapp/media-storage";
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
    audioMessage?: { url?: string; mediaUrl?: string; seconds?: number; mimetype?: string };
    imageMessage?: { url?: string; mediaUrl?: string; caption?: string; mimetype?: string };
    videoMessage?: { url?: string; mediaUrl?: string; caption?: string; mimetype?: string };
    documentMessage?: { url?: string; mediaUrl?: string; fileName?: string; caption?: string; mimetype?: string };
    stickerMessage?: { url?: string; mediaUrl?: string; mimetype?: string };
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

interface ApplyMediaProxyParams {
    supabase: SupabaseClient;
    rawContent: string;
    mediaType: EvoMediaType;
    msg: EvoMessage | undefined;
    key: { fromMe?: boolean; remoteJid?: string; id?: string } | undefined;
    telefone: string;
    messageId: string;
}

/**
 * Para mensagens de mídia do canal festas, baixa o conteúdo decifrado via
 * Evolution (`getBase64FromMediaMessage`), envia ao Storage e retorna o content
 * final (`publicUrl|||caption` quando aplicável) + audioSeconds.
 *
 * Em caso de falha, retorna o `rawContent` como fallback (mensagem ainda chega,
 * porém apontando pra URL `.enc` — registrado em log para diagnóstico).
 */
async function applyMediaProxy(
    params: ApplyMediaProxyParams,
): Promise<{ content: string; audioSeconds?: number }> {
    const { supabase, rawContent, mediaType, msg, key, telefone, messageId } = params;

    if (mediaType === "text" || !msg || !key) {
        return { content: rawContent };
    }

    const audioSeconds =
        mediaType === "audio" && typeof msg.audioMessage?.seconds === "number"
            ? msg.audioMessage.seconds
            : undefined;

    const proxied = await proxyMediaFromEvolution(supabase, {
        key,
        message: msg,
        telefone,
        mediaType,
    });

    if (!proxied) {
        console.error(
            `[EVO-WEBHOOK] proxy falhou — messageId=${messageId} media_type=${mediaType} — usando URL bruta`,
        );
        return { content: rawContent, audioSeconds };
    }

    const publicUrl = proxied.publicUrl;
    let content = publicUrl;
    switch (mediaType) {
        case "image": {
            const cap = msg.imageMessage?.caption ?? "";
            content = cap ? `${publicUrl}|||${cap}` : publicUrl;
            break;
        }
        case "video": {
            const cap = msg.videoMessage?.caption ?? "";
            content = cap ? `${publicUrl}|||${cap}` : publicUrl;
            break;
        }
        case "document": {
            const label =
                msg.documentMessage?.fileName ?? msg.documentMessage?.caption ?? "";
            content = label ? `${publicUrl}|||${label}` : publicUrl;
            break;
        }
        case "audio":
        case "sticker":
        default:
            content = publicUrl;
    }

    return { content, audioSeconds };
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
        // NÃO incluímos `nome` no upsert: senão sobrescreveríamos um nome
        // editado manualmente pela equipe toda vez que o cliente mandasse uma
        // mensagem (o pushName do WhatsApp pode ser apelido/genérico).
        await supabaseEarly.from("Clientes _WhatsApp").upsert(
            {
                telefone: phone,
                canal: "festas",
                ia_ativa: false,
            },
            { onConflict: "telefone,canal" }
        );

        // Popular `nome` com pushName SÓ quando o lead ainda não tem nome —
        // permite que apagar no painel "volte a puxar do WhatsApp".
        if (pushName) {
            await supabaseEarly
                .from("Clientes _WhatsApp")
                .update({ nome: pushName })
                .eq("telefone", phone)
                .eq("canal", "festas")
                .is("nome", null);
        }

        // Backfill de foto: se o lead ainda não tem foto_url, busca via Evolution
        // API e faz proxy para o Storage (URLs WhatsApp expiram em ~6 dias).
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
                if (!url) return;
                const { proxyPhotoToStorage } = await import("@/lib/whatsapp/photo-storage");
                const cached = await proxyPhotoToStorage(supabaseEarly, url, phone);
                // Só persistimos quando o proxy retornou URL permanente. Salvar
                // URL crua do WhatsApp causava expiração em ~6 dias — backfill
                // recobre depois (melhor sem foto do que foto que some).
                if (!cached) return;
                supabaseEarly
                    .from("Clientes _WhatsApp")
                    .update({ foto_url: cached })
                    .eq("telefone", phone)
                    .eq("canal", "festas")
                    .then(({ error }) => {
                        if (error) console.error("[EVO-WEBHOOK] Falha backfill foto:", error.message);
                    });
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
                const { content: clientContent, media_type: clientMediaType } = extractedClient;
                const { content: finalClientContent, audioSeconds: clientAudioSeconds } =
                    await applyMediaProxy({
                        supabase: supabaseEarly,
                        rawContent: clientContent,
                        mediaType: clientMediaType,
                        msg: data?.message,
                        key: data?.key,
                        telefone: phone,
                        messageId: messageIdClient,
                    });

                const clientMetadata: Record<string, unknown> = {
                    messageId: messageIdClient,
                    source: "evolution-marcia",
                };
                if (clientAudioSeconds !== undefined) {
                    clientMetadata.audioSeconds = clientAudioSeconds;
                }

                await supabaseEarly.from("messages").insert({
                    telefone: phone,
                    canal: "festas",
                    sender_type: "cliente",
                    sender_name: pushName || "Cliente",
                    content: finalClientContent,
                    media_type: clientMediaType,
                    created_at: data?.messageTimestamp
                        ? new Date(data.messageTimestamp * 1000).toISOString()
                        : new Date().toISOString(),
                    metadata: clientMetadata,
                });
            }
        }

        // Encaminhar ao n8n da Márcia em background — Next.js é o dono da
        // persistência da mensagem, então não bloqueamos a resposta do webhook
        // esperando o n8n. `after()` (Next 15+) garante execução pós-response.
        after(() => forwardToMarcia(payload));
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

    const { content: finalContent, audioSeconds } = await applyMediaProxy({
        supabase,
        rawContent,
        mediaType: media_type,
        msg: data.message,
        key: data.key,
        telefone: phone,
        messageId,
    });

    // Garantir que o cliente exista no canal festas antes de salvar a mensagem.
    // NÃO incluir nome aqui: quando fromMe=true, data.pushName é o nome da operadora
    // (ex: "Márcia Alegrando"), não do contato destinatário.
    await supabase.from("Clientes _WhatsApp").upsert(
        {
            telefone: phone,
            canal: "festas",
            ia_ativa: false,
        },
        { onConflict: "telefone,canal" }
    );

    // sender_name dinâmico: usa pushName real do operador. Se a Evolution não
    // expõe (alguns eventos não trazem), cai para o nome da instância e em
    // último caso "Festas". Antes era hardcoded "Márcia" — apagava a info real.
    const senderName = data.pushName || instance || "Festas";

    const metadata: Record<string, unknown> = { messageId, source: "evolution-marcia" };
    if (audioSeconds !== undefined) metadata.audioSeconds = audioSeconds;

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
        metadata,
    });

    // fromMe da equipe: não encaminha pro n8n (a IA é a equipe — não responde
    // ao próprio envio). Mantém o comportamento prévio do webhook.
    return NextResponse.json({ status: "ok" });
}
