"use server";

import { google } from "googleapis";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { fetchWithTimeout } from "@/lib/fetch-utils";
import { extractEmails, pickEmails, plainTextToHtml } from "@/lib/email/format";
import { cleanEditorHtml, isEditorEmpty, wrapEmailHtml } from "@/lib/email/editor";
import { presignedPutUrl, r2PublicUrl } from "@/lib/whatsapp/r2-client";
import { MAX_TOTAL_BYTES } from "@/lib/email/attachments";
import type {
    EmailAttachment,
    EmailConversation,
    EmailFieldKey,
    EmailReplyRecord,
    EmailSendStatus,
    EmailThreadMessage,
    LeadEmailRow,
    SendEmailResult,
} from "@/lib/types/email";

/**
 * O webhook do n8n responde ASSIM QUE RECEBE o lote (responseMode
 * onReceived) — o envio em si continua em segundo plano, atualizando o status
 * de cada linha no Supabase. Então este timeout cobre só a entrega do payload,
 * e um estouro aqui é rede ruim, não lote grande.
 *
 * Antes o n8n respondia no fim do loop, com 2s de espera por e-mail: um envio
 * único levava ~2,8s. Medido depois da mudança: ~80ms.
 */
const N8N_TIMEOUT_MS = 30_000;

/** PostgREST manda o `in()` na URL — lotes grandes precisam ser fatiados. */
const IN_CHUNK_SIZE = 200;

function chunk<T>(items: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
}

/** Resolve o uuid de `Clientes _WhatsApp` a partir de (telefone, canal). */
async function resolveLeadUuid(telefone: string, canal: string): Promise<string | null> {
    const supabase = createServerSupabaseClient();
    const { data } = await supabase
        .from("Clientes _WhatsApp")
        .select("id")
        .eq("telefone", telefone)
        .eq("canal", canal)
        .maybeSingle();
    return data?.id ?? null;
}

type LeadRow = {
    id: string;
    nome: string | null;
    telefone: string | number | null;
    canal: string | null;
    email: string | null;
    instituicao_email: string | null;
    coordenadora_email: string | null;
    diretora_email: string | null;
};

const LEAD_EMAIL_SELECT =
    "id, nome, telefone, canal, email, instituicao_email, coordenadora_email, diretora_email";

// =============================================================
// LEITURA
// =============================================================

/**
 * Leads que têm QUALQUER uma das tags (união, sem duplicar).
 * Lança em caso de erro de query — devolver lista parcial num fluxo de disparo
 * faria a equipe achar que mandou pra todo mundo tendo mandado pra menos.
 */
export async function listLeadsByLabels(labelIds: string[]): Promise<LeadEmailRow[]> {
    await requireAuth();
    if (labelIds.length === 0) return [];

    const supabase = createServerSupabaseClient();
    const { data: links, error: linksError } = await supabase
        .from("lead_labels")
        .select("lead_id, label_id")
        .in("label_id", labelIds);

    if (linksError) {
        console.error("[listLeadsByLabels] lead_labels:", linksError.message);
        throw new Error("Erro ao carregar os leads das tags selecionadas.");
    }

    const labelsByLead = new Map<string, string[]>();
    for (const link of links || []) {
        const current = labelsByLead.get(link.lead_id) || [];
        current.push(link.label_id);
        labelsByLead.set(link.lead_id, current);
    }

    const leadIds = [...labelsByLead.keys()];
    if (leadIds.length === 0) return [];

    const rows: LeadEmailRow[] = [];
    for (const ids of chunk(leadIds, IN_CHUNK_SIZE)) {
        const { data, error } = await supabase
            .from("Clientes _WhatsApp")
            .select(LEAD_EMAIL_SELECT)
            .in("id", ids);

        if (error) {
            console.error("[listLeadsByLabels] Clientes _WhatsApp:", error.message);
            throw new Error("Erro ao carregar os leads das tags selecionadas.");
        }

        for (const row of (data || []) as LeadRow[]) {
            rows.push({
                leadId: row.id,
                nome: row.nome,
                telefone: String(row.telefone ?? ""),
                canal: row.canal || "alegrando",
                emails: extractEmails(row),
                labelIds: labelsByLead.get(row.id) || [],
            });
        }
    }

    rows.sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
    return rows;
}

const REPLY_COLUMNS =
    "id, from_email, from_name, subject, snippet, body_text, body_text_full, body_html, received_at, read_at, attachments";

