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

export type TipoLinkCorpo =
    | "planilha"
    | "documento"
    | "apresentacao"
    | "formulario"
    | "pasta"
    | "pdf"
    | "arquivo"
    | "link";

/**
 * Um link que existia no HTML do corpo e não sobreviveu à conversão pra texto.
 *
 * Sai do servidor como DADO, nunca como marcação: o corpo vem de fora e o
 * título é escrito por terceiro. Quem renderiza monta nós React a partir disto.
 * Extraído por `extrairLinksDoCorpo` (`lib/email/format.ts`).
 */
export type LinkDoCorpo = {
    url: string;
    titulo: string;
    tipo: TipoLinkCorpo;
    /**
     * Arquivo na nuvem (chip do Drive) x âncora comum.
     *
     * Separa duas coisas com tratamento diferente: o chip vira cartão E some do
     * texto (senão o título aparece duas vezes); a âncora comum vira cartão mas
     * o texto dela continua na frase, onde faz sentido.
     */
    nuvem: boolean;
};

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

/**
 * Uma resposta da escola, capturada pelo worker do n8n.
 *
 * Só existe resposta para envio que tenha `gmail_thread_id`: é por ele que o
 * worker reconhece a conversa como nossa.
 */
export type EmailReplyRecord = {
    id: string;
    fromEmail: string;
    fromName: string | null;
    subject: string | null;
    snippet: string | null;
    /** Só o que a pessoa escreveu — a citação é cortada na ingestão. */
    bodyText: string | null;
    /** O corpo original inteiro, com o histórico citado. */
    bodyTextFull: string | null;
    bodyHtml: string | null;
    receivedAt: string;
    /** Nulo = não lida. É o que alimenta o badge do menu. */
    readAt: string | null;
    attachments: EmailAttachment[];
    /**
     * Quantos anexos o Gmail tinha e não chegaram a ser gravados.
     *
     * Existe porque essa falha é silenciosa: o texto entra, o arquivo some e
     * nada na tela avisa. Imagem inline pequena descartada como assinatura
     * não entra nessa conta.
     */
    attachmentsMissing: number;
    /**
     * Quantos anexos ainda estão sendo baixados e subidos, agora.
     *
     * O worker grava a resposta em duas etapas — texto primeiro, anexo depois —
     * para o texto não esperar um PDF de 3 MB. Este campo é o que existe entre
     * uma e outra. Não confundir com `attachmentsMissing`: aqui é **espera**,
     * lá é **desistiu**.
     */
    attachmentsPending: number;
    /**
     * Os pendentes acima já passaram da janela de espera?
     *
     * Calculado no servidor (ver `anexoPendenteVencido`). Quando verdadeiro, a
     * tela lê os pendentes como falha, e não como espera — senão a bolha giraria
     * para sempre num anexo que nunca vem, se o worker tiver parado.
     */
    attachmentsPendingExpired: boolean;
};

/**
 * Uma mensagem dentro de uma conversa — nossa ou da escola.
 *
 * Os dois lados moram no mesmo tipo porque na tela eles são lidos em
 * sequência: separar em duas listas era justamente o que fazia o envio e a
 * resposta parecerem dois e-mails soltos.
 */
export type EmailThreadMessage = {
    id: string;
    direcao: "enviado" | "recebido";
    /** Quem aparece no cabeçalho da mensagem. */
    autor: string;
    at: string;
    /** Enviados guardam o HTML que nós mesmos montamos. */
    bodyHtml: string | null;
    /** Recebidos são sempre texto — HTML de terceiro não é renderizado. */
    bodyText: string | null;
    bodyTextFull: string | null;
    attachments: EmailAttachment[];
    /**
     * Links que existiam no HTML do corpo e a conversão pra texto descartou.
     *
     * Arquivo inserido pelo chip do Drive NÃO é anexo: é um bloco HTML no
     * corpo. Sem isto ele chegava na tela como texto morto — só o título, sem
     * link. Extraído no servidor a partir do `body_html`, que já está gravado.
     */
    links: LinkDoCorpo[];
    /** Só em recebidos: anexos que o Gmail tinha e não foram gravados. */
    attachmentsMissing: number;
    /** Só em recebidos: anexos ainda a caminho (espera, não perda). */
    attachmentsPending: number;
    /** Só em recebidos: a espera acima já venceu, então é perda. */
    attachmentsPendingExpired: boolean;
    /** Só em enviados. */
    status: EmailSendStatus | null;
    error: string | null;
    /** Só em recebidos: nulo = não lida. */
    readAt: string | null;
    /** Só em recebidos: aviso de não entrega do mailer-daemon. */
    devolucao: boolean;
};

/**
 * Uma conversa de e-mail no painel do lead.
 *
 * Agrupa pela thread do Gmail, então o e-mail que saiu, a resposta da escola e
 * a nossa réplica são UM item — e não três linhas soltas na lista.
 */
export type EmailConversation = {
    /** Id do envio raiz da thread. */
    id: string;
    subject: string;
    recipientEmail: string;
    /** Última movimentação: é por ela que a lista é ordenada. */
    lastActivityAt: string;
    unreadCount: number;
    /** Status do envio mais recente nosso (fila, falha, programado). */
    status: EmailSendStatus;
    error: string | null;
    scheduledFor: string | null;
    messages: EmailThreadMessage[];
    /**
     * Resposta recebida mais recente — é a ela que o campo inline responde.
     * Nulo quando a escola ainda não respondeu: aí não há o que responder.
     */
    replyTargetId: string | null;
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
