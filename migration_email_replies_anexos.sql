-- ===========================================================
-- email_replies: anexos + corpo original completo
-- ===========================================================
-- Aditiva e idempotente. Não mexe em policy, índice ou dado existente.
--
-- attachments      hoje a resposta da escola tem o texto guardado e o ARQUIVO
--                  descartado. Para a Alegrando esse é justamente o caso que
--                  mais importa: autorização assinada, lista de alunos,
--                  comprovante. Mesmo formato de email_sends.attachments, pra
--                  o componente de bandeja servir aos dois sem adaptação.
--
-- body_text_full   body_text passa a guardar SÓ o que a pessoa escreveu, com
--                  o histórico citado cortado na ingestão. O original fica
--                  aqui: sem ele, um corte errado seria irrecuperável, porque
--                  reingerir depende da mensagem ainda existir no Gmail.
-- ===========================================================

BEGIN;

ALTER TABLE public.email_replies
    ADD COLUMN IF NOT EXISTS attachments   jsonb,
    ADD COLUMN IF NOT EXISTS body_text_full text;

COMMENT ON COLUMN public.email_replies.attachments IS
    'Anexos da resposta, no mesmo formato de email_sends.attachments: [{"url":"...","filename":"...","size":123,"mimeType":"..."}]. Só entra o que veio como Content-Disposition: attachment — imagem inline com Content-ID (logo de assinatura) é descartada na ingestão.';

COMMENT ON COLUMN public.email_replies.body_text_full IS
    'Corpo original completo, com o histórico citado. body_text guarda só o que a pessoa escreveu; este existe para o "ver mensagem completa" sem depender de reingerir do Gmail.';

COMMIT;

-- Conferência:
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='email_replies'
-- ORDER BY ordinal_position;
