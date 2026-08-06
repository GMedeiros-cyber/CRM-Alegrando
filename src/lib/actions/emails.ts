"use server";

import { google } from "googleapis";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { fetchWithTimeout } from "@/lib/fetch-utils";
import { extractEmails, pickEmails, plainTextToHtml } from "@/lib/email/format";
import { cleanEditorHtml, isEditorEmpty, wrapEmailHtml } from "@/lib/email/editor";
import { presignedPutUrl, r2PublicUrl } from "@/lib/whatsapp/r2-client";
import { MAX_ATTACHMENTS_BYTES } from "@/lib/types/email";
import type {
    DriveFile,
    EmailAttachment,
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
    const BASE_COLUMNS =
        "id, recipient_email, subject, status, error, origem, created_at, sent_at";

    async function query(columns: string) {
        return supabase
            .from("email_sends")
            .select(columns)
            .eq("lead_id", leadId)
            .order("created_at", { ascending: false })
            .limit(20);
    }

    let { data, error } = await query(`${BASE_COLUMNS}, scheduled_for, attachments`);

    // 42703 = coluna inexistente: a migração de anexo/agendamento ainda não
    // rodou. O histórico segue funcionando sem esses dois campos.
    if (error?.code === "42703") {
        ({ data, error } = await query(BASE_COLUMNS));
    }

    if (error) {
        console.error("[listLeadEmailSends]", error.message);
        return [];
    }

    return ((data || []) as unknown as Record<string, unknown>[]).map((r) => ({
        id: String(r.id),
        recipientEmail: String(r.recipient_email ?? ""),
        subject: String(r.subject ?? ""),
        status: (r.status || "pending") as EmailSendStatus,
        error: (r.error as string) ?? null,
        origem: (r.origem as string) ?? null,
        createdAt: String(r.created_at ?? ""),
        sentAt: (r.sent_at as string) ?? null,
        scheduledFor: (r.scheduled_for as string) ?? null,
        attachments: Array.isArray(r.attachments) ? (r.attachments as EmailAttachment[]) : [],
    }));
}

/** Cancela um envio que ainda não saiu (só faz sentido pra agendado). */
export async function cancelScheduledEmail(
    sendId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
    await requireAuth();
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
        .from("email_sends")
        .delete()
        .eq("id", sendId)
        .eq("status", "scheduled")
        .select("id");

    if (error) return { ok: false, error: error.message };
    if (!data || data.length === 0) {
        return { ok: false, error: "Esse envio já saiu — não dá mais pra cancelar." };
    }
    return { ok: true };
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
    attachments?: EmailAttachment[];
    /** ISO. Com valor, grava agendado e NÃO chama o n8n agora. */
    scheduledFor?: string | null;
}): Promise<SendEmailResult> {
    const webhookUrl = process.env.N8N_EMAIL_WEBHOOK_URL;
    if (!webhookUrl) {
        console.error("[dispatchEmails] N8N_EMAIL_WEBHOOK_URL não configurada.");
        return { ok: false, error: "Webhook de e-mail não configurado (N8N_EMAIL_WEBHOOK_URL)." };
    }

    const subject = params.subject.trim();
    if (!subject) return { ok: false, error: "Escreva o assunto do e-mail." };

    // O corpo já chega em HTML do editor. Texto puro (sem tag nenhuma) ainda
    // passa pela conversão, pra manter quebras de linha de quem colar texto.
    const rawBody = params.body.trim();
    if (!rawBody || isEditorEmpty(rawBody)) {
        return { ok: false, error: "Escreva o corpo do e-mail." };
    }
    const html = /<[a-z][\s\S]*>/i.test(rawBody)
        ? wrapEmailHtml(cleanEditorHtml(rawBody))
        : wrapEmailHtml(plainTextToHtml(rawBody));

    const recipients = params.recipients.filter((r) => r.emails.length > 0);
    if (recipients.length === 0) {
        return { ok: false, error: "Nenhum destinatário com e-mail válido." };
    }

    const attachments = params.attachments || [];
    const totalBytes = attachments.reduce((sum, a) => sum + (a.size || 0), 0);
    if (totalBytes > MAX_ATTACHMENTS_BYTES) {
        return {
            ok: false,
            error: `Anexos somam ${(totalBytes / 1024 / 1024).toFixed(1)}MB — o Gmail aceita até 25MB por mensagem.`,
        };
    }

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

        return { ok: true, count: items.length, processing: false, scheduled: false };
    } catch (err) {
        const name = (err as { name?: string } | null)?.name;

        // Timeout NÃO é falha: o n8n recebeu o lote e só responde depois de
        // enviar tudo (2s de espaçamento por e-mail). Deixar as linhas em
        // `pending` — o próprio n8n as atualiza pra sent/failed no fim.
        if (name === "TimeoutError" || name === "AbortError") {
            console.warn(`[dispatchEmails] n8n não respondeu em ${N8N_TIMEOUT_MS}ms — lote segue processando.`);
            return { ok: true, count: items.length, processing: true, scheduled: false };
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

/** true quando o token de leitura do Drive está configurado. */
export async function isDriveEnabled(): Promise<boolean> {
    await requireAuth();
    return Boolean(process.env.GOOGLE_DRIVE_REFRESH_TOKEN);
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
 * Lista o Drive da Alegrando — pasta a pasta ou por busca.
 *
 * É sempre a conta da empresa (a credencial é de servidor), não o Drive
 * pessoal de quem está usando o CRM. Leitura apenas.
 */
export async function listDriveFiles(params: {
    folderId?: string | null;
    search?: string;
}): Promise<{ ok: true; files: DriveFile[] } | { ok: false; error: string }> {
    await requireAuth();
    if (!process.env.GOOGLE_DRIVE_REFRESH_TOKEN) {
        return { ok: false, error: "Integração com o Drive não configurada." };
    }

    const search = params.search?.trim();
    const clauses = ["trashed = false"];
    if (search) {
        clauses.push(`name contains '${search.replace(/'/g, "\\'")}'`);
    } else {
        clauses.push(`'${params.folderId || "root"}' in parents`);
    }

    try {
        const drive = getDriveClient();
        const res = await drive.files.list({
            q: clauses.join(" and "),
            pageSize: 100,
            fields: "files(id, name, mimeType, size, iconLink, modifiedTime)",
            orderBy: "folder,name",
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
        });

        const files: DriveFile[] = (res.data.files || []).map((f) => ({
            id: f.id!,
            name: f.name || "(sem nome)",
            mimeType: f.mimeType || "",
            size: f.size ? Number(f.size) : null,
            iconLink: f.iconLink || null,
            modifiedTime: f.modifiedTime || null,
            isFolder: f.mimeType === "application/vnd.google-apps.folder",
        }));
        return { ok: true, files };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[listDriveFiles]", message);
        return { ok: false, error: `Erro ao ler o Drive: ${message.slice(0, 160)}` };
    }
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
        if (declaredSize > MAX_ATTACHMENTS_BYTES) {
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
