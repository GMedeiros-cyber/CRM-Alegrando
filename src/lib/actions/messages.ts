"use server";

import { requireAuth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
    sendWhatsAppMessage,
    sendWhatsAppImage,
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
import { z } from "zod";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_AUDIO_SIZE = 16 * 1024 * 1024; // 16MB — limite do WhatsApp para áudio

const sendMessageSchema = z.object({
    telefone: z.string().min(8).max(20),
    mensagem: z.string().min(1).max(5000),
    sender_name: z.string().min(1).max(100),
    iaAtiva: z.boolean(),
});

/**
 * Server Action: dispara o webhook do n8n para envio via WhatsApp.
 */
export async function sendMessageToN8n(payload: {
    telefone: string;
    mensagem: string;
    sender_name: string;
}) {
    const webhookUrl = process.env.N8N_WEBHOOK_URL;
    if (!webhookUrl) {
        throw new Error("N8N_WEBHOOK_URL não configurada.");
    }

    await requireAuth();

    const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        console.error(`[sendMessageToN8n] n8n respondeu ${response.status}`);
        throw new Error("Falha ao enviar mensagem via n8n");
    }

    return { success: true };
}

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

    if (file.size > MAX_FILE_SIZE) {
        return { success: false, error: "Arquivo muito grande. Máximo 10MB." };
    }

    const supabase = createServerSupabaseClient();

    // Upload to Supabase Storage
    const ext = file.name.split(".").pop() || "bin";
    const storagePath = `chat-files/${String(telefone)}/${Date.now()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadErr } = await supabase.storage
        .from("documents")
        .upload(storagePath, buffer, {
            contentType: file.type,
            upsert: false,
        });

    if (uploadErr) {
        console.error("[sendFileMessage] Upload falhou:", uploadErr.message);
        return { success: false, error: "Falha no upload do arquivo." };
    }

    // Get public URL
    const { data: urlData } = supabase.storage
        .from("documents")
        .getPublicUrl(storagePath);

    const publicUrl = urlData.publicUrl;

    const isFestas = canal === "festas";

    // Send via API correta por canal
    const isImage = file.type.startsWith("image/");
    let zapiResult: { success: boolean; error?: string };

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
                zapiResult = res.ok
                    ? { success: true }
                    : { success: false, error: `Evolution sendMedia ${res.status}` };
            } catch (err) {
                zapiResult = { success: false, error: String(err) };
            }
        }
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
    const mediaType = file.type.startsWith("image/") ? "image" : "document";
    const storedContent = caption.trim() ? `${publicUrl}|||${caption.trim()}` : publicUrl;
    const { error: dbErr } = await supabase.from("messages").insert({
        telefone: String(telefone),
        sender_type: "equipe",
        sender_name: senderName,
        content: storedContent,
        media_type: mediaType,
        created_by: userId,
    });

    if (dbErr) {
        console.error("[sendFileMessage] Falha ao persistir:", dbErr.message);
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
): Promise<{ success: boolean; error?: string }> {
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

    const ext = file.name.split(".").pop() || "ogg";
    const storagePath = `${String(telefone).replace(/\D/g, "")}/${Date.now()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");

    // URL pública já é conhecida a partir do path — não precisa esperar o upload
    const { data: urlData } = supabase.storage.from("audios").getPublicUrl(storagePath);
    const publicUrl = urlData.publicUrl;

    const isFestas = canal === "festas";

    // Paraleliza upload ao Storage e envio ao WhatsApp. Ambos usam o mesmo buffer;
    // Z-API aceita data URL base64, evitando o round-trip de fetch da URL pública.
    const uploadPromise = supabase.storage
        .from("audios")
        .upload(storagePath, buffer, { contentType: file.type, upsert: false });

    const sendPromise = isFestas
        ? sendEvolutionAudio(String(telefone), base64)
        : sendWhatsAppAudio(String(telefone), `data:${file.type};base64,${base64}`);

    const [uploadRes, sendRes] = await Promise.all([uploadPromise, sendPromise]);

    if (uploadRes.error) {
        console.error("[sendAudioMessage] Upload falhou:", uploadRes.error.message);
        return { success: false, error: "Falha no upload do áudio." };
    }
    if (!sendRes.success) {
        console.error("[sendAudioMessage] Envio falhou:", sendRes.error);
        return { success: false, error: sendRes.error };
    }

    const messageId = isFestas
        ? (sendRes as { evoMessageId?: string }).evoMessageId
        : (sendRes as { zapiMessageId?: string }).zapiMessageId;

    const { error: dbErr } = await supabase.from("messages").insert({
        telefone: String(telefone),
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

    return { success: true };
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

        // Se for áudio armazenado no bucket, apaga o arquivo (fire-and-forget)
        if (payload.mediaType === "audio" && payload.content) {
            const STORAGE_MARKER = "/storage/v1/object/public/audios/";
            const markerIdx = payload.content.indexOf(STORAGE_MARKER);
            if (markerIdx !== -1) {
                const storagePath = payload.content.slice(markerIdx + STORAGE_MARKER.length);
                supabase.storage.from("audios").remove([storagePath])
                    .then(({ error: rmErr }) => { if (rmErr) console.error("[deleteMessage] Storage remove falhou:", rmErr.message); })
                    .catch(err => console.error("[deleteMessage] Storage remove exceção:", err));
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
    const path = `avatars/${telefone.replace(/\D/g, "")}/${Date.now()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadErr } = await supabase.storage
        .from("documents")
        .upload(path, buffer, { contentType: file.type, upsert: true });

    if (uploadErr) {
        console.error("[uploadContactPhoto] Upload falhou:", uploadErr.message);
        return { success: false, error: uploadErr.message };
    }

    const { data: urlData } = supabase.storage.from("documents").getPublicUrl(path);
    return { success: true, url: urlData.publicUrl };
}
