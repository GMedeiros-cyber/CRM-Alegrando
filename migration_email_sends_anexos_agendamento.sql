-- Colunas novas em email_sends para anexos e envio agendado.
-- Só adiciona coluna: não altera RLS, não toca em dado existente, e as linhas
-- que já existem ficam com NULL (= envio imediato, sem anexo).

alter table public.email_sends
    add column if not exists scheduled_for timestamptz,
    add column if not exists attachments   jsonb;

comment on column public.email_sends.scheduled_for is
    'Quando o envio deve sair. NULL = imediato. Com valor, a linha fica status=scheduled até o worker do n8n despachar.';

comment on column public.email_sends.attachments is
    'Anexos do e-mail: [{"url":"...","filename":"...","size":123,"source":"upload|drive","driveFileId":"..."}]';

-- Busca do worker: "linhas agendadas já vencidas". Índice parcial mantém o
-- índice minúsculo, já que a esmagadora maioria das linhas tem scheduled_for nulo.
create index if not exists email_sends_scheduled_idx
    on public.email_sends (scheduled_for)
    where status = 'scheduled';
