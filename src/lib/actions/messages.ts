"use server";

import { requireAuth } from "@/lib/auth";
import { z } from "zod";

const sendMessageSchema = z.object({
    telefone: z.string().min(8).max(20),
    mensagem: z.string().min(1).max(5000),
    sender_name: z.string().min(1).max(100),
    iaAtiva: z.boolean(),
});

/**
 * Server Action: dispara o webhook do n8n para envio via WhatsApp.
 * NÃO salva no Supabase diretamente — o n8n persiste a mensagem
 * após o envio, evitando duplicatas causadas pelo webhook ZAPI
 * ("Notificar as enviadas por mim também" ativo).
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
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        console.error(`[sendMessageToN8n] n8n respondeu ${response.status}`);
        throw new Error("Falha ao enviar mensagem via n8n");
    }

    return { success: true };
}

/**
 * Envio unificado de mensagem.
 *
 * IMPORTANTE: não há INSERT direto no Supabase aqui.
 * - IA ativa  → n8n envia via WhatsApp e persiste a mensagem
 * - Modo manual → ZAPI envia direto; o webhook "fromMe" do ZAPI
 *   volta ao n8n que persiste a mensagem
 *
 * Em ambos os casos o Realtime detecta o INSERT feito pelo n8n
 * e atualiza o chat automaticamente (~1-2s de delay).
 */
export async function sendMessage(payload: {
    telefone: string;
    mensagem: string;
    sender_name: string;
    iaAtiva: boolean;
}) {
    await requireAuth();
    const parsed = sendMessageSchema.parse(payload);

    if (parsed.iaAtiva) {
        // IA ativa → n8n processa e envia
        const webhookUrl = process.env.N8N_WEBHOOK_URL;
        if (!webhookUrl) {
            console.error("[sendMessage] N8N_WEBHOOK_URL não configurada.");
            return { success: false, warning: "Webhook não configurado" };
        }

        const response = await fetch(webhookUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
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
        // Modo manual → ZAPI envia direto
        // O webhook "fromMe" do ZAPI → n8n → persiste no Supabase
        const { sendWhatsAppMessage } = await import("@/lib/whatsapp/sender");
        const result = await sendWhatsAppMessage(
            String(parsed.telefone),
            parsed.mensagem
        );

        if (!result.success) {
            console.error(`[sendMessage] Falha no envio WhatsApp direto: ${result.error}`);
            return { success: false, error: result.error };
        }
    }

    return { success: true };
}