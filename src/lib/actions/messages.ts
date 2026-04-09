"use server";

import { requireAuth } from "@/lib/auth";
import { z } from "zod";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

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
}) {
    const userId = await requireAuth();
    const parsed = sendMessageSchema.parse(payload);

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
        const { sendWhatsAppMessage } = await import("@/lib/whatsapp/sender");
        const result = await sendWhatsAppMessage(
            String(parsed.telefone),
            parsed.mensagem
        );

        if (!result.success) {
            console.error(`[sendMessage] Falha no envio WhatsApp direto: ${result.error}`);
            return { success: false, error: result.error };
        }

        const { createServerSupabaseClient } = await import("@/lib/supabase/server");
        const supabase = createServerSupabaseClient();
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

    console.log("[sendFileMessage] telefone:", telefone);
    console.log("[sendFileMessage] arquivo:", file?.name, "tamanho:", file?.size);

    if (!file || !telefone) {
        return { success: false, error: "Arquivo e telefone são obrigatórios." };
    }

    if (file.size > MAX_FILE_SIZE) {
        return { success: false, error: "Arquivo muito grande. Máximo 10MB." };
    }

    const { createServerSupabaseClient } = await import("@/lib/supabase/server");
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
    console.log("[sendFileMessage] fileUrl:", publicUrl);

    // Send via ZAPI — images use /send-image (inline), documents use /send-document/ext (base64)
    const isImage = file.type.startsWith("image/");
    let zapiResult: { success: boolean; error?: string };

    if (isImage) {
        const { sendWhatsAppImage } = await import("@/lib/whatsapp/sender");
        zapiResult = await sendWhatsAppImage(String(telefone), publicUrl, caption);
    } else {
        const { sendWhatsAppDocument } = await import("@/lib/whatsapp/sender");
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
}): Promise<{ success: boolean; newReactions?: Record<string, string[]>; error?: string }> {
    await requireAuth();

    const { createServerSupabaseClient } = await import("@/lib/supabase/server");
    const supabase = createServerSupabaseClient();

    // Busca estado ATUAL do banco (fonte de verdade)
    const { data: msg } = await supabase
        .from("messages")
        .select("reactions")
        .eq("id", payload.dbMessageId)
        .single();

    const reactions = (msg?.reactions as Record<string, string[]>) || {};

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

    // Envia para Z-API
    // Para remover: reaction="" | Para adicionar/substituir: reaction=emoji
    if (payload.zapiMessageId) {
        const { sendWhatsAppReaction } = await import("@/lib/whatsapp/sender");
        const result = await sendWhatsAppReaction(
            payload.telefone,
            payload.zapiMessageId,
            payload.emoji  // "" remove, emoji não-vazio adiciona
        );
        if (!result.success) {
            console.error("[reactToMessage] Z-API falhou:", result.error);
        }
    }

    const { error } = await supabase
        .from("messages")
        .update({ reactions: newReactions })
        .eq("id", payload.dbMessageId);

    if (error) {
        console.error("[reactToMessage] DB falhou:", error.message);
        return { success: false, error: error.message };
    }
    // Retorna o estado exato salvo no banco para o cliente aplicar diretamente
    return { success: true, newReactions };
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
}): Promise<{ success: boolean; error?: string }> {
    const userId = await requireAuth();

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
            const { sendWhatsAppReply } = await import("@/lib/whatsapp/sender");
            const result = await sendWhatsAppReply(payload.telefone, payload.replyToZapiId, payload.text);
            if (!result.success) {
                return { success: false, error: result.error };
            }
            sentZapiMessageId = result.zapiMessageId;
        } else {
            const { sendWhatsAppMessage } = await import("@/lib/whatsapp/sender");
            const result = await sendWhatsAppMessage(payload.telefone, payload.text);
            if (!result.success) {
                return { success: false, error: result.error };
            }
            sentZapiMessageId = result.zapiMessageId;
        }

        const { createServerSupabaseClient } = await import("@/lib/supabase/server");
        const supabase = createServerSupabaseClient();
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
}): Promise<{ success: boolean; error?: string }> {
    await requireAuth();

    const { createServerSupabaseClient } = await import("@/lib/supabase/server");
    const supabase = createServerSupabaseClient();

    if (payload.owner) {
        // Apagar para todos — tenta deletar no WhatsApp e marca no CRM
        if (payload.zapiMessageId) {
            const { deleteWhatsAppMessage } = await import("@/lib/whatsapp/sender");
            const result = await deleteWhatsAppMessage(payload.telefone, payload.zapiMessageId, true);
            if (!result.success) {
                console.error("[deleteMessage] Z-API falhou:", result.error);
                // Continua para marcar no CRM mesmo que o WA falhe
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
}): Promise<{ success: boolean; error?: string }> {
    await requireAuth();

    if (payload.zapiMessageId) {
        const { pinWhatsAppMessage } = await import("@/lib/whatsapp/sender");
        const result = await pinWhatsAppMessage(payload.telefone, payload.zapiMessageId, payload.pin, payload.duration ?? 3);
        if (!result.success) {
            console.error("[pinMessage] Z-API falhou:", result.error);
        }
    }

    // Atualiza no banco
    const { createServerSupabaseClient } = await import("@/lib/supabase/server");
    const supabase = createServerSupabaseClient();
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

    const { createServerSupabaseClient } = await import("@/lib/supabase/server");
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
