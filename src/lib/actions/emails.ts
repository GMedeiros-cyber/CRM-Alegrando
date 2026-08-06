"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { fetchWithTimeout } from "@/lib/fetch-utils";
import { extractEmails, pickEmails, plainTextToHtml } from "@/lib/email/format";
import type {
    EmailFieldKey,
    EmailSendRecord,
    EmailSendStatus,
    LeadEmailRow,
    SendEmailResult,
} from "@/lib/types/email";

/**
 * O workflow do n8n só responde no FIM do lote (Respond to Webhook depois do
 * loop, com 2s de espera por e-mail). Lote grande, portanto, estoura este
 * timeout — e isso não é falha: ver o catch de dispatchEmails.
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

/** Histórico de e-mails de um lead (painel de detalhes). */
export async function listLeadEmailSends(
    telefone: string,
    canal: string = "alegrando",
): Promise<EmailSendRecord[]> {
    await requireAuth();
    const leadId = await resolveLeadUuid(telefone, canal);
    if (!leadId) return [];

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
        .from("email_sends")
        .select("id, recipient_email, subject, status, error, origem, created_at, sent_at")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false })
        .limit(20);

    if (error) {
        console.error("[listLeadEmailSends]", error.message);
        return [];
    }

    return (data || []).map((r) => ({
        id: r.id,
        recipientEmail: r.recipient_email,
        subject: r.subject,
        status: (r.status || "pending") as EmailSendStatus,
        error: r.error,
        origem: r.origem,
        createdAt: r.created_at,
        sentAt: r.sent_at,
    }));
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
}): Promise<SendEmailResult> {
    const webhookUrl = process.env.N8N_EMAIL_WEBHOOK_URL;
    if (!webhookUrl) {
        console.error("[dispatchEmails] N8N_EMAIL_WEBHOOK_URL não configurada.");
        return { ok: false, error: "Webhook de e-mail não configurado (N8N_EMAIL_WEBHOOK_URL)." };
    }

    const subject = params.subject.trim();
    if (!subject) return { ok: false, error: "Escreva o assunto do e-mail." };

    const rawBody = params.body.trim();
    if (!rawBody) return { ok: false, error: "Escreva o corpo do e-mail." };

    const recipients = params.recipients.filter((r) => r.emails.length > 0);
    if (recipients.length === 0) {
        return { ok: false, error: "Nenhum destinatário com e-mail válido." };
    }

    const html = plainTextToHtml(rawBody);
    if (!html) return { ok: false, error: "Escreva o corpo do e-mail." };

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
                status: "pending",
            })),
        )
        .select("id, recipient_email");

    if (insertError || !rows || rows.length === 0) {
        console.error("[dispatchEmails] insert:", insertError?.message);
        return { ok: false, error: "Erro ao registrar o envio no banco. Nada foi enviado." };
    }

    // Monta o payload a partir das linhas gravadas (e não do input), pra que
    // sendId e destinatário venham sempre do mesmo registro.
    const items = rows.map((row) => ({
        sendId: row.id,
        to: row.recipient_email,
        subject,
        body: html,
    }));

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
            await markFailed(rows.map((r) => r.id), detail);
            return { ok: false, error: `Falha no envio: ${detail}.` };
        }

        return { ok: true, count: items.length, processing: false };
    } catch (err) {
        const name = (err as { name?: string } | null)?.name;

        // Timeout NÃO é falha: o n8n recebeu o lote e só responde depois de
        // enviar tudo (2s de espaçamento por e-mail). Deixar as linhas em
        // `pending` — o próprio n8n as atualiza pra sent/failed no fim.
        if (name === "TimeoutError" || name === "AbortError") {
            console.warn(`[dispatchEmails] n8n não respondeu em ${N8N_TIMEOUT_MS}ms — lote segue processando.`);
            return { ok: true, count: items.length, processing: true };
        }

        const detail = err instanceof Error ? err.message : String(err);
        console.error("[dispatchEmails] n8n:", detail);
        await markFailed(rows.map((r) => r.id), `Falha ao chamar o n8n: ${detail}`);
        return { ok: false, error: `Não foi possível falar com o n8n: ${detail}` };
    }
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
    });
}
