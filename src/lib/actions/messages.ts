"use server";

import { requireAuth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
    sendWhatsAppMessage,
    sendWhatsAppImage,
    sendWhatsAppVideo,
    sendWhatsAppDocument,
    sendWhatsAppAudio,
    sendWhatsAppReaction,
    sendWhatsAppReply,
    pinWhatsAppMessage,
    deleteWhatsAppMessage,
    sendEvolutionReaction,
    sendEvolutionReply,
    sendEvolutionAudio,
    deleteEvolutionMessage,
} from "@/lib/whatsapp/sender";
import {
    putMediaDeduped,
    deleteFromR2,
    presignedPutUrl,
    r2PublicUrl,
} from "@/lib/whatsapp/r2-client";
import { z } from "zod";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_SIZE = 16 * 1024 * 1024; // 16MB — limite confiável do WhatsApp para vídeo
const MAX_AUDIO_SIZE = 16 * 1024 * 1024; // 16MB — limite do WhatsApp para áudio

const sendMessageSchema = z.object({
    telefone: z.string().min(8).max(32),
    mensagem: z.string().min(1).max(5000),
    sender_name: z.string().min(1).max(100),
    iaAtiva: z.boolean(),
});

/**
 * Envio unificado de mensagem de texto.
 */
export async function sendMessage(payload: {
    telefone: string;
    mensagem: string;
    sender_name: string;
    iaAtiva: boolean;
    canal?: string;
}) {
    const userId = await requireAuth();
    const parsed = sendMessageSchema.parse(payload);

    const supabase = createServerSupabaseClient();
    const canal = payload.canal ?? "alegrando";

    // Canal festas → Evolution API (sem IA)
    if (canal === "festas") {
        const evoUrl = process.env.EVOLUTION_API_URL;
        const evoInstance = process.env.EVOLUTION_INSTANCE;
        const evoKey = process.env.EVOLUTION_API_KEY;

        if (!evoUrl || !evoInstance || !evoKey) {
            console.error("[sendMessage] Evolution API não configurada.");
            return { success: false, error: "Evolution API não configurada" };
        }

        let evoMessageId: string | undefined;
        try {
            const res = await fetch(`${evoUrl}/message/sendText/${evoInstance}`, {
                method: "POST",
                headers: { "Content-Type": "application/json", apikey: evoKey },
                body: JSON.stringify({ number: String(parsed.telefone), text: parsed.mensagem }),
            });
            const body = await res.json().catch(() => ({}));
            evoMessageId = (body as Record<string, Record<string, unknown>>)?.key?.id as string | undefined;
        } catch (err) {
            console.error("[sendMessage] Evolution API falhou:", err);
            return { success: false, error: "Falha ao enviar via Evolution API" };
        }

        await supabase.from("messages").insert({
            telefone: parsed.telefone,
            canal: "festas",
            sender_type: "equipe",
            sender_name: parsed.sender_name,
            content: parsed.mensagem,
            media_type: "text",
            created_by: userId,
            ...(evoMessageId ? { metadata: { messageId: evoMessageId } } : {}),
        });

        return { success: true };
    }

    // Canal alegrando → Z-API ou n8n
    if (parsed.iaAtiva) {
        const webhookUrl = process.env.N8N_WEBHOOK_URL;
        if (!webhookUrl) {
            console.error("[sendMessage] N8N_WEBHOOK_URL não configurada.");
            return { success: false, warning: "Webhook não configurado" };
        }

        const response = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                telefone: parsed.telefone,
                mensagem: parsed.mensagem,
                sender_name: parsed.sender_name,
            }),
        });

        if (!response.ok) {
            console.error(`[sendMessage] n8n respondeu ${response.status}`);
        }
    } else {
        const result = await sendWhatsAppMessage(
            String(parsed.telefone),
            parsed.mensagem
        );

        if (!result.success) {
            console.error(`[sendMessage] Falha no envio WhatsApp direto: ${result.error}`);
            return { success: false, error: result.error };
        }

        const { error: dbErr } = await supabase.from("messages").insert({
            telefone: parsed.telefone,
            canal: "alegrando",
            sender_type: "equipe",
            sender_name: parsed.sender_name,
            content: parsed.mensagem,
            media_type: "text",
            created_by: userId,
            // Stores zapiMessageId so future delete/pin/react can target this message on WhatsApp
            ...(result.zapiMessageId ? { metadata: { messageId: result.zapiMessageId } } : {}),
        });
        if (dbErr) {
            console.error("[sendMessage] Falha ao persistir mensagem manual:", dbErr.message);
        }
    }

    return { success: true };
}