/** Sem a migração de anexo/corpo completo ainda aplicada. */
const REPLY_COLUMNS_MINIMO =
    "id, from_email, from_name, subject, snippet, body_text, body_html, received_at, read_at";

function anexosDe(valor: unknown): EmailAttachment[] {
    return Array.isArray(valor) ? (valor as EmailAttachment[]) : [];
}

function mapReply(r: Record<string, unknown>): EmailReplyRecord {
    return {
        id: String(r.id),
        fromEmail: String(r.from_email ?? ""),
        fromName: (r.from_name as string) ?? null,
        subject: (r.subject as string) ?? null,
        snippet: (r.snippet as string) ?? null,
        bodyText: (r.body_text as string) ?? null,
        bodyTextFull: (r.body_text_full as string) ?? null,
        bodyHtml: (r.body_html as string) ?? null,
        receivedAt: String(r.received_at ?? ""),
        readAt: (r.read_at as string) ?? null,
        attachments: anexosDe(r.attachments),
    };
}

/** É aviso de não entrega, e não alguém escrevendo de volta? */
function ehDevolucao(fromEmail: string, subject: string | null): boolean {
    const de = fromEmail.toLowerCase();
    return (
        de.startsWith("mailer-daemon@") ||
        de.startsWith("postmaster@") ||
        /delivery status notification|undeliverable|returned mail/i.test(subject || "")
    );
}

/**
 * Conversas de e-mail de um lead.
 *
 * Agrupa por thread do Gmail: o e-mail que saiu, a resposta da escola e a
 * nossa réplica pertencem à MESMA conversa. Antes cada um virava uma linha na
 * lista, e a tela dava a impressão de três e-mails soltos.
 *
 * Envio que ainda não tem thread (na fila, programado, falhou) vira uma
 * conversa de uma mensagem só, chaveada pelo próprio id.
 */
export async function listLeadEmailConversations(
    telefone: string,
    canal: string = "alegrando",
): Promise<EmailConversation[]> {
    await requireAuth();
    const leadId = await resolveLeadUuid(telefone, canal);
    if (!leadId) return [];

    const supabase = createServerSupabaseClient();
    const BASE_COLUMNS =
        "id, recipient_email, subject, status, error, origem, created_at, sent_at, gmail_thread_id";
    const COM_EXTRAS = `${BASE_COLUMNS}, scheduled_for, attachments`;

    async function query(columns: string, comRespostas: boolean) {
        const q = supabase
            .from("email_sends")
            .select(columns)
            .eq("lead_id", leadId)
            .order("created_at", { ascending: false })
            .limit(40);
        return comRespostas
            ? q.order("received_at", { referencedTable: "email_replies", ascending: true })
            : q;
    }

    // PGRST200 = relacionamento inexistente, 42P01 = tabela, 42703 = coluna,
    // PGRST204 = coluna desconhecida no select. Só esses: cair de nível por
    // erro de rede esconderia a falha como "esse lead não tem resposta".
    const semEstrutura = (code?: string) =>
        code === "PGRST200" || code === "PGRST204" || code === "42P01" || code === "42703";

    let { data, error } = await query(`${COM_EXTRAS}, email_replies(${REPLY_COLUMNS})`, true);
    if (semEstrutura(error?.code)) {
        ({ data, error } = await query(
            `${COM_EXTRAS}, email_replies(${REPLY_COLUMNS_MINIMO})`,
            true,
        ));
    }
    if (semEstrutura(error?.code)) ({ data, error } = await query(COM_EXTRAS, false));
    if (semEstrutura(error?.code)) ({ data, error } = await query(BASE_COLUMNS, false));

    if (error) {
        console.error("[listLeadEmailConversations]", error.message);
        return [];
    }

    const linhas = ((data || []) as unknown as Record<string, unknown>[]).map((r) => ({
        id: String(r.id),
        recipientEmail: String(r.recipient_email ?? ""),
        subject: String(r.subject ?? ""),
        status: (r.status || "pending") as EmailSendStatus,
        error: (r.error as string) ?? null,
        origem: (r.origem as string) ?? null,
        createdAt: String(r.created_at ?? ""),
        sentAt: (r.sent_at as string) ?? null,
        scheduledFor: (r.scheduled_for as string) ?? null,
        threadId: (r.gmail_thread_id as string) ?? null,
        attachments: anexosDe(r.attachments),
        replies: Array.isArray(r.email_replies)
            ? (r.email_replies as Record<string, unknown>[]).map(mapReply)
            : [],
    }));

    // Sem thread ainda, a chave é o próprio id: um envio na fila não pode ser
    // fundido com outro só porque os dois têm thread nula.
    const grupos = new Map<string, typeof linhas>();
    for (const linha of linhas) {
        const chave = linha.threadId || `send:${linha.id}`;
        const atual = grupos.get(chave) || [];
        atual.push(linha);
        grupos.set(chave, atual);
    }

    const conversas: EmailConversation[] = [];

    for (const grupo of grupos.values()) {
        // Do mais antigo pro mais novo: a raiz da conversa é o primeiro envio.
        grupo.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        const raiz = grupo[0];
        const ultimoEnvio = grupo[grupo.length - 1];

        const messages: EmailThreadMessage[] = [];

        for (const envio of grupo) {
            messages.push({
                id: envio.id,
                direcao: "enviado",
                autor: "Alegrando",
                at: envio.sentAt || envio.scheduledFor || envio.createdAt,
                bodyHtml: null,
                bodyText: null,
                bodyTextFull: null,
                attachments: envio.attachments,
                status: envio.status,
                error: envio.error,
                readAt: null,
                devolucao: false,
            });

            for (const resposta of envio.replies) {
                messages.push({
                    id: resposta.id,
                    direcao: "recebido",
                    autor: resposta.fromName || resposta.fromEmail,
                    at: resposta.receivedAt,
                    bodyHtml: null,
                    bodyText: resposta.bodyText ?? resposta.snippet,
                    bodyTextFull: resposta.bodyTextFull,
                    attachments: resposta.attachments,
                    status: null,
                    error: null,
                    readAt: resposta.readAt,
                    devolucao: ehDevolucao(resposta.fromEmail, resposta.subject),
                });
            }
        }

        messages.sort((a, b) => a.at.localeCompare(b.at));

        const recebidas = messages.filter((m) => m.direcao === "recebido");
        const ultimaRecebidaReal = [...recebidas].reverse().find((m) => !m.devolucao);

        conversas.push({
            id: raiz.id,
            subject: raiz.subject,
            recipientEmail: raiz.recipientEmail,
            lastActivityAt: messages[messages.length - 1]?.at || raiz.createdAt,
            unreadCount: recebidas.filter((m) => m.readAt === null).length,
            status: ultimoEnvio.status,
            error: ultimoEnvio.error,
            scheduledFor: ultimoEnvio.scheduledFor,
            messages,
            replyTargetId: ultimaRecebidaReal?.id ?? null,
        });
    }

    // Resposta nova sobe a conversa.
    conversas.sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
    return conversas.slice(0, 20);
}

