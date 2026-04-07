/**
 * Proxy de Webhook Z-API
 *
 * Fluxo:
 *  1. Recebe todos os eventos da Z-API.
 *  2. Ignora eventos que não são mensagens reais (status callbacks).
 *  3. Se fromMe=true (mensagem enviada pela equipe pelo celular físico):
 *     - Checa idempotência pelo messageId no campo metadata JSONB.
 *     - Salva no banco com sender_type='equipe'.
 *  4. Repassa o payload original ao n8n de forma assíncrona (fire-and-forget).
 *     O n8n recebe a mensagem e decide se aciona a IA (Jade) ou não.
 */

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// Tipos de evento que representam uma mensagem real chegando.
// Callbacks de status (DeliveryCallback, ReadCallback, etc.) são ignorados.
const MESSAGE_EVENT_TYPES = new Set([
  "ReceivedCallback",
  "SentCallback",
]);

interface ZApiTextPayload {
  message: string;
}

interface ZApiImagePayload {
  imageUrl?: string;
  caption?: string;
}

interface ZApiDocumentPayload {
  documentUrl?: string;
  fileName?: string;
  caption?: string;
}

interface ZApiWebhookPayload {
  instanceId?: string;
  messageId?: string;
  phone?: string;
  fromMe?: boolean;
  momment?: number;       // timestamp em ms (typo proposital da Z-API)
  status?: string;
  chatName?: string;
  senderName?: string;
  senderPhoto?: string;
  type?: string;
  fromApi?: boolean;
  text?: ZApiTextPayload;
  image?: ZApiImagePayload;
  document?: ZApiDocumentPayload;
  [key: string]: unknown; // permite repassar o payload inteiro ao n8n
}

/**
 * Extrai o conteúdo e o media_type do payload Z-API.
 */
function extractMessageContent(payload: ZApiWebhookPayload): {
  content: string;
  media_type: "text" | "image" | "document" | "audio" | "video";
} {
  if (payload.text?.message) {
    return { content: payload.text.message, media_type: "text" };
  }
  if (payload.image) {
    const url = payload.image.imageUrl || "";
    const caption = payload.image.caption || "";
    return {
      content: caption ? `${url}|||${caption}` : url,
      media_type: "image",
    };
  }
  if (payload.document) {
    const url = payload.document.documentUrl || "";
    const caption = payload.document.caption || "";
    return {
      content: caption ? `${url}|||${caption}` : url,
      media_type: "document",
    };
  }
  // Fallback: serializa o payload para não perder dados
  return { content: JSON.stringify(payload), media_type: "text" };
}

/**
 * Normaliza o telefone: remove tudo que não é dígito,
 * garante que começa com 55 (Brasil).
 */
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  return `55${digits}`;
}

/**
 * Repassa o payload ao n8n de forma assíncrona (fire-and-forget).
 * Não aguardamos a resposta para não prender o tempo de resposta ao webhook.
 */