/**
 * Envia um arquivo (PDF, imagem, documento) via WhatsApp (ZAPI)
 * e persiste no Supabase.
 */
export async function sendFileMessage(
    formData: FormData
): Promise<{ success: boolean; error?: string }> {
    const userId = await requireAuth();

    const file = formData.get("file") as File | null;
    const telefone = formData.get("telefone") as string | null;
    const senderName = (formData.get("sender_name") as string) || "Equipe";
    const caption = (formData.get("caption") as string) || "";
    const canal = (formData.get("canal") as string) || "alegrando";

    if (!file || !telefone) {
        return { success: false, error: "Arquivo e telefone são obrigatórios." };
    }

    const isVideoFile = file.type.startsWith("video/");
    const sizeLimit = isVideoFile ? MAX_VIDEO_SIZE : MAX_FILE_SIZE;
    if (file.size > sizeLimit) {
        return { success: false, error: `Arquivo muito grande. Máximo ${sizeLimit / 1024 / 1024}MB.` };
    }

    const supabase = createServerSupabaseClient();

    // Sobe pro Cloudflare R2 (mesmo helper/dedup do fluxo de recebimento).
    const ext = (file.name.split(".").pop() || "bin").toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());

    let publicUrl: string;
    try {
        ({ publicUrl } = await putMediaDeduped(
            buffer,
            ext,
            file.type || "application/octet-stream",
        ));
    } catch (err) {
        console.error("[sendFileMessage] Upload R2 falhou:", err);
        return { success: false, error: "Falha no upload do arquivo." };
    }

    const isFestas = canal === "festas";

    // Send via API correta por canal
    const isImage = file.type.startsWith("image/");
    let zapiResult: { success: boolean; zapiMessageId?: string; error?: string };

    if (isFestas) {
        const evoUrl = process.env.EVOLUTION_API_URL;
        const evoInstance = process.env.EVOLUTION_INSTANCE;
        const evoKey = process.env.EVOLUTION_API_KEY;
        if (!evoUrl || !evoInstance || !evoKey) {
            zapiResult = { success: false, error: "Evolution API não configurada" };
        } else {
            const phone = String(telefone).replace(/\D/g, "");
            const normalizedPhone = (phone.startsWith("55") && phone.length >= 12) ? phone : `55${phone}`;
            const mediatype = file.type.startsWith("image/") ? "image"
                : file.type.startsWith("video/") ? "video"
                : "document";
            try {
                const res = await fetch(`${evoUrl}/message/sendMedia/${evoInstance}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", apikey: evoKey },
                    body: JSON.stringify({
                        number: normalizedPhone,
                        mediatype,
                        mimetype: file.type,
                        media: buffer.toString("base64"),
                        fileName: file.name,
                        caption: caption || "",
                    }),
                });
                if (res.ok) {
                    let evoMessageId: string | undefined;
                    try {
                        const parsed = (await res.json()) as Record<string, unknown>;
                        // Evolution v2 retorna { key: { id: "..." }, ... }; fallback p/ messageId no topo
                        evoMessageId = (parsed?.key as Record<string, unknown>)?.id as string | undefined
                            ?? (parsed?.messageId as string | undefined);
                    } catch { /* ignore */ }
                    zapiResult = { success: true, zapiMessageId: evoMessageId };
                } else {
                    zapiResult = { success: false, error: `Evolution sendMedia ${res.status}` };
                }
            } catch (err) {
                zapiResult = { success: false, error: String(err) };
            }
        }
    } else if (isVideoFile) {
        zapiResult = await sendWhatsAppVideo(String(telefone), publicUrl, caption);
    } else if (isImage) {
        zapiResult = await sendWhatsAppImage(String(telefone), publicUrl, caption);
    } else {
        const base64 = buffer.toString("base64");
        zapiResult = await sendWhatsAppDocument(String(telefone), base64, file.name, caption);
    }

    if (!zapiResult.success) {
        console.error("[sendFileMessage] ZAPI falhou:", zapiResult.error);
        return { success: false, error: zapiResult.error };
    }

    // Persist in messages table
    // Format: "url|||caption" so the chat can display both
    const mediaType = file.type.startsWith("image/")
        ? "image"
        : file.type.startsWith("video/")
            ? "video"
            : "document";
    const storedContent = caption.trim() ? `${publicUrl}|||${caption.trim()}` : publicUrl;
    const { error: dbErr } = await supabase.from("messages").insert({
        telefone: String(telefone),
        canal: isFestas ? "festas" : "alegrando",
        sender_type: "equipe",
        sender_name: senderName,
        content: storedContent,
        media_type: mediaType,
        created_by: userId,
        // Persiste messageId p/ habilitar "apagar para todos" / pin / react no WhatsApp depois
        metadata: zapiResult.zapiMessageId
            ? { messageId: zapiResult.zapiMessageId }
            : null,
    });

    if (dbErr) {
        console.error("[sendFileMessage] Falha ao persistir:", dbErr.message);
    }

    return { success: true };
}

/**
 * Gera URL assinada para upload direto browser→Storage. A Vercel limita o
 * request body de serverless em 4.5MB no nível de plataforma — arquivos
 * maiores precisam subir direto do browser, sem passar pelo server.
 */
export async function createSignedUploadUrl(
    fileName: string,
    telefone: string,
    canal: string = "alegrando",
    mimeType: string = "application/octet-stream"
): Promise<{ success: boolean; signedUrl?: string; path?: string; publicUrl?: string; error?: string }> {
    await requireAuth();

    const safeCanal = canal === "festas" ? "festas" : "alegrando";
    // Mantém dígitos e o sufixo "-group" de grupos; remove o resto
    const safeTelefone = String(telefone).replace(/[^0-9A-Za-z-]/g, "");
    const safeFileName = fileName.replace(/[^0-9A-Za-z._-]/g, "_").slice(-100);
    // Arquivo grande sobe direto browser→R2 via presigned PUT. Path por timestamp
    // (o server não tem os bytes aqui pra calcular o hash-dedup — ok pra grandes).
    const path = `chat-${safeCanal}/${safeTelefone}/${Date.now()}-${safeFileName}`;

    try {
        const signedUrl = await presignedPutUrl(path, mimeType);
        return { success: true, signedUrl, path, publicUrl: r2PublicUrl(path) };
    } catch (err) {
        console.error("[createSignedUploadUrl] Falhou:", err);
        return { success: false, error: "Falha ao preparar upload." };
    }
}

const sendUploadedFileSchema = z.object({
    path: z.string().min(1).max(500),
    telefone: z.string().min(8).max(32),
    canal: z.string().optional(),
    caption: z.string().max(5000).optional(),
    mediaType: z.enum(["image", "video", "document"]),
    fileName: z.string().min(1).max(255),
    mimeType: z.string().max(100).optional(),
    senderName: z.string().max(100).optional(),
});

/**
 * Envia um arquivo JÁ presente no Storage (upload direto do browser via
 * signed URL) e persiste no Supabase. Par do createSignedUploadUrl para
 * arquivos acima do limite de 4.5MB da Vercel.
 */
export async function sendUploadedFileMessage(payload: {
    path: string;
    telefone: string;
    canal?: string;
    caption?: string;
    mediaType: "image" | "video" | "document";
    fileName: string;
    mimeType?: string;
    senderName?: string;
}): Promise<{ success: boolean; error?: string }> {
    const userId = await requireAuth();
    let parsed: z.infer<typeof sendUploadedFileSchema>;
    try {
        parsed = sendUploadedFileSchema.parse(payload);
    } catch {
        return { success: false, error: "Dados de upload inválidos." };
    }
    const canal = parsed.canal === "festas" ? "festas" : "alegrando";
    const caption = (parsed.caption ?? "").trim();

    // O path precisa apontar para a área de chat deste telefone/canal —
    // impede reaproveitar a action para enviar arquivos arbitrários do bucket.
    const safeTelefone = String(parsed.telefone).replace(/[^0-9A-Za-z-]/g, "");
    if (!parsed.path.startsWith(`chat-${canal}/${safeTelefone}/`)) {
        return { success: false, error: "Path inválido." };
    }

    const supabase = createServerSupabaseClient();
    // O arquivo grande já subiu direto browser→R2 (presigned PUT); a URL pública
    // é determinística a partir do path.
    const publicUrl = r2PublicUrl(parsed.path);

    let sendResult: { success: boolean; zapiMessageId?: string; error?: string };

    if (canal === "festas") {
        const evoUrl = process.env.EVOLUTION_API_URL;
        const evoInstance = process.env.EVOLUTION_INSTANCE;
        const evoKey = process.env.EVOLUTION_API_KEY;
        if (!evoUrl || !evoInstance || !evoKey) {
            sendResult = { success: false, error: "Evolution API não configurada" };
        } else {
            const phone = String(parsed.telefone).replace(/\D/g, "");
            const normalizedPhone = (phone.startsWith("55") && phone.length >= 12) ? phone : `55${phone}`;
            try {
                // Evolution v2 aceita URL no campo media — sem base64, o arquivo
                // não passa pelo server.
                const res = await fetch(`${evoUrl}/message/sendMedia/${evoInstance}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", apikey: evoKey },
                    body: JSON.stringify({
                        number: normalizedPhone,
                        mediatype: parsed.mediaType,
                        ...(parsed.mimeType ? { mimetype: parsed.mimeType } : {}),
                        media: publicUrl,
                        fileName: parsed.fileName,
                        caption,
                    }),
                });
                if (res.ok) {
                    let evoMessageId: string | undefined;
                    try {
                        const body = (await res.json()) as Record<string, unknown>;
                        evoMessageId = (body?.key as Record<string, unknown>)?.id as string | undefined
                            ?? (body?.messageId as string | undefined);
                    } catch { /* ignore */ }
                    sendResult = { success: true, zapiMessageId: evoMessageId };
                } else {
                    sendResult = { success: false, error: `Evolution sendMedia ${res.status}` };
                }
            } catch (err) {
                sendResult = { success: false, error: String(err) };
            }
        }
    } else if (parsed.mediaType === "video") {
        sendResult = await sendWhatsAppVideo(String(parsed.telefone), publicUrl, caption);
    } else if (parsed.mediaType === "image") {
        sendResult = await sendWhatsAppImage(String(parsed.telefone), publicUrl, caption);
    } else {
        // sendWhatsAppDocument aceita URL pública no lugar do base64
        sendResult = await sendWhatsAppDocument(String(parsed.telefone), publicUrl, parsed.fileName, caption);
    }

    if (!sendResult.success) {
        console.error("[sendUploadedFileMessage] Envio falhou:", sendResult.error);
        return { success: false, error: sendResult.error };
    }

    const storedContent = caption ? `${publicUrl}|||${caption}` : publicUrl;
    const { error: dbErr } = await supabase.from("messages").insert({
        telefone: String(parsed.telefone),
        canal,
        sender_type: "equipe",
        sender_name: parsed.senderName || "Equipe",
        content: storedContent,
        media_type: parsed.mediaType,
        created_by: userId,
        // Persiste messageId p/ habilitar "apagar para todos" / pin / react depois
        metadata: sendResult.zapiMessageId
            ? { messageId: sendResult.zapiMessageId }
            : null,
    });

    if (dbErr) {
        console.error("[sendUploadedFileMessage] Falha ao persistir:", dbErr.message);
    }

    return { success: true };
}