/**
 * Marca uma resposta como lida.
 *
 * Idempotente de propósito: o filtro `is null` faz a segunda chamada não
 * mexer em nada, então abrir a mesma resposta duas vezes não reescreve a data
 * da primeira leitura.
 */
export async function markEmailRepliesRead(
    replyIds: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
    await requireAuth();
    if (replyIds.length === 0) return { ok: true };
    const supabase = createServerSupabaseClient();

    const { error } = await supabase
        .from("email_replies")
        .update({ read_at: new Date().toISOString() })
        .in("id", replyIds)
        .is("read_at", null);

    if (error) {
        console.error("[markEmailRepliesRead]", error.message);
        return { ok: false, error: "Não foi possível marcar como lida." };
    }
    return { ok: true };
}

/**
 * Quantas respostas ainda não foram lidas — alimenta o badge do menu.
 *
 * `head: true` faz o PostgREST devolver só a contagem no cabeçalho, sem
 * trazer linha nenhuma.
 */
export async function countUnreadEmailReplies(): Promise<number> {
    await requireAuth();
    const supabase = createServerSupabaseClient();

    const { count, error } = await supabase
        .from("email_replies")
        .select("id", { count: "exact", head: true })
        .is("read_at", null);

    if (error) {
        console.error("[countUnreadEmailReplies]", error.message);
        return 0;
    }
    return count ?? 0;
}

/** Resposta não lida agregada por lead, pra lista de Conversas. */
export type LeadEmailUnread = {
    telefone: string;
    canal: string;
    count: number;
    /** Data da resposta mais recente — entra no critério de ordenação. */
    lastReplyAt: string;
};

/**
 * Leads com resposta de e-mail não lida.
 *
 * Traz TODOS, não só os da página atual: é isso que permite içar pro topo um
 * lead cuja última atividade foi um e-mail, e que por WhatsApp estaria
 * enterrado na página 4. O volume é naturalmente pequeno — são respostas
 * pendentes de leitura, não histórico.
 */
