// src/lib/whatsapp/sender.ts
export async function sendWhatsAppMessage(
    telefone: string,
    mensagem: string
): Promise<{ success: boolean; error?: string }> {
    const instance = process.env.ZAPI_INSTANCE;
    const token = process.env.ZAPI_TOKEN;
    const clientToken = process.env.ZAPI_CLIENT_TOKEN;

    if (!instance || !token || !clientToken) {
        return { success: false, error: "Variáveis Zapi não configuradas" };
    }

    const phone = formatPhoneZapi(telefone);

    try {
        const response = await fetch(
            `https://api.z-api.io/instances/${instance}/token/${token}/send-text`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Client-Token": clientToken,
                },
                body: JSON.stringify({ phone, message: mensagem }),
            }
        );

        if (!response.ok) {
            const body = await response.text();
            return { success: false, error: `Zapi ${response.status}: ${body}` };
        }

        return { success: true };
    } catch (err) {
        return { success: false, error: String(err) };
    }
}

function formatPhoneZapi(telefone: string): string {
    const digits = telefone.replace(/\D/g, "");
    if (digits.startsWith("55") && digits.length >= 12) return digits;
    return `55${digits}`;
}