/**
 * Envia um áudio via WhatsApp (Z-API para alegrando, Evolution para festas)
 * e persiste no Supabase.
 *
 * TODO: gravação direta via MediaRecorder — PR futuro
 */
export async function sendAudioMessage(
    formData: FormData
): Promise<{ success: boolean; url?: string; error?: string }> {
    const userId = await requireAuth();

    const file = formData.get("file") as File | null;
    const telefone = formData.get("telefone") as string | null;
    const senderName = (formData.get("sender_name") as string) || "Equipe";
    const canal = (formData.get("canal") as string) || "alegrando";

    if (!file || !telefone) {
        return { success: false, error: "Áudio e telefone são obrigatórios." };
    }
    if (!file.type.startsWith("audio/")) {
        return { success: false, error: "Arquivo selecionado não é um áudio." };
    }
    if (file.size > MAX_AUDIO_SIZE) {
        return { success: false, error: "Áudio muito grande. Máximo 16MB." };
    }

    const supabase = createServerSupabaseClient();

    const ext = (file.name.split(".").pop() || "ogg").toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());
    const isFestas = canal === "festas";

    // 1) Sobe pro R2 PRIMEIRO (mesmo helper/dedup). Precisa existir antes de enviar:
    // a Z-API/Evolution baixam a URL pública pra gerar o waveform de voz.
    let publicUrl: string;
    try {
        ({ publicUrl } = await putMediaDeduped(buffer, ext, file.type || "audio/ogg"));
    } catch (err) {
        console.error("[sendAudioMessage] Upload R2 falhou:", err);
        return { success: false, error: "Falha no upload do áudio." };
    }

    // 2) Envia a URL PÚBLICA (não base64). Base64 fazia o WhatsApp desenhar waveform
    // reto; com URL a API baixa o arquivo e gera o gráfico de voz nativo.
    const sendRes = isFestas
        ? await sendEvolutionAudio(String(telefone), publicUrl)
        : await sendWhatsAppAudio(String(telefone), publicUrl);

    if (!sendRes.success) {
        console.error("[sendAudioMessage] Envio falhou:", sendRes.error);
        return { success: false, error: sendRes.error };
    }

    const messageId = isFestas
        ? (sendRes as { evoMessageId?: string }).evoMessageId
        : (sendRes as { zapiMessageId?: string }).zapiMessageId;

    const { error: dbErr } = await supabase.from("messages").insert({
        telefone: String(telefone),
        canal: isFestas ? "festas" : "alegrando",
        sender_type: "equipe",
        sender_name: senderName,
        content: publicUrl,
        media_type: "audio",
        created_by: userId,
        ...(messageId ? { metadata: { messageId } } : {}),
    });

    if (dbErr) {
        console.error("[sendAudioMessage] Falha ao persistir:", dbErr.message);
    }

    return { success: true, url: publicUrl };
}