export async function listLeadsWithUnreadEmail(): Promise<LeadEmailUnread[]> {
    await requireAuth();
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
        .from("email_replies")
        .select("lead_id, received_at")
        .is("read_at", null)
        .not("lead_id", "is", null)
        .order("received_at", { ascending: false })
        .limit(500);

    if (error) {
        console.error("[listLeadsWithUnreadEmail]", error.message);
        return [];
    }

    const porLead = new Map<string, { count: number; lastReplyAt: string }>();
    for (const linha of data || []) {
        const id = String(linha.lead_id);
        const atual = porLead.get(id);
        const at = String(linha.received_at ?? "");
        if (atual) {
            atual.count += 1;
            if (at > atual.lastReplyAt) atual.lastReplyAt = at;
        } else {
            porLead.set(id, { count: 1, lastReplyAt: at });
        }
    }

    if (porLead.size === 0) return [];

    // A lista de Conversas é chaveada por telefone+canal, não pelo uuid.
    const saida: LeadEmailUnread[] = [];
    for (const ids of chunk([...porLead.keys()], IN_CHUNK_SIZE)) {
        const { data: leads, error: leadsError } = await supabase
            .from("Clientes _WhatsApp")
            .select("id, telefone, canal")
            .in("id", ids);

        if (leadsError) {
            console.error("[listLeadsWithUnreadEmail] leads:", leadsError.message);
            return [];
        }

        for (const lead of leads || []) {
            const agregado = porLead.get(String(lead.id));
            if (!agregado) continue;
            saida.push({
                telefone: String(lead.telefone ?? ""),
                canal: lead.canal || "alegrando",
                count: agregado.count,
                lastReplyAt: agregado.lastReplyAt,
            });
        }
    }

    return saida;
}

/**
 * Apaga uma linha de `email_sends`.
 *
 * Serve pros dois casos, porque no banco são a mesma operação:
 * - agendado que ainda não saiu → sumindo a linha, o worker não a encontra
 *   mais e o envio é cancelado;
 * - já enviado → some só o REGISTRO no CRM. A mensagem já entregue na caixa
 *   do destinatário não é afetada — nada aqui "desenvia" e-mail.
 */
export async function deleteEmailConversation(
    sendIds: string[],
): Promise<{ ok: true; eraAgendado: boolean } | { ok: false; error: string }> {
    await requireAuth();
    if (sendIds.length === 0) return { ok: false, error: "Nada a remover." };
    const supabase = createServerSupabaseClient();

    // As respostas primeiro: elas referenciam o envio por chave estrangeira,
    // então apagar o envio antes seria recusado pelo banco.
    const { error: repliesError } = await supabase
        .from("email_replies")
        .delete()
        .in("email_send_id", sendIds);

    if (repliesError && repliesError.code !== "42P01") {
        console.error("[deleteEmailConversation] respostas:", repliesError.message);
        return { ok: false, error: "Não foi possível remover as respostas da conversa." };
    }

    const { data, error } = await supabase
        .from("email_sends")
        .delete()
        .in("id", sendIds)
        .select("id, status");

    if (error) return { ok: false, error: error.message };
    if (!data || data.length === 0) {
        return { ok: false, error: "Registro não encontrado — talvez já tenha sido removido." };
    }
    return { ok: true, eraAgendado: data.some((r) => r.status === "scheduled") };
}

// =============================================================
// ENVIO
// =============================================================

async function markFailed(ids: string[], message: string): Promise<void> {
    if (ids.length === 0) return;
    const supabase = createServerSupabaseClient();
    const { error } = await supabase
        .from("email_sends")
        .update({ status: "failed", error: message.slice(0, 500) })
        .in("id", ids);
    if (error) console.error("[markFailed]", error.message);
}

/**
 * Converte o que veio do editor no HTML que vai pro Gmail.
 *
 * Texto puro (sem tag nenhuma) ainda passa pela conversão, pra manter as
 * quebras de linha de quem colar texto de outro lugar.
 */
function prepararCorpo(raw: string): { ok: true; html: string } | { ok: false; error: string } {
    const corpo = raw.trim();
    if (!corpo || isEditorEmpty(corpo)) {
        return { ok: false, error: "Escreva o corpo do e-mail." };
    }
    const html = /<[a-z][\s\S]*>/i.test(corpo)
        ? wrapEmailHtml(cleanEditorHtml(corpo))
        : wrapEmailHtml(plainTextToHtml(corpo));
    return { ok: true, html };
}

