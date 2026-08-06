/**
 * Tipos e constantes do envio de e-mail.
 *
 * O envio em si é 100% do n8n (workflow "Envio de E-mail - Alegrando").
 * O CRM só resolve destinatários, registra em `email_sends` e chama o webhook.
 */

/** Colunas de e-mail de `Clientes _WhatsApp`. Um lead pode ter até 4. */
export type EmailFieldKey =
    | "email"
    | "instituicao_email"
    | "coordenadora_email"
    | "diretora_email";

export const EMAIL_FIELD_LABELS: Record<EmailFieldKey, string> = {
    email: "Principal",
    instituicao_email: "Instituição",
    coordenadora_email: "Coordenadora",
    diretora_email: "Diretora",
};

/** Ordem em que os checkboxes aparecem na tela (individual e por tag). */
export const EMAIL_FIELD_ORDER: EmailFieldKey[] = [
    "email",
    "instituicao_email",
    "coordenadora_email",
    "diretora_email",
];

/**
 * Ordem de prioridade pra pré-marcar UM endereço no envio individual.
 * Diferente de EMAIL_FIELD_ORDER de propósito: o e-mail da instituição é o
 * menos pessoal, então é o último a ser sugerido.
 */
export const EMAIL_FIELD_PRIORITY: EmailFieldKey[] = [
    "email",
    "coordenadora_email",
    "diretora_email",
    "instituicao_email",
];

export type EmailSendStatus = "pending" | "scheduled" | "sent" | "failed";

/**
 * Anexo de um e-mail.
 *
 * Independente da origem, o arquivo sempre acaba com uma URL no R2 — inclusive
 * o que vem do Drive, que o CRM baixa e reenvia. Assim o n8n só precisa saber
 * baixar de URL, sem credencial de Drive no caminho do envio.
 */
export type EmailAttachment = {
    url: string;
    filename: string;
    size: number;
    mimeType: string;
    source: "upload" | "drive";
    /** Só pra rastrear a origem no histórico. */
    driveFileId?: string;
};

/** Teto do Gmail por mensagem (25MB), com folga pro overhead do base64. */
export const MAX_ATTACHMENTS_BYTES = 23 * 1024 * 1024;

/** Arquivo do Drive, como aparece no seletor. */
export type DriveFile = {
    id: string;
    name: string;
    mimeType: string;
    size: number | null;
    iconLink: string | null;
    modifiedTime: string | null;
    isFolder: boolean;
};

/** Uma linha de `email_sends` (histórico no painel do lead). */
export type EmailSendRecord = {
    id: string;
    recipientEmail: string;
    subject: string;
    status: EmailSendStatus;
    error: string | null;
    origem: string | null;
    createdAt: string;
    sentAt: string | null;
    scheduledFor: string | null;
    attachments: EmailAttachment[];
};

/** Lead alcançável por e-mail, usado na lista do disparo por tag. */
export type LeadEmailRow = {
    leadId: string;
    nome: string | null;
    telefone: string;
    canal: string;
    /** Só os campos preenchidos e com formato válido. */
    emails: Partial<Record<EmailFieldKey, string>>;
    labelIds: string[];
};

export type SendEmailResult =
    | {
          ok: true;
          /** Quantos e-mails foram entregues ao n8n (1 por lead). */
          count: number;
          /**
           * true = o n8n aceitou o lote mas ainda está processando quando a
           * resposta estourou o timeout. As linhas seguem `pending` e o próprio
           * n8n atualiza pra `sent`/`failed` quando termina.
           */
          processing: boolean;
          /** true = ficou agendado; nada foi enviado ainda. */
          scheduled: boolean;
      }
    | { ok: false; error: string };