function forwardToN8n(payload: ZApiWebhookPayload, n8nUrl: string): void {
  fetch(n8nUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch((err) => {
    console.error("[ZAPI-PROXY] Falha ao repassar para o n8n:", err);
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let payload: ZApiWebhookPayload;

  try {
    payload = (await req.json()) as ZApiWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  const n8nWebhookUrl = process.env.N8N_ZAPI_WEBHOOK_URL;

  // --- 1. Filtro: apenas eventos de mensagem real ---
  const eventType = payload.type || "";
  if (!MESSAGE_EVENT_TYPES.has(eventType)) {
    // É um callback de status (entrega, leitura, etc.) — ignora silenciosamente.
    // Repassa ao n8n assim mesmo caso ele use esses eventos para algo.
    if (n8nWebhookUrl) forwardToN8n(payload, n8nWebhookUrl);
    return NextResponse.json({ status: "skipped", reason: "non-message event" });
  }

  const messageId = payload.messageId;
  const phoneRaw = payload.phone ? normalizePhone(payload.phone) : null;
  const isFromMe = payload.fromMe === true;
  // fromApi=true significa que a mensagem foi enviada via API (pelo CRM).
  // Nesses casos o CRM já salvou a mensagem — o proxy deve ignorar para evitar duplicata.
  const isFromApi = payload.fromApi === true;

  // --- 2. Mensagens da equipe (fromMe=true, fromApi=false): salvar no banco ---
  // fromApi=true = enviado pelo CRM via Z-API API → já salvo, ignorar.
  // fromApi=false = enviado pelo celular físico → precisa salvar aqui.
  if (isFromMe && !isFromApi && phoneRaw && messageId) {
    try {
      const supabase = createServerSupabaseClient();

      // Resolve o telefone no formato exato em que está armazenado no CRM.
      // A Z-API envia com prefixo 55, mas o CRM pode armazenar sem ele.
      // Buscamos em "Clientes _WhatsApp" pelo número normalizado OU sem o 55.
      const phoneWithout55 = phoneRaw.startsWith("55") ? phoneRaw.slice(2) : phoneRaw;
      const { data: leadRow } = await supabase
        .from("Clientes _WhatsApp")
        .select("telefone")
        .or(`telefone.eq.${phoneRaw},telefone.eq.${phoneWithout55}`)
        .maybeSingle();

      // Usa o telefone do CRM se encontrado; caso contrário, usa o normalizado
      const phone = leadRow?.telefone ?? phoneRaw;

      // Idempotência: verifica se o messageId já foi processado
      const { data: existing, error: lookupErr } = await supabase
        .from("messages")
        .select("id")
        .eq("telefone", phone)
        .eq("metadata->>messageId", messageId)
        .maybeSingle();

      if (lookupErr) {
        console.error("[ZAPI-PROXY] Erro ao checar idempotência:", lookupErr.message);
        // Continua — é melhor tentar salvar e pegar um erro de duplicata
        // do que perder a mensagem por um erro de leitura.
      }

      if (existing) {
        console.log(`[ZAPI-PROXY] Mensagem ${messageId} já registrada. Ignorando duplicata.`);
      } else {
        const { content, media_type } = extractMessageContent(payload);
        const senderName = payload.senderName || "Equipe";
        const sentAt = payload.momment
          ? new Date(payload.momment).toISOString()
          : new Date().toISOString();

        const { error: insertErr } = await supabase.from("messages").insert({
          telefone: phone,
          sender_type: "equipe",
          sender_name: senderName,
          content,
          media_type,
          created_at: sentAt,
          metadata: { messageId, raw: payload },
        });

        if (insertErr) {
          console.error("[ZAPI-PROXY] Falha ao salvar mensagem da equipe:", insertErr.message);
          // Não retorna 500 para não fazer a Z-API retentar em loop —
          // apenas loga e deixa o n8n receber o evento normalmente.
        } else {
          console.log(`[ZAPI-PROXY] Mensagem da equipe salva: ${messageId} de ${phone}`);
        }
      }
    } catch (err) {
      console.error("[ZAPI-PROXY] Exceção ao processar mensagem da equipe:", err);
    }
  }

  // --- 3. Repasse ao n8n (fire-and-forget, para todos os eventos de mensagem) ---
  // O n8n vai receber o payload original e decidir se aciona a Jade ou não.
  // Como fromMe=true já foi tratado aqui, o n8n pode ignorar esses eventos
  // ou usá-los para outras automações (ex: atualizar status do atendimento).
  if (n8nWebhookUrl) {
    forwardToN8n(payload, n8nWebhookUrl);
  } else {
    console.warn("[ZAPI-PROXY] N8N_ZAPI_WEBHOOK_URL não configurada — repasse desativado.");
  }

  // Responde imediatamente à Z-API com 200 para evitar retentativas.
  return NextResponse.json({ status: "ok" });
}