/** Anexos cabem no teto do Gmail? A soma vale pra mensagem inteira. */
function conferirAnexos(attachments: EmailAttachment[]): string | null {
    const total = attachments.reduce((sum, a) => sum + (a.size || 0), 0);
    if (total <= MAX_TOTAL_BYTES) return null;
    return `Anexos somam ${(total / 1024 / 1024).toFixed(1)}MB — o Gmail aceita até 25MB por mensagem.`;
}

/**
 * Entrega o lote ao webhook do n8n e traduz o resultado.
 *
 * Um `sendId` já gravado é o combinado: se o n8n aceitar, ele mesmo atualiza
 * cada linha pra sent/failed. Daqui pra frente o CRM só observa.
 */
async function entregarAoN8n(
    ids: string[],
    items: unknown[],
): Promise<SendEmailResult> {
    const webhookUrl = process.env.N8N_EMAIL_WEBHOOK_URL;
    if (!webhookUrl) {
        console.error("[entregarAoN8n] N8N_EMAIL_WEBHOOK_URL não configurada.");
        return { ok: false, error: "Webhook de e-mail não configurado (N8N_EMAIL_WEBHOOK_URL)." };
    }

    try {
        const response = await fetchWithTimeout(
            webhookUrl,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ items }),
            },
            N8N_TIMEOUT_MS,
        );

        if (!response.ok) {
            const detail = `n8n respondeu ${response.status}`;
            await markFailed(ids, detail);
            return { ok: false, error: `Falha no envio: ${detail}.` };
        }

        return { ok: true, count: items.length, processing: false, scheduled: false };
    } catch (err) {
        const name = (err as { name?: string } | null)?.name;

        // Timeout não é motivo pra marcar failed: o n8n pode ter recebido o
        // lote e a resposta é que se perdeu. Deixar as linhas em `pending` —
        // se ele recebeu, atualiza cada uma pra sent/failed; se não recebeu,
        // ficam pendentes e visíveis no histórico, sem alarme falso.
        if (name === "TimeoutError" || name === "AbortError") {
            console.warn(`[entregarAoN8n] n8n não respondeu em ${N8N_TIMEOUT_MS}ms — lote segue processando.`);
            return { ok: true, count: items.length, processing: true, scheduled: false };
        }

        const detail = err instanceof Error ? err.message : String(err);
        console.error("[entregarAoN8n] n8n:", detail);
        await markFailed(ids, `Falha ao chamar o n8n: ${detail}`);
        return { ok: false, error: `Não foi possível falar com o n8n: ${detail}` };
    }
}

/**
 * Registra em `email_sends` e entrega o lote ao n8n.
 *
 * UMA linha (e um e-mail) por lead, mesmo quando vão vários endereços daquele
 * lead — são pessoas da mesma escola recebendo a mesma mensagem, então recebem
 * na mesma thread.
 */
async function dispatchEmails(params: {
    recipients: { leadId: string; emails: string[] }[];
    subject: string;
    body: string;
    origem: "individual" | "massa";
    attachments?: EmailAttachment[];
    /** ISO. Com valor, grava agendado e NÃO chama o n8n agora. */
    scheduledFor?: string | null;
}): Promise<SendEmailResult> {
    const subject = params.subject.trim();
    if (!subject) return { ok: false, error: "Escreva o assunto do e-mail." };

    const corpo = prepararCorpo(params.body);
    if (!corpo.ok) return corpo;
    const html = corpo.html;

    const recipients = params.recipients.filter((r) => r.emails.length > 0);
    if (recipients.length === 0) {
        return { ok: false, error: "Nenhum destinatário com e-mail válido." };
    }

    const attachments = params.attachments || [];
    const excesso = conferirAnexos(attachments);
    if (excesso) return { ok: false, error: excesso };

    // Agendado: grava e sai. Quem despacha na hora é o worker do n8n, que
    // varre email_sends de 5 em 5 minutos.
    const scheduledFor = params.scheduledFor?.trim() || null;
    if (scheduledFor && new Date(scheduledFor).getTime() <= Date.now()) {
        return { ok: false, error: "O horário do agendamento já passou." };
    }

    // scheduled_for/attachments só entram no insert quando são usados: assim um
    // envio comum continua funcionando mesmo antes da migração das colunas.
    const extras: Record<string, unknown> = {};
    if (scheduledFor) extras.scheduled_for = scheduledFor;
    if (attachments.length > 0) extras.attachments = attachments;

    const supabase = createServerSupabaseClient();
    const { data: rows, error: insertError } = await supabase
        .from("email_sends")
        .insert(
            recipients.map((r) => ({
                lead_id: r.leadId,
                origem: params.origem,
                recipient_email: r.emails.join(", "),
                subject,
                body: html,
                status: scheduledFor ? "scheduled" : "pending",
                ...extras,
            })),
        )
        .select("id, recipient_email");

    if (insertError || !rows || rows.length === 0) {
        console.error("[dispatchEmails] insert:", insertError?.message);
        return { ok: false, error: "Erro ao registrar o envio no banco. Nada foi enviado." };
    }

    if (scheduledFor) {
        return { ok: true, count: rows.length, processing: false, scheduled: true };
    }

    // Monta o payload a partir das linhas gravadas (e não do input), pra que
    // sendId e destinatário venham sempre do mesmo registro.
    const items = rows.map((row) => ({
        sendId: row.id,
        to: row.recipient_email,
        subject,
        body: html,
        attachments,
    }));

    return entregarAoN8n(rows.map((r) => r.id), items);
}

