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
 * Envia áudio via WhatsApp usando endpoint /send-audio da Z-API.
 * Aceita URL pública do áudio (o Z-API faz o fetch).
 */
export async function sendWhatsAppAudio(
  telefone: string,
  audioUrl: string
): Promise<{ success: boolean; zapiMessageId?: string; error?: string }> {
  const instance = process.env.ZAPI_INSTANCE;
  const token = process.env.ZAPI_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN;

  if (!instance || !token || !clientToken) {
    console.error("[ZAPI-AUDIO] Variáveis ausentes");
    return { success: false, error: "Variáveis Z-Api não configuradas" };
  }

  const phone = formatPhoneZapi(telefone);
  if (!phone || phone.length < 10) {
    return { success: false, error: "Telefone inválido: " + telefone };
  }

  console.log("[ZAPI-AUDIO] Enviando para:", phone, "url:", audioUrl);

  try {
    const response = await fetch(`${zapiBase(instance, token)}/send-audio`, {
      method: "POST",
      headers: buildZapiHeaders(clientToken),
      body: JSON.stringify({ phone, audio: audioUrl }),
    });

    const body = await response.text();
    if (!response.ok) {
      console.error(`[ZAPI-AUDIO] Erro ${response.status}:`, body);
      return { success: false, error: `Z-Api audio ${response.status}: ${body}` };
    }

    let zapiMessageId: string | undefined;
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      zapiMessageId = (parsed.messageId as string) || undefined;
    } catch { /* ignore */ }

    console.log("[ZAPI-AUDIO] Sucesso:", zapiMessageId ?? body);
    return { success: true, zapiMessageId };
  } catch (err) {
    console.error("[ZAPI-AUDIO] Exceção:", err);
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

/**
 * Envia reação (emoji) em uma mensagem do WhatsApp.
 * Para remover uma reação existente, passe emoji="" (string vazia).
 * Conforme documentação Z-API: POST /send-reaction { phone, messageId, reaction }
 */
export async function sendWhatsAppReaction(
  telefone: string,
  zapiMessageId: string,
  emoji: string  // "" para remover
): Promise<{ success: boolean; error?: string }> {
  const instance = process.env.ZAPI_INSTANCE;
  const token = process.env.ZAPI_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN;

  if (!instance || !token || !clientToken) {
    return { success: false, error: "Variáveis Z-Api não configuradas" };
  }

  const phone = formatPhoneZapi(telefone);
  try {
    const response = await fetch(`${zapiBase(instance, token)}/send-reaction`, {
      method: "POST",
      headers: buildZapiHeaders(clientToken),
      // Z-API aceita reaction="" para remover a reação existente
      body: JSON.stringify({ phone, messageId: zapiMessageId, reaction: emoji }),
    });

    const body = await response.text();
    if (!response.ok) {
      console.error(`[ZAPI-REACT] Erro ${response.status}:`, body);
      return { success: false, error: `Z-Api reaction ${response.status}: ${body}` };
    }
    return { success: true };
  } catch (err) {
    console.error("[ZAPI-REACT] Exceção:", err);
    return { success: false, error: String(err) };
  }
}

/**
 * Envia mensagem de texto com quote (responder mensagem).
 */
export async function sendWhatsAppReply(
  telefone: string,
  zapiMessageId: string,
  text: string
): Promise<{ success: boolean; zapiMessageId?: string; error?: string }> {
  const instance = process.env.ZAPI_INSTANCE;
  const token = process.env.ZAPI_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN;

  if (!instance || !token || !clientToken) {
    return { success: false, error: "Variáveis Z-Api não configuradas" };
  }

  const phone = formatPhoneZapi(telefone);
  try {
    const response = await fetch(`${zapiBase(instance, token)}/send-text`, {
      method: "POST",
      headers: buildZapiHeaders(clientToken),
      body: JSON.stringify({ phone, message: text, messageId: zapiMessageId }),
    });

    const body = await response.text();
    if (!response.ok) {
      console.error(`[ZAPI-REPLY] Erro ${response.status}:`, body);
      return { success: false, error: `Z-Api reply ${response.status}: ${body}` };
    }
    let newMessageId: string | undefined;
    try { newMessageId = (JSON.parse(body) as Record<string, unknown>).messageId as string | undefined; } catch { /* ignore */ }
    return { success: true, zapiMessageId: newMessageId };
  } catch (err) {
    console.error("[ZAPI-REPLY] Exceção:", err);
    return { success: false, error: String(err) };
  }
}

/**
 * Apaga mensagem no WhatsApp.
 */
export async function deleteWhatsAppMessage(
  telefone: string,
  zapiMessageId: string,
  owner: boolean
): Promise<{ success: boolean; error?: string }> {
  const instance = process.env.ZAPI_INSTANCE;
  const token = process.env.ZAPI_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN;

  if (!instance || !token || !clientToken) {
    return { success: false, error: "Variáveis Z-Api não configuradas" };
  }

  const phone = formatPhoneZapi(telefone);
  try {
    const response = await fetch(
      `${zapiBase(instance, token)}/messages?messageId=${zapiMessageId}&phone=${phone}&owner=${owner}`,
      {
        method: "DELETE",
        headers: buildZapiHeaders(clientToken),
      }
    );

    const body = await response.text();
    if (!response.ok) {
      console.error(`[ZAPI-DEL] Erro ${response.status}:`, body);
      return { success: false, error: `Z-Api delete ${response.status}: ${body}` };
    }
    return { success: true };
  } catch (err) {
    console.error("[ZAPI-DEL] Exceção:", err);
    return { success: false, error: String(err) };
  }
}

/**
 * Fixa ou desafixa mensagem no WhatsApp.
 * @param duration Duração do pin: 1 = 24h, 2 = 7d, 3 = 30d
 */
export async function pinWhatsAppMessage(
  telefone: string,
  zapiMessageId: string,
  pin: boolean,
  duration: 1 | 2 | 3 = 3
): Promise<{ success: boolean; error?: string }> {
  const instance = process.env.ZAPI_INSTANCE;
  const token = process.env.ZAPI_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN;

  if (!instance || !token || !clientToken) {
    return { success: false, error: "Variáveis Z-Api não configuradas" };
  }

  const phone = formatPhoneZapi(telefone);
  try {
    const response = await fetch(`${zapiBase(instance, token)}/pin-message`, {
      method: "POST",
      headers: buildZapiHeaders(clientToken),
      body: JSON.stringify({
        phone,
        messageId: zapiMessageId,
        messageAction: pin ? "pin" : "unpin",
        pinMessageDuration: duration,
      }),
    });

    const body = await response.text();
    if (!response.ok) {
      console.error(`[ZAPI-PIN] Erro ${response.status}:`, body);
      return { success: false, error: `Z-Api pin ${response.status}: ${body}` };
    }
    return { success: true };
  } catch (err) {
    console.error("[ZAPI-PIN] Exceção:", err);
    return { success: false, error: String(err) };
  }
}

export async function sendWhatsAppMessage(
  telefone: string,
  mensagem: string
): Promise<{ success: boolean; zapiMessageId?: string; error?: string }> {
  const instance = process.env.ZAPI_INSTANCE;
  const token = process.env.ZAPI_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN;

  if (!instance || !token || !clientToken) {
    console.error("[ZAPI] Variáveis de ambiente ausentes");
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

    // Z-API returns { zaapId, messageId, id } — capture messageId for future operations
    let zapiMessageId: string | undefined;
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      zapiMessageId = (parsed.messageId as string) || undefined;
    } catch { /* response not JSON, ignore */ }

    console.log("[ZAPI] Sucesso:", zapiMessageId ?? body);
    return { success: true, zapiMessageId };
  } catch (err) {
    console.error("[ZAPI] Exceção:", err);
    return { success: false, error: String(err) };
  }
}