/**
 * Reage a uma mensagem com emoji — uma reação por usuário (igual ao WhatsApp).
 *
 * Regras:
 *  - emoji="" → remove a reação atual do usuário
 *  - emoji=X, usuário já tem X → toggle: remove (envia "" para Z-API)
 *  - emoji=X, usuário tem Y diferente → substitui (remove Y, adiciona X)
 *  - emoji=X, usuário sem reação → adiciona
 */
/**
 * Reage a uma mensagem com emoji — uma reação por usuário (igual ao WhatsApp).
 * Retorna `newReactions` para o cliente aplicar diretamente sem depender do Realtime.
 */
export async function reactToMessage(payload: {
    dbMessageId: string;
    zapiMessageId: string | null;
    emoji: string;  // "" para remover
    telefone: string;
    userId: string;
    canal?: string;
    currentReactions?: Record<string, string[]>;
}): Promise<{ success: boolean; newReactions?: Record<string, string[]>; error?: string }> {
    await requireAuth();

    const supabase = createServerSupabaseClient();

    const reactions = payload.currentReactions ?? {};

    // Monta o novo estado — remove o usuário de TODOS os emojis
    const newReactions: Record<string, string[]> = {};
    for (const [emoji, users] of Object.entries(reactions)) {
        const filtered = (users as string[]).filter((u) => u !== payload.userId);
        if (filtered.length > 0) newReactions[emoji] = filtered;
    }
    // Adiciona o novo emoji (se não for remoção explícita com "")
    if (payload.emoji !== "") {
        newReactions[payload.emoji] = [...(newReactions[payload.emoji] ?? []), payload.userId];
    }

    // Detecta canal e envia reação para a API correta
    if (payload.zapiMessageId) {
        const isFestas = (payload.canal ?? "alegrando") === "festas";

        if (isFestas) {
            const result = await sendEvolutionReaction(payload.telefone, payload.zapiMessageId, payload.emoji);
            if (!result.success) {
                console.error("[reactToMessage] Evolution reaction falhou:", result.error);
            }
        } else {
            const result = await sendWhatsAppReaction(payload.telefone, payload.zapiMessageId, payload.emoji);
            if (!result.success) {
                console.error("[reactToMessage] Z-API reaction falhou:", result.error);
            }
        }
    }

    const { error, data: updated } = await supabase
        .from("messages")
        .update({ reactions: newReactions })
        .eq("id", payload.dbMessageId)
        .select("reactions")
        .single();

    if (error) {
        console.error("[reactToMessage] DB update falhou:", error.code, error.message, error.details);
        return { success: false, error: error.message };
    }

    const confirmedReactions = (updated?.reactions as Record<string, string[]>) ?? newReactions;
    return { success: true, newReactions: confirmedReactions };
}