/**
 * PARTE A — e-mail para UM lead, em um ou mais dos endereços dele.
 *
 * O cliente manda quais TIPOS de e-mail usar; os endereços saem do banco.
 * Assim a action nunca vira um relay pra endereço arbitrário.
 */
export async function sendEmailToLead(params: {
    telefone: string;
    canal: string;
    fields: EmailFieldKey[];
    subject: string;
    body: string;
    attachments?: EmailAttachment[];
    scheduledFor?: string | null;
}): Promise<SendEmailResult> {
    await requireAuth();

    if (params.fields.length === 0) {
        return { ok: false, error: "Escolha ao menos um destinatário." };
    }

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
        .from("Clientes _WhatsApp")
        .select(LEAD_EMAIL_SELECT)
        .eq("telefone", params.telefone)
        .eq("canal", params.canal)
        .maybeSingle();

    if (error || !data) return { ok: false, error: "Lead não encontrado." };

    const emails = pickEmails(extractEmails(data as LeadRow), params.fields);
    if (emails.length === 0) {
        return { ok: false, error: "Este lead não tem e-mail válido nos campos escolhidos." };
    }

    return dispatchEmails({
        recipients: [{ leadId: (data as LeadRow).id, emails }],
        subject: params.subject,
        body: params.body,
        origem: "individual",
        attachments: params.attachments,
        scheduledFor: params.scheduledFor,
    });
}

/**
 * PARTE B — e-mail para os leads escolhidos no disparo por tag.
 *
 * A tag é filtro, não público: quem manda a lista final de leadIds é a tela.
 * Aqui só resolvemos os endereços de cada um pelos tipos marcados.
 */
export async function sendEmailToLeads(params: {
    leadIds: string[];
    fields: EmailFieldKey[];
    subject: string;
    body: string;
    attachments?: EmailAttachment[];
    scheduledFor?: string | null;
}): Promise<SendEmailResult> {
    await requireAuth();

    if (params.leadIds.length === 0) {
        return { ok: false, error: "Nenhum lead selecionado." };
    }
    if (params.fields.length === 0) {
        return { ok: false, error: "Escolha ao menos um tipo de e-mail." };
    }

    const supabase = createServerSupabaseClient();
    const uniqueIds = [...new Set(params.leadIds)];
    const recipients: { leadId: string; emails: string[] }[] = [];

    for (const ids of chunk(uniqueIds, IN_CHUNK_SIZE)) {
        const { data, error } = await supabase
            .from("Clientes _WhatsApp")
            .select(LEAD_EMAIL_SELECT)
            .in("id", ids);

        if (error) {
            console.error("[sendEmailToLeads]", error.message);
            return { ok: false, error: "Erro ao carregar os leads. Nada foi enviado." };
        }

        for (const row of (data || []) as LeadRow[]) {
            const emails = pickEmails(extractEmails(row), params.fields);
            if (emails.length > 0) recipients.push({ leadId: row.id, emails });
        }
    }

    if (recipients.length === 0) {
        return { ok: false, error: "Nenhum dos leads selecionados tem e-mail nos tipos escolhidos." };
    }

    return dispatchEmails({
        recipients,
        subject: params.subject,
        body: params.body,
        origem: "massa",
        attachments: params.attachments,
        scheduledFor: params.scheduledFor,
    });
}