/**
 * Busca a foto de perfil de um número via Z-API.
 * Retorna a URL da foto ou null se indisponível.
 */
export async function fetchZapiProfilePicture(telefone: string): Promise<string | null> {
  const instance = process.env.ZAPI_INSTANCE;
  const token = process.env.ZAPI_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN;
  if (!instance || !token || !clientToken) {
    console.warn("[ZAPI-PIC] Credenciais Z-API ausentes");
    return null;
  }
  const phone = formatPhoneZapi(telefone);
  if (!phone || phone.length < 10) return null;

  try {
    const res = await fetch(
      `${zapiBase(instance, token)}/profile-picture?phone=${phone}`,
      { headers: buildZapiHeaders(clientToken) }
    );
    if (!res.ok) {
      console.warn(`[ZAPI-PIC] ${res.status} para ${phone}`);
      return null;
    }
    const body = (await res.json()) as { link?: string };
    return body.link || null;
  } catch (err) {
    console.error("[ZAPI-PIC] erro:", err);
    return null;
  }
}

// =============================================
// EVOLUTION API (canal festas)
// =============================================

function buildEvoHeaders(apiKey: string) {
  return { "Content-Type": "application/json", apikey: apiKey };
}

function evoPhone(telefone: string): string {
  const digits = telefone.replace(/\D/g, "");
  return `${digits}@s.whatsapp.net`;
}

