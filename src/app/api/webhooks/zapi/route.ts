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
import { proxyAudioToStorage } from "@/lib/whatsapp/audio-storage";
import { NextRequest, NextResponse } from "next/server";

// Tipos de evento que representam uma mensagem real chegando.
// Callbacks de status (DeliveryCallback, ReadCallback, etc.) são ignorados.
const MESSAGE_EVENT_TYPES = new Set([
  "ReceivedCallback",
  "SentCallback",
  "ReactionCallback",
]);

type MediaType = "text" | "image" | "document" | "audio" | "video"
               | "sticker" | "location" | "contact";

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

interface ZApiAudioPayload {
  audioUrl?: string;
  mimeType?: string;
}

interface ZApiVideoPayload {
  videoUrl?: string;
  caption?: string;
}

interface ZApiStickerPayload {
  stickerUrl?: string;
}

interface ZApiContactPayload {
  displayName?: string;
  vCard?: string;
}

interface ZApiLocationPayload {
  latitude?: number;
  longitude?: number;
  address?: string;
}

interface ZApiReactionPayload {
  value?: string;       // emoji
  time?: number;
  reactionBy?: string;  // lid de quem reagiu
  referencedMessage?: {
    messageId?: string; // id da msg-alvo que está sendo reagida
    fromMe?: boolean;
    phone?: string;
    participant?: string | null;
  };
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
  isGroup?: boolean;
  participantPhone?: string;
  participantLid?: string;
  type?: string;
  text?: ZApiTextPayload;
  image?: ZApiImagePayload;
  document?: ZApiDocumentPayload;
  audio?: ZApiAudioPayload;
  video?: ZApiVideoPayload;
  sticker?: ZApiStickerPayload;
  contact?: ZApiContactPayload;
  location?: ZApiLocationPayload;
  reaction?: ZApiReactionPayload;
  [key: string]: unknown;
}

function extractMessageContent(payload: ZApiWebhookPayload): {
  content: string;
  media_type: MediaType;
} {
  if (payload.text?.message) {
    return { content: payload.text.message, media_type: "text" };
  }
  if (payload.image) {
    const url = payload.image.imageUrl || "";
    const caption = payload.image.caption || "";
    return { content: caption ? `${url}|||${caption}` : url, media_type: "image" };
  }
  if (payload.video) {
    const url = payload.video.videoUrl || "";
    const caption = payload.video.caption || "";
    return { content: caption ? `${url}|||${caption}` : url, media_type: "video" };
  }
  if (payload.audio) {
    return { content: payload.audio.audioUrl || "", media_type: "audio" };
  }
  if (payload.document) {
    const url = payload.document.documentUrl || "";
    const caption = payload.document.caption || "";
    return { content: caption ? `${url}|||${caption}` : url, media_type: "document" };
  }
  if (payload.sticker) {
    return { content: payload.sticker.stickerUrl || "", media_type: "sticker" };
  }
  if (payload.location) {
    const { latitude = 0, longitude = 0, address = "" } = payload.location;
    return { content: `${latitude},${longitude}|||${address}`, media_type: "location" };
  }
  if (payload.contact) {
    return { content: payload.contact.displayName || "Contato", media_type: "contact" };
  }
  const tipo = (payload as Record<string, unknown>).type as string || "mensagem";
  console.error(
    "[ZAPI-PROXY] Tipo não reconhecido — fallback document:",
    tipo, "keys=", Object.keys(payload),
    "payload_preview=", JSON.stringify(payload).slice(0, 500)
  );
  return { content: `📎 ${tipo} enviada pelo WhatsApp`, media_type: "document" };
}

/** Retorna true se o valor é um LID do WhatsApp (ex: "219279655968887@lid") */
function isLid(phone: string): boolean {
  return phone.includes("@lid");
}

/**
 * Retorna true se for um grupo. Z-API marca grupos por:
 *  - flag isGroup=true (quando presente)
 *  - sufixo "-group" no phone
 *  - participantPhone preenchido (só existe em grupo)
 *  - phone com 18+ dígitos começando em 120363 (formato canônico do WhatsApp,
 *    com ou sem prefixo "55" herdado do webhook antigo)
 */