/**
 * PARTE C — responde uma resposta da escola, dentro da mesma conversa.
 *
 * O CRM não escolhe o destinatário nem o assunto: manda só o id da resposta e
 * o texto. Quem monta o e-mail é a operação `reply` do nó Gmail, que preenche
 * `In-Reply-To`/`References` apontando pro Message-ID da mensagem respondida
 * — é isso que faz a escola ver tudo como uma conversa só, e não como
 * mensagens soltas.
 *
 * Por consequência, o assunto enviado é o da mensagem respondida: a operação
 * `reply` não aceita assunto próprio. Também não há agendamento aqui — o
 * worker de agendados só sabe reenviar o payload de um envio novo, e uma
 * resposta agendada sairia fora da thread.
 */
export async function replyToEmailReply(params: {
    replyId: string;
    body: string;
    attachments?: EmailAttachment[];
}): Promise<SendEmailResult> {
    await requireAuth();

    const corpo = prepararCorpo(params.body);
    if (!corpo.ok) return corpo;

    const attachments = params.attachments || [];
    const excesso = conferirAnexos(attachments);
    if (excesso) return { ok: false, error: excesso };

    const supabase = createServerSupabaseClient();
    const { data: resposta, error: readError } = await supabase
        .from("email_replies")
        .select("id, lead_id, from_email, subject, gmail_message_id, gmail_thread_id")
        .eq("id", params.replyId)
        .maybeSingle();

    if (readError || !resposta) {
        console.error("[replyToEmailReply] leitura:", readError?.message);
        return { ok: false, error: "Resposta não encontrada." };
    }
    if (!resposta.gmail_message_id) {
        return { ok: false, error: "Esta resposta não tem identificador do Gmail — não dá pra responder na mesma conversa." };
    }

    const { data: rows, error: insertError } = await supabase
        .from("email_sends")
        .insert({
            lead_id: resposta.lead_id,
            origem: "resposta",
            recipient_email: resposta.from_email,
            // O assunto real é decidido pelo Gmail (o da mensagem respondida).
            // Gravamos o mesmo aqui pra o histórico não mentir.
            subject: resposta.subject || "(sem assunto)",
            body: corpo.html,
            status: "pending",
            gmail_thread_id: resposta.gmail_thread_id,
            ...(attachments.length > 0 ? { attachments } : {}),
        })
        .select("id");

    if (insertError || !rows || rows.length === 0) {
        console.error("[replyToEmailReply] insert:", insertError?.message);
        return { ok: false, error: "Erro ao registrar a resposta no banco. Nada foi enviado." };
    }

    return entregarAoN8n(
        [rows[0].id],
        [
            {
                sendId: rows[0].id,
                to: resposta.from_email,
                subject: resposta.subject || "",
                body: corpo.html,
                attachments,
                // Presença deste campo é o que faz o n8n usar `reply` em vez
                // de `send`.
                replyTo: resposta.gmail_message_id,
            },
        ],
    );
}

// =============================================================
// ANEXOS
// =============================================================

/**
 * URL assinada pro browser subir o anexo direto no R2, sem passar os bytes
 * pela server action (que tem teto de 4.5MB na Vercel).
 */
export async function createEmailAttachmentUploadUrl(
    fileName: string,
    mimeType: string = "application/octet-stream",
): Promise<
    { ok: true; signedUrl: string; publicUrl: string } | { ok: false; error: string }
> {
    await requireAuth();
    const safeName = fileName.replace(/[^0-9A-Za-z._-]/g, "_").slice(-120);
    const path = `email-anexos/${Date.now()}-${safeName}`;
    try {
        const signedUrl = await presignedPutUrl(path, mimeType);
        return { ok: true, signedUrl, publicUrl: r2PublicUrl(path) };
    } catch (err) {
        console.error("[createEmailAttachmentUploadUrl]", err);
        return { ok: false, error: "Falha ao preparar o upload do anexo." };
    }
}

// =============================================================
// GOOGLE DRIVE
// =============================================================

/**
 * Access token de curta duração pro Google Picker rodar no navegador.
 *
 * O Picker exige um token OAuth no client, mas NÃO exige que o usuário faça
 * login: trocamos o refresh token da conta da Alegrando por um access token
 * aqui no servidor e entregamos só ele. A equipe vê o Drive da empresa sem
 * autenticar nada — e o refresh token nunca sai daqui.
 *
 * O token dá leitura ao Drive da Alegrando por ~1h. Só é emitido pra quem já
 * está autenticado no CRM.
 */
