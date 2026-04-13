/**
 * Proxy de Webhook Z-API
 *
 * Fluxo:
 *  1. Recebe todos os eventos da Z-API.
 *  2. Ignora eventos que não são mensagens reais (status callbacks).
 *  3. Se fromMe=false (mensagem do cliente) e o phone é um número real (não LID):
 *     - Atualiza o campo chat_lid no lead para mapear LID → telefone real.
 *  4. Se fromMe=true, fromApi=false (celular físico da equipe):
 *     - Se phone é um LID, resolve o telefone real via chat_lid do lead.
 *     - Checa idempotência pelo messageId no campo metadata JSONB.
 *     - Salva no banco com sender_type='equipe'.
 *  5. Se fromMe=true, fromApi=true (enviado pelo CRM via API): ignora (já salvo).
 *  6. Repassa o payload original ao n8n de forma assíncrona (fire-and-forget).
 */

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// Tipos de evento que representam uma mensagem real chegando.
// Callbacks de status (DeliveryCallback, ReadCallback, etc.) são ignorados.
const MESSAGE_EVENT_TYPES = new Set([
  "ReceivedCallback",
  "SentCallback",
  "ReactionCallback",
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
  chatLid?: string;
  fromMe?: boolean;
  fromApi?: boolean;
  momment?: number;       // timestamp em ms (typo proposital da Z-API)
  status?: string;
  chatName?: string;
  senderName?: string;
  senderPhoto?: string;
  type?: string;
  text?: ZApiTextPayload;
  image?: ZApiImagePayload;
  document?: ZApiDocumentPayload;
  [key: string]: unknown;
}

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
    return { content: caption ? `${url}|||${caption}` : url, media_type: "image" };
  }
  if (payload.document) {
    const url = payload.document.documentUrl || "";
    const caption = payload.document.caption || "";
    return { content: caption ? `${url}|||${caption}` : url, media_type: "document" };
  }
  const tipo = (payload as Record<string, unknown>).type as string || "mensagem";
  const tipoLabel = tipo === "SentCallback" || tipo === "ReceivedCallback" ? "mídia" : tipo;
  console.warn("[ZAPI-PROXY] Tipo não tratado:", tipo, Object.keys(payload));
  return { content: `📎 ${tipoLabel} enviada pelo WhatsApp`, media_type: "document" };
}

