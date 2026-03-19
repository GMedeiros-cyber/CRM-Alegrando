/**
 * Envia mensagem WhatsApp usando Evolution API (teste) ou Zapi (produção).
 * Controlado por WHATSAPP_ENV: "test" | "production"
 */
export async function sendWhatsAppMessage(
    telefone: string,
    mensagem: string
): Promise<{ success: boolean; error?: string }> {
    const env = process.env.WHATSAPP_ENV || "test";

    try {
        if (env === "production") {
            // Zapi
            const instance = process.env.ZAPI_INSTANCE;
            const token = process.env.ZAPI_TOKEN;
            const clientToken = process.env.ZAPI_CLIENT_TOKEN;

            if (!instance || !token || !clientToken) {
                return { success: false, error: "Variáveis Zapi não configuradas" };
            }

            const response = await fetch(
                `https://api.z-api.io/instances/${instance}/token/${token}/send-text`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Client-Token": clientToken,
                    },
                    body: JSON.stringify({
                        phone: telefone,
                        message: mensagem,
                    }),
                }
            );

            if (!response.ok) {
                const body = await response.text();
                return { success: false, error: `Zapi ${response.status}: ${body}` };
            }

            return { success: true };
        } else {
            // Evolution API (teste)
            const baseUrl = process.env.EVOLUTION_URL;
            const instance = process.env.EVOLUTION_INSTANCE;
            const apiKey = process.env.EVOLUTION_API_KEY;

            if (!baseUrl || !instance || !apiKey) {
                return { success: false, error: "Variáveis Evolution não configuradas" };
            }

            const response = await fetch(
                `${baseUrl}/message/sendText/${instance}`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        apikey: apiKey,
                    },
                    body: JSON.stringify({
                        number: telefone,
                        text: mensagem,
                    }),
                }
            );

            if (!response.ok) {
                const body = await response.text();
                return {
                    success: false,
                    error: `Evolution ${response.status}: ${body}`,
                };
            }

            return { success: true };
        }
    } catch (err) {
        return { success: false, error: String(err) };
    }
}