export async function getDrivePickerToken(): Promise<
    | { ok: true; accessToken: string; expiresAt: number; appId: string }
    | { ok: false; error: string }
> {
    await requireAuth();

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) {
        return { ok: false, error: "Integração com o Drive não configurada." };
    }

    try {
        const res = await fetchWithTimeout(
            "https://oauth2.googleapis.com/token",
            {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    client_id: clientId,
                    client_secret: clientSecret,
                    refresh_token: refreshToken,
                    grant_type: "refresh_token",
                }),
            },
            15_000,
        );

        const data = (await res.json()) as {
            access_token?: string;
            expires_in?: number;
            error?: string;
            error_description?: string;
        };

        if (!res.ok || !data.access_token) {
            // Nunca ecoar a resposta crua: ela pode conter detalhe de credencial.
            console.error(
                `[getDrivePickerToken] ${res.status} ${data.error || ""} ${data.error_description || ""}`,
            );
            return { ok: false, error: "Não foi possível liberar o acesso ao Drive." };
        }

        return {
            ok: true,
            accessToken: data.access_token,
            // Margem de 60s pro client renovar antes de o Google recusar.
            expiresAt: Date.now() + ((data.expires_in ?? 3600) - 60) * 1000,
            // O prefixo numérico do client_id é o número do projeto, que é o
            // que o Picker chama de appId. Evita mais uma env var.
            appId: clientId.split("-")[0],
        };
    } catch (err) {
        console.error("[getDrivePickerToken]", err);
        return { ok: false, error: "Não foi possível liberar o acesso ao Drive." };
    }
}

function getDriveClient() {
    const auth = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
    );
    auth.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN });
    return google.drive({ version: "v3", auth });
}

/**
 * Traz um arquivo do Drive pro R2, devolvendo-o como anexo comum.
 *
 * Assim o workflow do n8n só precisa saber baixar de URL — não carrega
 * credencial de Drive no caminho do envio, e o arquivo não precisa ser
 * tornado público em momento nenhum.
 */
export async function attachDriveFile(
    fileId: string,
): Promise<{ ok: true; attachment: EmailAttachment } | { ok: false; error: string }> {
    await requireAuth();
    if (!process.env.GOOGLE_DRIVE_REFRESH_TOKEN) {
        return { ok: false, error: "Integração com o Drive não configurada." };
    }

    try {
        const drive = getDriveClient();
        const meta = await drive.files.get({
            fileId,
            fields: "id, name, mimeType, size",
            supportsAllDrives: true,
        });

        const isGoogleDoc = (meta.data.mimeType || "").startsWith(
            "application/vnd.google-apps",
        );
        if (isGoogleDoc) {
            return {
                ok: false,
                error: "Documento nativo do Google não pode ser anexado direto. Exporte como PDF no Drive e anexe o PDF.",
            };
        }

        const declaredSize = meta.data.size ? Number(meta.data.size) : 0;
        if (declaredSize > MAX_TOTAL_BYTES) {
            return {
                ok: false,
                error: `"${meta.data.name}" tem ${(declaredSize / 1024 / 1024).toFixed(1)}MB — acima do limite de 25MB do Gmail.`,
            };
        }

        const download = await drive.files.get(
            { fileId, alt: "media", supportsAllDrives: true },
            { responseType: "arraybuffer" },
        );
        const buffer = Buffer.from(download.data as ArrayBuffer);

        const name = meta.data.name || "arquivo";
        const mimeType = meta.data.mimeType || "application/octet-stream";
        const safeName = name.replace(/[^0-9A-Za-z._-]/g, "_").slice(-120);
        const path = `email-anexos/drive-${Date.now()}-${safeName}`;

        const signedUrl = await presignedPutUrl(path, mimeType);
        const put = await fetchWithTimeout(
            signedUrl,
            {
                method: "PUT",
                headers: { "Content-Type": mimeType },
                body: new Uint8Array(buffer),
            },
            60_000,
        );
        if (!put.ok) throw new Error(`upload R2 respondeu ${put.status}`);

        return {
            ok: true,
            attachment: {
                url: r2PublicUrl(path),
                filename: name,
                size: buffer.byteLength,
                mimeType,
                source: "drive",
                driveFileId: fileId,
            },
        };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[attachDriveFile]", message);
        return { ok: false, error: `Erro ao anexar do Drive: ${message.slice(0, 160)}` };
    }
}