/** Retorna true se o valor é um LID do WhatsApp (ex: "219279655968887@lid") */
function isLid(phone: string): boolean {
  return phone.includes("@lid");
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  return `55${digits}`;
}

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
    if (n8nWebhookUrl) forwardToN8n(payload, n8nWebhookUrl);
    return NextResponse.json({ status: "skipped", reason: "non-message event" });
  }

  const rawPhone = payload.phone ?? "";
  const chatLid = payload.chatLid ?? (isLid(rawPhone) ? rawPhone : null);
  const isFromMe = payload.fromMe === true;
  // fromApi=true = enviado pelo CRM via API → já salvo pela action, ignorar.
  const isFromApi = payload.fromApi === true;

  const supabase = createServerSupabaseClient();

  // --- 2. Mensagens do cliente (fromMe=false) com número real: atualiza chat_lid no lead ---
  // Isso cria o mapeamento LID → telefone que usaremos para mensagens do celular físico.
  if (!isFromMe && !isLid(rawPhone) && rawPhone) {
    const realPhone = normalizePhone(rawPhone);
    const phoneWithout55 = realPhone.startsWith("55") ? realPhone.slice(2) : realPhone;

    // Ignorar leads do canal festas — Evolution cuida deles
    const { data: canalRowClient } = await supabase
      .from("Clientes _WhatsApp")
      .select("canal")
      .or(`telefone.eq.${realPhone},telefone.eq.${phoneWithout55}`)
      .maybeSingle();

    if (canalRowClient?.canal === "festas") {
      if (n8nWebhookUrl) forwardToN8n(payload, n8nWebhookUrl);
      return NextResponse.json({ status: "skipped", reason: "festas channel" });
    }

    if (chatLid) {
      supabase
        .from("Clientes _WhatsApp")
        .update({ chat_lid: chatLid })
        .or(`telefone.eq.${realPhone},telefone.eq.${phoneWithout55}`)
        .then(({ error }) => {
          if (error) console.error("[ZAPI-PROXY] Falha ao atualizar chat_lid:", error.message);
        });
    }

    if (payload.senderPhoto) {
      supabase
        .from("Clientes _WhatsApp")
        .update({ foto_url: payload.senderPhoto })
        .or(`telefone.eq.${realPhone},telefone.eq.${phoneWithout55}`)
        .then(({ error }) => {
          if (error) console.error("[ZAPI-PROXY] Falha ao atualizar foto:", error.message);
        });
    }

    // Salvar messageId da mensagem do cliente para permitir reações futuras
    if (payload.messageId && eventType === "ReceivedCallback") {
      const { content, media_type } = extractMessageContent(payload);
      const sentAt = payload.momment
        ? new Date(payload.momment).toISOString()
        : new Date().toISOString();

      const { data: existingMsg } = await supabase
        .from("messages")
        .select("id")
        .eq("telefone", realPhone)
        .eq("metadata->>messageId", payload.messageId)
        .maybeSingle();

      if (!existingMsg) {
        supabase.from("messages").insert({
          telefone: realPhone,
          sender_type: "cliente",
          sender_name: payload.chatName || payload.senderName || null,
          content,
          media_type,
          created_at: sentAt,
          metadata: { messageId: payload.messageId },
        }).then(({ error }) => {
          if (error) console.error("[ZAPI-PROXY] Falha ao salvar msg cliente:", error.message);
        });
      }
    }
  }

  // --- 3. Mensagens da equipe (fromMe=true, fromApi=false): salvar no banco ---
  if (isFromMe && !isFromApi && payload.messageId) {
    try {
      let phone: string | null = null;

      if (!isLid(rawPhone) && rawPhone) {
        // Número real: resolve o telefone no formato exato do CRM
        const normalizedPhone = normalizePhone(rawPhone);
        const phoneWithout55 = normalizedPhone.startsWith("55") ? normalizedPhone.slice(2) : normalizedPhone;
        const { data: leadRow } = await supabase
          .from("Clientes _WhatsApp")
          .select("telefone")
          .or(`telefone.eq.${normalizedPhone},telefone.eq.${phoneWithout55}`)
          .maybeSingle();
        phone = leadRow?.telefone ?? normalizedPhone;

      } else if (chatLid) {
        // Phone é um LID: resolve usando o mapeamento chat_lid → telefone do lead
        const { data: leadRow } = await supabase
          .from("Clientes _WhatsApp")
          .select("telefone")
          .eq("chat_lid", chatLid)
          .maybeSingle();

        if (leadRow?.telefone) {
          phone = leadRow.telefone;
        } else {
          console.warn(`[ZAPI-PROXY] Lead não encontrado para chatLid=${chatLid}. Aguardando mapeamento.`);
        }
      }

      if (!phone) {
        // Sem telefone resolvido, não conseguimos salvar com segurança
        console.warn(`[ZAPI-PROXY] Telefone não resolvido para mensagem ${payload.messageId}. Skipping save.`);
      } else {
        // Verificar canal do lead — ignorar se for festas (Evolution cuida)
        const { data: canalRow } = await supabase
          .from("Clientes _WhatsApp")
          .select("canal")
          .eq("telefone", phone)
          .maybeSingle();

        if (canalRow?.canal === "festas") {
          console.log(`[ZAPI-PROXY] Lead festas — ignorando, Evolution cuida: ${phone}`);
          if (n8nWebhookUrl) forwardToN8n(payload, n8nWebhookUrl);
          return NextResponse.json({ status: "skipped", reason: "festas channel" });
        }

        // Idempotência: verifica se o messageId já foi processado
        const { data: existing } = await supabase
          .from("messages")
          .select("id")
          .eq("telefone", phone)
          .eq("metadata->>messageId", payload.messageId)
          .maybeSingle();

        if (existing) {
          console.log(`[ZAPI-PROXY] Mensagem ${payload.messageId} já registrada. Ignorando duplicata.`);
        } else {
          const { content, media_type } = extractMessageContent(payload);
          const sentAt = payload.momment
            ? new Date(payload.momment).toISOString()
            : new Date().toISOString();

          const { error: insertErr } = await supabase.from("messages").insert({
            telefone: phone,
            sender_type: "equipe",
            sender_name: payload.senderName || "Equipe",
            content,
            media_type,
            created_at: sentAt,
            metadata: { messageId: payload.messageId, chatLid, raw: payload },
          });

          if (insertErr) {
            console.error("[ZAPI-PROXY] Falha ao salvar mensagem da equipe:", insertErr.message);
          } else {
            console.log(`[ZAPI-PROXY] Mensagem da equipe salva: ${payload.messageId} para ${phone}`);
          }
        }
      }
    } catch (err) {
      console.error("[ZAPI-PROXY] Exceção ao processar mensagem da equipe:", err);
    }
  }

  // --- 4. Reações do cliente (type="ReactionCallback", fromMe=false) ---
  if (eventType === "ReactionCallback" && !isFromMe && payload.messageId) {
    try {
      const normalizedPhone = normalizePhone(rawPhone);
      const phoneWithout55 = normalizedPhone.startsWith("55")
        ? normalizedPhone.slice(2) : normalizedPhone;

      const reactionEmoji = (payload as Record<string, unknown>).emoji as string || "";
      const targetMessageId = (payload as Record<string, unknown>).reactionMessageId as string || "";

      if (!targetMessageId) {
        if (n8nWebhookUrl) forwardToN8n(payload, n8nWebhookUrl);
        return NextResponse.json({ status: "skipped", reason: "no reactionMessageId" });
      }

      const { data: targetMsg } = await supabase
        .from("messages")
        .select("id, reactions")
        .or(`telefone.eq.${normalizedPhone},telefone.eq.${phoneWithout55}`)
        .eq("metadata->>messageId", targetMessageId)
        .maybeSingle();

      if (targetMsg) {
        const reactions = (targetMsg.reactions as Record<string, string[]>) || {};
        const reacterKey = "lead";

        const newReactions: Record<string, string[]> = {};
        for (const [e, users] of Object.entries(reactions)) {
          const filtered = (users as string[]).filter((u) => u !== reacterKey);
          if (filtered.length > 0) newReactions[e] = filtered;
        }
        if (reactionEmoji) {
          newReactions[reactionEmoji] = [...(newReactions[reactionEmoji] ?? []), reacterKey];
        }

        await supabase
          .from("messages")
          .update({ reactions: newReactions })
          .eq("id", targetMsg.id);

        console.log(`[ZAPI-PROXY] Reação do lead salva: ${reactionEmoji} em ${targetMsg.id}`);
      }
    } catch (err) {
      console.error("[ZAPI-PROXY] Erro ao processar reação:", err);
    }
  }

  // --- 5. Repasse ao n8n (fire-and-forget) ---
  if (n8nWebhookUrl) {
    forwardToN8n(payload, n8nWebhookUrl);
  } else {
    console.warn("[ZAPI-PROXY] N8N_ZAPI_WEBHOOK_URL não configurada — repasse desativado.");
  }

  return NextResponse.json({ status: "ok" });
}
