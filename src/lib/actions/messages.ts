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
            sender_type: "humano",
            sender_name: parsed.sender_name,
            content: parsed.mensagem,
            media_type: "text",
            created_by: userId,
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
        sender_type: "humano",
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