function isGroupChat(payload: ZApiWebhookPayload): boolean {
  if (payload.isGroup === true) return true;
  if (payload.participantPhone) return true;
  const phone = payload.phone ?? "";
  if (phone.endsWith("-group")) return true;
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("120363") && digits.length >= 18) return true;
  if (digits.startsWith("55120363") && digits.length >= 20) return true;
  return false;
}

/**
 * Normaliza o ID do grupo para o formato canônico "<digits>-group", removendo
 * prefixo "55" herdado do webhook antigo.
 */
function normalizeGroupId(phone: string): string {
  if (phone.endsWith("-group")) return phone;
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length > 18) digits = digits.slice(2);
  return `${digits}-group`;
}

function normalizePhone(phone: string): string {
  // Grupos: manter o ID exato (já vem com sufixo "-group")
  if (phone.endsWith("-group")) return phone;
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

async function processReaction(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  telefoneCandidates: { realPhone: string; phoneWithout55: string } | null,
  targetMessageId: string,
  reactionEmoji: string,
  isFromMe: boolean
): Promise<void> {
  if (!targetMessageId) return;

  let query = supabase
    .from("messages")
    .select("id, reactions")
    .eq("metadata->>messageId", targetMessageId);

  if (telefoneCandidates) {
    query = query.or(
      `telefone.eq.${telefoneCandidates.realPhone},` +
      `telefone.eq.${telefoneCandidates.phoneWithout55}`
    );
  }

  const { data: targetMsg } = await query.maybeSingle();
  if (!targetMsg) {
    console.warn(`[ZAPI-PROXY] Reação ignorada — msg ${targetMessageId} não encontrada`);
    return;
  }

  const reactions = (targetMsg.reactions as Record<string, string[]>) || {};
  const reacterKey = isFromMe ? "equipe" : "lead";

  // Remove reação anterior do mesmo autor (WhatsApp só permite uma por usuário)
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

  console.log(`[ZAPI-PROXY] Reação ${reactionEmoji} (${reacterKey}) salva em ${targetMsg.id}`);
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
  // Status callbacks (DeliveryCallback, ReadCallback, etc.) não vão para o n8n —
  // o agente IA não tem o que fazer com eles e cada forward gera execução desnecessária.
  const eventType = payload.type || "";
  if (!MESSAGE_EVENT_TYPES.has(eventType)) {
    return NextResponse.json({ status: "skipped", reason: "non-message event" });
  }

  const rawPhone = payload.phone ?? "";
  const chatLid = payload.chatLid ?? (isLid(rawPhone) ? rawPhone : null);
  const isFromMe = payload.fromMe === true;
  // fromApi=true = enviado pelo CRM via API → já salvo pela action, ignorar.
  const isFromApi = payload.fromApi === true;
  const isGroup = isGroupChat(payload);

  const supabase = createServerSupabaseClient();

  // --- 1.4. Mensagens de grupo: handler dedicado ---
  // Grupos têm phone com sufixo "-group" e payload.participantPhone com quem mandou.
  // Tratamos grupos como contatos "alegrando" com canal_extra="grupo" — sem IA.
  if (isGroup && rawPhone) {
    const groupId = normalizeGroupId(rawPhone); // ex: "120363403370100000-group"
    const groupName = payload.chatName || "Grupo WhatsApp";

    if (eventType === "ReceivedCallback" && !isFromMe && payload.messageId) {
      // Garantir que o grupo exista como contato
      await supabase.from("Clientes _WhatsApp").upsert(
        {
          telefone: groupId,
          nome: groupName,
          canal: "alegrando",
          ia_ativa: false,
        },
        { onConflict: "telefone" }
      );

      // Backfill foto do grupo (apenas se ainda não tiver) — fire-and-forget.
      // senderPhoto no payload de grupo geralmente é a foto do PARTICIPANTE,
      // não do grupo. Buscamos a foto do grupo pelo endpoint profile-picture.
      supabase
        .from("Clientes _WhatsApp")
        .select("foto_url")
        .eq("telefone", groupId)
        .is("foto_url", null)
        .maybeSingle()
        .then(async ({ data: needsPhoto }) => {
          if (!needsPhoto) return;
          const { fetchZapiProfilePicture } = await import("@/lib/whatsapp/sender");
          const url = await fetchZapiProfilePicture(groupId);
          if (url) {
            supabase
              .from("Clientes _WhatsApp")
              .update({ foto_url: url })
              .eq("telefone", groupId)
              .then(({ error }) => {
                if (error) console.error("[ZAPI-PROXY] Falha foto grupo:", error.message);
              });
          }
        });

      const { content: rawContent, media_type } = extractMessageContent(payload);
      const sentAt = payload.momment
        ? new Date(payload.momment).toISOString()
        : new Date().toISOString();

      const { data: existingGroupMsg } = await supabase
        .from("messages")
        .select("id")
        .eq("telefone", groupId)
        .eq("metadata->>messageId", payload.messageId)
        .maybeSingle();

      if (!existingGroupMsg) {
        let content = rawContent;
        if (media_type === "audio" && rawContent.startsWith("http")) {
          const proxied = await proxyAudioToStorage(
            supabase, rawContent, groupId, payload.messageId
          );
          if (proxied) content = proxied;
        }

        await supabase.from("messages").insert({
          telefone: groupId,
          sender_type: "cliente",
          sender_name: payload.senderName || payload.participantPhone || null,
          content,
          media_type,
          created_at: sentAt,
          metadata: {
            messageId: payload.messageId,
            isGroup: true,
            participantPhone: payload.participantPhone ?? null,
            participantLid: payload.participantLid ?? null,
          },
        });
      }
    } else if (isFromMe && !isFromApi && payload.messageId && eventType !== "ReactionCallback") {
      // Mensagem da equipe enviada para o grupo via celular físico
      const { data: existingTeamMsg } = await supabase
        .from("messages")
        .select("id")
        .eq("telefone", groupId)
        .eq("metadata->>messageId", payload.messageId)
        .maybeSingle();

      if (!existingTeamMsg) {
        const { content: rawContent, media_type } = extractMessageContent(payload);
        const sentAt = payload.momment
          ? new Date(payload.momment).toISOString()
          : new Date().toISOString();

        let content = rawContent;
        if (media_type === "audio" && rawContent.startsWith("http")) {
          const proxied = await proxyAudioToStorage(
            supabase, rawContent, groupId, payload.messageId
          );
          if (proxied) content = proxied;
        }

        await supabase.from("messages").insert({
          telefone: groupId,
          sender_type: "equipe",
          sender_name: payload.senderName || "Equipe",
          content,
          media_type,
          created_at: sentAt,
          metadata: { messageId: payload.messageId, isGroup: true },
        });
      }
    }

    // Não repassa grupos ao n8n (Jade não atende grupos)
    return NextResponse.json({ status: "ok", type: "group" });
  }

  // --- 1.5. Reação embutida em ReceivedCallback/SentCallback ---
  // Z-API envia reações como ReceivedCallback com reaction.referencedMessage.messageId
  // (não como ReactionCallback). Early return para não cair no fallback que gera
  // "📎 ReceivedCallback enviada pelo WhatsApp".
  const embeddedTargetId = payload.reaction?.referencedMessage?.messageId;
  if (payload.reaction && embeddedTargetId) {
    const realPhone = rawPhone && !isLid(rawPhone) ? normalizePhone(rawPhone) : null;
    const phoneWithout55 = realPhone && realPhone.startsWith("55")
      ? realPhone.slice(2) : realPhone;
    const telefoneCandidates = realPhone && phoneWithout55
      ? { realPhone, phoneWithout55 }
      : null;

    await processReaction(
      supabase,
      telefoneCandidates,
      embeddedTargetId,
      payload.reaction.value || "",
      isFromMe
    );

    // Reação já foi totalmente tratada — não reencaminhar ao n8n (evita execução
    // que cairia no filtro do If6 e geraria ruído no histórico).
    return NextResponse.json({ status: "ok", type: "reaction-embedded" });
  }

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
      // Canal festas é tratado pela Evolution — n8n não atende esses leads.
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

    // Se não veio senderPhoto, busca proativamente na Z-API quando lead
    // já existe mas ainda não tem foto (fire-and-forget)
    if (!payload.senderPhoto) {
      supabase
        .from("Clientes _WhatsApp")
        .select("telefone, foto_url")
        .or(`telefone.eq.${realPhone},telefone.eq.${phoneWithout55}`)
        .is("foto_url", null)
        .maybeSingle()
        .then(async ({ data: leadSemFoto }) => {
          if (!leadSemFoto) return;
          const { fetchZapiProfilePicture } = await import("@/lib/whatsapp/sender");
          const url = await fetchZapiProfilePicture(String(leadSemFoto.telefone));
          if (url) {
            supabase
              .from("Clientes _WhatsApp")
              .update({ foto_url: url })
              .eq("telefone", leadSemFoto.telefone)
              .then(({ error }) => {
                if (error) console.error("[ZAPI-PROXY] Falha backfill foto:", error.message);
              });
          }
        });
    }

    // Salvar messageId da mensagem do cliente para permitir reações futuras
    if (payload.messageId && eventType === "ReceivedCallback") {
      const { content: rawContent, media_type } = extractMessageContent(payload);
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
        // Dedup multi-dispositivo: mesma mensagem chega com messageIds distintos
        // quando o número tem WhatsApp ativo em vários celulares (ex: auto-reply).
        // Janela de 2s é segura — auto-replies disparam em < 100ms; humanos não
        // conseguem digitar e enviar a mesma mensagem duas vezes em 2 segundos.
        const windowStart = new Date(new Date(sentAt).getTime() - 2000).toISOString();
        const { data: recentDup } = await supabase
          .from("messages")
          .select("id")
          .eq("telefone", realPhone)
          .eq("sender_type", "cliente")
          .eq("content", rawContent)
          .gte("created_at", windowStart)
          .maybeSingle();

        if (recentDup) {
          console.log(`[ZAPI-PROXY] Dedup multi-device: conteúdo idêntico em 2s para ${realPhone}. Ignorando.`);
        } else {
          let content = rawContent;
          if (media_type === "audio" && rawContent.startsWith("http")) {
            const proxied = await proxyAudioToStorage(
              supabase, rawContent, realPhone, payload.messageId
            );
            if (proxied) content = proxied;
          }

          supabase.from("messages").insert({
            telefone: realPhone,
            sender_type: "cliente",
            // senderName antes de chatName: chatName pode trazer o nome do
            // aparelho conectado em alguns payloads, gerando falsos "Alegrando
            // Eventos" para mensagens de leads.
            sender_name: payload.senderName || payload.chatName || null,
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
  }

  // --- 3. Mensagens da equipe (fromMe=true, fromApi=false): salvar no banco ---
  if (isFromMe && !isFromApi && payload.messageId && eventType !== "ReactionCallback") {
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
          // Canal festas é tratado pela Evolution — n8n não atende esses leads.
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
          const { content: rawContent, media_type } = extractMessageContent(payload);
          const sentAt = payload.momment
            ? new Date(payload.momment).toISOString()
            : new Date().toISOString();

          let content = rawContent;
          if (media_type === "audio" && rawContent.startsWith("http")) {
            const proxied = await proxyAudioToStorage(
              supabase, rawContent, phone, payload.messageId
            );
            if (proxied) content = proxied;
          }

          const { error: insertErr } = await supabase.from("messages").insert({
            telefone: phone,
            sender_type: "equipe",
            sender_name: payload.senderName || "Equipe",
            content,
            media_type,
            created_at: sentAt,
            metadata: { messageId: payload.messageId, chatLid },
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
        // Reação sem alvo é evento anômalo — n8n não tem o que fazer.
        return NextResponse.json({ status: "skipped", reason: "no reactionMessageId" });
      }

      await processReaction(
        supabase,
        { realPhone: normalizedPhone, phoneWithout55 },
        targetMessageId,
        reactionEmoji,
        false
      );
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
