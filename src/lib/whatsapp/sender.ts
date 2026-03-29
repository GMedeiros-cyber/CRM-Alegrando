function formatPhoneZapi(telefone: string): string {
  const digits = telefone.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  return `55${digits}`;
}

export async function sendWhatsAppMessage(
  telefone: string,
  mensagem: string
): Promise<{ success: boolean; error?: string }> {
  const instance = process.env.ZAPI_INSTANCE;
  const token = process.env.ZAPI_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN;

  if (!instance || !token || !clientToken) {
    console.error("[ZAPI] Variáveis de ambiente ausentes:", {
      instance: !!instance,
      token: !!token,
      clientToken: !!clientToken,
    });
    return { success: false, error: "Variáveis Z-Api não configuradas" };
  }

  const phone = formatPhoneZapi(telefone);
  console.log("[ZAPI] Enviando para:", phone);

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

    const body = await response.text();

    if (!response.ok) {
      console.error(`[ZAPI] Erro ${response.status}:`, body);
      return { success: false, error: `Z-Api ${response.status}: ${body}` };
    }

    console.log("[ZAPI] Sucesso:", body);
    return { success: true };
  } catch (err) {
    console.error("[ZAPI] Exceção:", err);
    return { success: false, error: String(err) };
  }
}