/**
 * Responde a uma mensagem com quote (Z-API reply + salva no banco).
 */
export async function replyToMessage(payload: {
    telefone: string;
    text: string;
    senderName: string;
    iaAtiva: boolean;
    replyToZapiId: string | null;
    replyToContent?: string;
    replyToSenderName?: string | null;
    canal?: string;
}): Promise<{ success: boolean; error?: string }> {
    const userId = await requireAuth();

    const supabase = createServerSupabaseClient();

    const isFestas = (payload.canal ?? "alegrando") === "festas";

    if (isFestas) {
        // Canal festas → Evolution API (IA não se aplica)
        const evoUrl = process.env.EVOLUTION_API_URL;
        const evoInstance = process.env.EVOLUTION_INSTANCE;
        const evoKey = process.env.EVOLUTION_API_KEY;

        if (!evoUrl || !evoInstance || !evoKey) {
            return { success: false, error: "Evolution API não configurada" };
        }

        let evoMessageId: string | undefined;
        if (payload.replyToZapiId) {
            const result = await sendEvolutionReply(payload.telefone, payload.replyToZapiId, payload.text);
            if (!result.success) return { success: false, error: result.error };
            evoMessageId = result.evoMessageId;
        } else {
            const res = await fetch(`${evoUrl}/message/sendText/${evoInstance}`, {
                method: "POST",
                headers: { "Content-Type": "application/json", apikey: evoKey },
                body: JSON.stringify({ number: String(payload.telefone), text: payload.text }),
            });
            const body = await res.json().catch(() => ({}));
            evoMessageId = (body as Record<string, Record<string, unknown>>)?.key?.id as string | undefined;
        }

        const meta = {
            ...(evoMessageId ? { messageId: evoMessageId } : {}),
            ...(payload.replyToContent ? { replyTo: { content: payload.replyToContent, senderName: payload.replyToSenderName ?? null } } : {}),
        };

        const { error: dbErr } = await supabase.from("messages").insert({
            telefone: payload.telefone,
            canal: "festas",
            sender_type: "equipe",
            sender_name: payload.senderName,
            content: payload.text,
            media_type: "text",
            created_by: userId,
            ...(Object.keys(meta).length > 0 ? { metadata: meta } : {}),
        });
        if (dbErr) console.error("[replyToMessage] DB falhou:", dbErr.message);
        return { success: true };
    }

    // Canal alegrando
    if (payload.iaAtiva) {
        const webhookUrl = process.env.N8N_WEBHOOK_URL;
        if (webhookUrl) {
            await fetch(webhookUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    telefone: payload.telefone,
                    mensagem: payload.text,
                    sender_name: payload.senderName,
                }),
            });
        }
    } else {
        let sentZapiMessageId: string | undefined;
        if (payload.replyToZapiId) {
            const result = await sendWhatsAppReply(payload.telefone, payload.replyToZapiId, payload.text);
            if (!result.success) {
                return { success: false, error: result.error };
            }
            sentZapiMessageId = result.zapiMessageId;
        } else {
            const result = await sendWhatsAppMessage(payload.telefone, payload.text);
            if (!result.success) {
                return { success: false, error: result.error };
            }
            sentZapiMessageId = result.zapiMessageId;
        }

        const meta = {
            ...(sentZapiMessageId ? { messageId: sentZapiMessageId } : {}),
            ...(payload.replyToContent ? { replyTo: { content: payload.replyToContent, senderName: payload.replyToSenderName ?? null } } : {}),
        };

        const { error: dbErr } = await supabase.from("messages").insert({
            telefone: payload.telefone,
            canal: "alegrando",
            sender_type: "equipe",
            sender_name: payload.senderName,
            content: payload.text,
            media_type: "text",
            created_by: userId,
            ...(Object.keys(meta).length > 0 ? { metadata: meta } : {}),
        });
        if (dbErr) {
            console.error("[replyToMessage] DB falhou:", dbErr.message);
        }
    }

    return { success: true };
}

