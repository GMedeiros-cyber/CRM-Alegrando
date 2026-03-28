"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { z } from "zod";

const sendMessageSchema = z.object({
    telefone: z.string().min(8).max(20),
    mensagem: z.string().min(1).max(5000),
    sender_name: z.string().min(1).max(100),
    iaAtiva: z.boolean(),
});

/**
 * Server Action: salva a mensagem no Supabase E dispara o webhook do n8n
 * em paralelo via Promise.all.
 *
 * - O INSERT no Supabase garante que o Realtime detecte instantaneamente
 *   e o balãozinho apareça na UI sem delay.
 * - O fetch para o n8n dispara o fluxo de envio via WhatsApp.
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
    const supabase = createServerSupabaseClient();
    const webhookToken = process.env.N8N_WEBHOOK_TOKEN || "";

    // Dispara INSERT local + webhook n8n ao mesmo tempo
    const [insertResult] = await Promise.all([
        // 1. Salva no banco → Realtime detecta → balão aparece instantaneamente
        supabase.from("messages").insert({
            telefone: payload.telefone,
            sender_type: "humano",
            sender_name: payload.sender_name,
            content: payload.mensagem,
        }),

        // 2. Dispara o n8n → envia via WhatsApp
        fetch(webhookUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(webhookToken ? { "Authorization": `Bearer ${webhookToken}` } : {}),
            },
            body: JSON.stringify(payload),
        }),
    ]);

    if (insertResult.error) {
        throw new Error(`Erro ao salvar mensagem: ${insertResult.error.message}`);
    }

    return { success: true };
}

/**
 * Envio unificado de mensagem.
 * - iaAtiva=true: salva no banco + envia via n8n
 * - iaAtiva=false (manual): salva no banco + envia direto via Evolution/Zapi
 */
export async function sendMessage(payload: {
    telefone: string;
    mensagem: string;
    sender_name: string;
    iaAtiva: boolean;
}) {
    await requireAuth();
    const parsed = sendMessageSchema.parse(payload);
    const supabase = createServerSupabaseClient();

    // 1. Salvar no banco (Realtime detecta → balão aparece)
    const { error: insertError } = await supabase.from("messages").insert({
        telefone: parsed.telefone,
        sender_type: "humano",
        sender_name: parsed.sender_name,
        content: parsed.mensagem,
    });

    if (insertError) {
        throw new Error(`Erro ao salvar mensagem: ${insertError.message}`);
    }

    // 2. Enviar via WhatsApp
    if (parsed.iaAtiva) {
        // IA ativa → n8n processa e envia
        const webhookUrl = process.env.N8N_WEBHOOK_URL;
        if (!webhookUrl) {
            console.error("[sendMessage] N8N_WEBHOOK_URL não configurada — mensagem salva mas não enviada");
            return { success: true, warning: "Mensagem salva mas não enviada (webhook não configurado)" };
        }
        const response = await fetch(webhookUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(process.env.N8N_WEBHOOK_TOKEN ? { "Authorization": `Bearer ${process.env.N8N_WEBHOOK_TOKEN}` } : {}),
            },
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
        // Modo manual → direto via Evolution/Zapi
        const { sendWhatsAppMessage } = await import("@/lib/whatsapp/sender");
        const result = await sendWhatsAppMessage(
            String(parsed.telefone),
            parsed.mensagem
        );
        if (!result.success) {
            console.error(`[sendMessage] Falha no envio WhatsApp direto: ${result.error}`);
        }
    }

    return { success: true };
}
