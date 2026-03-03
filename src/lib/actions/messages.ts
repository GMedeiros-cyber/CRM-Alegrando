"use server";

/**
 * Server Action para enviar mensagem via webhook do n8n.
 * Executada no servidor, evitando bloqueio de CORS.
 */
export async function sendMessageToN8n(payload: {
    telefone: string;
    mensagem: string;
    sender_name: string;
}) {
    const webhookUrl = process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL;
    if (!webhookUrl) {
        throw new Error("NEXT_PUBLIC_N8N_WEBHOOK_URL não configurada.");
    }

    const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        throw new Error(`Erro no webhook n8n: ${response.status} ${response.statusText}`);
    }

    return { success: true };
}