/**
 * Apaga mensagem.
 *
 * owner=true  → "apagar para todos": chama Z-API + marca no CRM como deletada (conteúdo vira sentinel)
 * owner=false → "apagar para mim":   só remove do banco do CRM, WhatsApp fica intacto
 */
export async function deleteMessage(payload: {
    dbMessageId: string;
    zapiMessageId: string | null;
    telefone: string;
    owner: boolean;
    canal?: string;
    mediaType?: string | null;
    content?: string | null;
}): Promise<{ success: boolean; error?: string }> {
    await requireAuth();

    const supabase = createServerSupabaseClient();

    if (payload.owner) {
        // Apagar para todos — tenta deletar no WhatsApp e marca no CRM
        if (payload.zapiMessageId) {
            const isFestas = (payload.canal ?? "alegrando") === "festas";

            if (isFestas) {
                const result = await deleteEvolutionMessage(payload.telefone, payload.zapiMessageId);
                if (!result.success) {
                    console.error("[deleteMessage] Evolution falhou:", result.error);
                    return { success: false, error: result.error };
                }
            } else {
                // Fire-and-forget — não bloqueia a atualização do CRM
                deleteWhatsAppMessage(payload.telefone, payload.zapiMessageId, true)
                    .then(r => { if (!r.success) console.error("[deleteMessage] Z-API falhou:", r.error); })
                    .catch(err => console.error("[deleteMessage] Z-API exceção:", err));
            }
        }

        // Se for áudio armazenado, apaga o arquivo (fire-and-forget). Áudio novo
        // vive no R2; áudio antigo ainda pode estar no bucket `audios` do Supabase.
        if (payload.mediaType === "audio" && payload.content) {
            const r2Prefix = process.env.R2_PUBLIC_URL;
            const SUPA_MARKER = "/storage/v1/object/public/audios/";
            if (r2Prefix && payload.content.startsWith(r2Prefix)) {
                const r2Path = payload.content.slice(r2Prefix.length).replace(/^\/+/, "").split("?")[0];
                deleteFromR2(r2Path)
                    .catch(err => console.error("[deleteMessage] R2 remove falhou:", err));
            } else {
                const markerIdx = payload.content.indexOf(SUPA_MARKER);
                if (markerIdx !== -1) {
                    const storagePath = payload.content.slice(markerIdx + SUPA_MARKER.length);
                    supabase.storage.from("audios").remove([storagePath])
                        .then(({ error: rmErr }) => { if (rmErr) console.error("[deleteMessage] Storage remove falhou:", rmErr.message); })
                        .catch(err => console.error("[deleteMessage] Storage remove exceção:", err));
                }
            }
        }

        // Marca como apagada no CRM (não remove o registro — fica visível como "Mensagem apagada")
        const { error } = await supabase
            .from("messages")
            .update({ content: "__DELETED_FOR_ALL__", media_type: "text" })
            .eq("id", payload.dbMessageId);

        if (error) {
            console.error("[deleteMessage] DB update falhou:", error.message);
            return { success: false, error: error.message };
        }
    } else {
        // Apagar para mim — só remove do banco, WhatsApp fica intacto
        const { error } = await supabase
            .from("messages")
            .delete()
            .eq("id", payload.dbMessageId);

        if (error) {
            console.error("[deleteMessage] DB delete falhou:", error.message);
            return { success: false, error: error.message };
        }
    }

    return { success: true };
}

