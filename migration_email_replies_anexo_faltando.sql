-- ===========================================================
-- email_replies: registrar anexo que o Gmail tinha e nao chegou
-- ===========================================================
-- Aditiva e idempotente. Nao mexe em policy, indice ou dado existente.
--
-- Por que existe: quando um anexo falha, o sintoma e SILENCIOSO — o texto da
-- resposta entra normalmente e o arquivo simplesmente nao aparece. Nada na
-- tela indica que faltou algo, entao quem le a conversa nao tem como saber.
-- Essa cegueira ja custou tres rodadas de investigacao num unico dia.
--
-- Guarda a diferenca entre o que o Gmail disse ter e o que foi gravado.
-- NULL ou 0 = nada faltou.
--
-- Nao conta imagem inline pequena descartada como assinatura: essa e
-- descartada de proposito, antes da contagem, senao toda resposta com logo
-- de rodape viraria alarme falso.
-- ===========================================================

BEGIN;

ALTER TABLE public.email_replies
    ADD COLUMN IF NOT EXISTS attachments_missing integer;

COMMENT ON COLUMN public.email_replies.attachments_missing IS
    'Quantos anexos o Gmail informou e nao chegaram a ser gravados (download, upload no R2 ou validacao falhou). NULL/0 = nada faltou. Imagem inline pequena descartada como assinatura nao entra nessa conta.';

COMMIT;

-- Conferencia:
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='email_replies'
-- ORDER BY ordinal_position;
