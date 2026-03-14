"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

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

    const supabase = createServerSupabaseClient();

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
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        }),
    ]);

    if (insertResult.error) {
        throw new Error(`Erro ao salvar mensagem: ${insertResult.error.message}`);
    }

    return { success: true };
}