/**
 * Fixa/desafixa mensagem (Z-API + banco).
 */
export async function pinMessage(payload: {
    dbMessageId: string;
    zapiMessageId: string | null;
    telefone: string;
    pin: boolean;
    duration?: 1 | 2 | 3;
    canal?: string;
}): Promise<{ success: boolean; error?: string }> {
    await requireAuth();

    const supabase = createServerSupabaseClient();

    if (payload.zapiMessageId) {
        const isFestas = (payload.canal ?? "alegrando") === "festas";

        // Evolution API v2 não tem endpoint de pin — só atualiza o banco
        if (!isFestas) {
            const result = await pinWhatsAppMessage(payload.telefone, payload.zapiMessageId, payload.pin, payload.duration ?? 3);
            if (!result.success) {
                console.error("[pinMessage] Z-API falhou:", result.error);
            }
        }
    }

    // Atualiza no banco
    const { error } = await supabase
        .from("messages")
        .update({ pinned: payload.pin })
        .eq("id", payload.dbMessageId);

    if (error) {
        console.error("[pinMessage] DB falhou:", error.message);
        return { success: false, error: error.message };
    }
    return { success: true };
}

/**
 * Faz upload de foto de contato para o Supabase Storage e retorna a URL pública.
 * Usado ao criar lead manualmente com foto.
 */
export async function uploadContactPhoto(
    formData: FormData
): Promise<{ success: boolean; url?: string; error?: string }> {
    await requireAuth();

    const file = formData.get("file") as File | null;
    const telefone = (formData.get("telefone") as string) || "unknown";

    if (!file) return { success: false, error: "Arquivo não encontrado." };
    if (file.size > MAX_FILE_SIZE) return { success: false, error: "Arquivo muito grande. Máximo 10MB." };

    const supabase = createServerSupabaseClient();

    const ext = file.name.split(".").pop() || "jpg";
    // Foto de perfil/contato fica no bucket `avatars` do Supabase (não vai pro R2).
    const path = `${telefone.replace(/\D/g, "")}/${Date.now()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadErr } = await supabase.storage
        .from("avatars")
        .upload(path, buffer, { contentType: file.type, upsert: true });

    if (uploadErr) {
        console.error("[uploadContactPhoto] Upload falhou:", uploadErr.message);
        return { success: false, error: uploadErr.message };
    }

    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
    return { success: true, url: urlData.publicUrl };
}