export async function sendEvolutionReaction(
  telefone: string,
  evoMessageId: string,
  emoji: string
): Promise<{ success: boolean; error?: string }> {
  const url = process.env.EVOLUTION_API_URL;
  const instance = process.env.EVOLUTION_INSTANCE;
  const key = process.env.EVOLUTION_API_KEY;
  if (!url || !instance || !key) return { success: false, error: "Evolution API não configurada" };

  try {
    const res = await fetch(`${url}/message/sendReaction/${instance}`, {
      method: "POST",
      headers: buildEvoHeaders(key),
      body: JSON.stringify({
        key: {
          remoteJid: evoPhone(telefone),
          fromMe: true,
          id: evoMessageId,
        },
        reaction: emoji,
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error(`[EVO-REACTION] ${res.status}:`, errBody);
      return { success: false, error: `Evolution reaction ${res.status}: ${errBody}` };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function sendEvolutionReply(
  telefone: string,
  evoMessageId: string,
  text: string
): Promise<{ success: boolean; evoMessageId?: string; error?: string }> {
  const url = process.env.EVOLUTION_API_URL;
  const instance = process.env.EVOLUTION_INSTANCE;
  const key = process.env.EVOLUTION_API_KEY;
  if (!url || !instance || !key) return { success: false, error: "Evolution API não configurada" };

  try {
    const res = await fetch(`${url}/message/sendText/${instance}`, {
      method: "POST",
      headers: buildEvoHeaders(key),
      body: JSON.stringify({
        number: evoPhone(telefone),
        text,
        quoted: {
          key: {
            remoteJid: evoPhone(telefone),
            fromMe: false,
            id: evoMessageId,
          },
        },
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { success: false, error: `Evolution reply ${res.status}` };
    return { success: true, evoMessageId: (body as Record<string, unknown>)?.key ? ((body as Record<string, Record<string, unknown>>).key.id as string) : undefined };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Envia áudio via Evolution API (canal festas).
 * Endpoint: /message/sendWhatsAppAudio/{instance}
 * Body: { number, audio: base64 (sem prefixo data:) }
 */
export async function sendEvolutionAudio(
  telefone: string,
  audioBase64: string
): Promise<{ success: boolean; evoMessageId?: string; error?: string }> {
  const url = process.env.EVOLUTION_API_URL;
  const instance = process.env.EVOLUTION_INSTANCE;
  const key = process.env.EVOLUTION_API_KEY;
  if (!url || !instance || !key) {
    return { success: false, error: "Evolution API não configurada" };
  }

  const digits = telefone.replace(/\D/g, "");
  const normalized = digits.startsWith("55") && digits.length >= 12 ? digits : `55${digits}`;

  try {
    const res = await fetch(`${url}/message/sendWhatsAppAudio/${instance}`, {
      method: "POST",
      headers: buildEvoHeaders(key),
      body: JSON.stringify({
        number: normalized,
        audio: audioBase64,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(`[EVO-AUDIO] ${res.status}:`, body);
      return { success: false, error: `Evolution audio ${res.status}` };
    }
    const evoMessageId = (body as Record<string, Record<string, unknown>>)?.key?.id as string | undefined;
    return { success: true, evoMessageId };
  } catch (err) {
    console.error("[EVO-AUDIO] Exceção:", err);
    return { success: false, error: String(err) };
  }
}

export async function deleteEvolutionMessage(
  telefone: string,
  evoMessageId: string
): Promise<{ success: boolean; error?: string }> {
  const url = process.env.EVOLUTION_API_URL;
  const instance = process.env.EVOLUTION_INSTANCE;
  const key = process.env.EVOLUTION_API_KEY;
  if (!url || !instance || !key) return { success: false, error: "Evolution API não configurada" };

  try {
    const res = await fetch(`${url}/chat/deleteMessageForEveryone/${instance}`, {
      method: "DELETE",
      headers: buildEvoHeaders(key),
      body: JSON.stringify({
        id: evoMessageId,
        remoteJid: evoPhone(telefone),
        fromMe: true,
        participant: "",
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error(`[EVO-DELETE] ${res.status}:`, errBody);
      return { success: false, error: `Evolution delete ${res.status}: ${errBody}` };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
