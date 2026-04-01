function formatPhoneZapi(telefone: string): string {
  const digits = telefone.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  return `55${digits}`;
}

function buildZapiHeaders(clientToken: string) {
  return {
    "Content-Type": "application/json",
    "Client-Token": clientToken,
  };
}

function zapiBase(instance: string, token: string) {
  return `https://api.z-api.io/instances/${instance}/token/${token}`;
}

/**
 * Envia imagem via WhatsApp (aparece inline no chat do destinatário).
 * Usa o endpoint /send-image com URL pública.
 */
export async function sendWhatsAppImage(
  telefone: string,
  imageUrl: string,
  caption?: string
): Promise<{ success: boolean; error?: string }> {
  const instance = process.env.ZAPI_INSTANCE;
  const token = process.env.ZAPI_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN;

  if (!instance || !token || !clientToken) {
    console.error("[ZAPI-IMG] Variáveis ausentes");
    return { success: false, error: "Variáveis Z-Api não configuradas" };
  }

  const phone = formatPhoneZapi(telefone);
  if (!phone || phone.length < 10) {
    return { success: false, error: "Telefone inválido: " + telefone };
  }

  console.log("[ZAPI-IMG] Enviando para:", phone, "url:", imageUrl);

  try {
    const response = await fetch(`${zapiBase(instance, token)}/send-image`, {
      method: "POST",
      headers: buildZapiHeaders(clientToken),
      body: JSON.stringify({ phone, image: imageUrl, caption: caption || "" }),
    });

    const body = await response.text();
    if (!response.ok) {
      console.error(`[ZAPI-IMG] Erro ${response.status}:`, body);
      return { success: false, error: `Z-Api image ${response.status}: ${body}` };
    }

    console.log("[ZAPI-IMG] Sucesso:", body);
    return { success: true };
  } catch (err) {
    console.error("[ZAPI-IMG] Exceção:", err);
    return { success: false, error: String(err) };
  }
}

/**
 * Envia documento (PDF, etc.) via WhatsApp como arquivo real (base64).
 * O destinatário vê o arquivo para download, não uma referência URL.
 */
export async function sendWhatsAppDocument(
  telefone: string,
  fileContentBase64: string,
  fileName: string,
  caption?: string
): Promise<{ success: boolean; error?: string }> {
  const instance = process.env.ZAPI_INSTANCE;
  const token = process.env.ZAPI_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN;

  if (!instance || !token || !clientToken) {
    console.error("[ZAPI-DOC] Variáveis ausentes");
    return { success: false, error: "Variáveis Z-Api não configuradas" };
  }

  const phone = formatPhoneZapi(telefone);
  if (!phone || phone.length < 10) {
    console.error("[ZAPI-DOC] Telefone inválido:", telefone);
    return { success: false, error: "Telefone inválido: " + telefone };
  }

  // Extensão sem ponto, ex: "pdf", "docx"
  const extension = fileName.split(".").pop()?.toLowerCase() || "bin";

  // ZAPI espera data URI: "data:{mimeType};base64,{content}"
  const mimeMap: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    txt: "text/plain",
    csv: "text/csv",
  };
  const mime = mimeMap[extension] || "application/octet-stream";
  const dataUri = `data:${mime};base64,${fileContentBase64}`;

  console.log("[ZAPI-DOC] Enviando para:", phone, "arquivo:", fileName, "ext:", extension, "mime:", mime);

  try {
    const response = await fetch(
      `${zapiBase(instance, token)}/send-document/${extension}`,
      {
        method: "POST",
        headers: buildZapiHeaders(clientToken),
        body: JSON.stringify({
          phone,
          document: dataUri,
          fileName,
          caption: caption || "",
        }),
      }
    );

    const body = await response.text();
    if (!response.ok) {
      console.error(`[ZAPI-DOC] Erro ${response.status}:`, body);
      return { success: false, error: `Z-Api doc ${response.status}: ${body}` };
    }

    console.log("[ZAPI-DOC] Sucesso:", body);
    return { success: true };
  } catch (err) {
    console.error("[ZAPI-DOC] Exceção:", err);
    return { success: false, error: String(err) };
  }
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
      `${zapiBase(instance, token)}/send-text`,
      {
        method: "POST",
        headers: buildZapiHeaders(clientToken),
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
