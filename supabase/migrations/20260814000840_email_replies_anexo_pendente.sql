-- ===========================================================
-- email_replies: marcar anexo que AINDA ESTA CHEGANDO
-- ===========================================================
-- Aditiva e idempotente. Nao mexe em policy, indice ou dado existente.
--
-- Por que existe: ate agora o worker gravava a linha so no fim, depois de
-- baixar, converter e subir todos os anexos. O texto da resposta ficava
-- invisivel por ~11 s por causa de um PDF que ninguem estava esperando ler
-- naquele segundo. A gravacao passa a ser em duas: o texto entra assim que a
-- mensagem e montada, e os anexos preenchem a MESMA linha depois.
--
-- Isso abre um risco que esta coluna fecha: se o ramo de anexo morrer entre a
-- primeira gravacao e a segunda, a linha ficaria com texto e sem arquivo PARA
-- SEMPRE — o gmail_message_id e UNIQUE e o dedup consideraria a mensagem ja
-- ingerida. Com a marca de pendente, o dedup NAO considera ingerida uma linha
-- que ainda tem anexo faltando, e o Schedule de 2 min retenta sozinho.
--
-- NAO confundir com attachments_missing:
--   attachments_pending = ESPERA  (ainda vai chegar, retentando)
--   attachments_missing = PERDEU  (desistiu, nao vem mais)
-- Um diz espera, o outro diz perdeu. Reaproveitar um pelo outro faz a bolha
-- mentir para quem le a conversa.
--
-- Teto de tentativas: nao ha contador, e de proposito. Contador so e
-- incrementado por quem esta vivo para escreve-lo, e o caso que o teto existe
-- para cobrir — a execucao morrer no meio — e justamente aquele em que
-- ninguem escreve: ficaria em zero para sempre e o laco nunca pararia.
-- A janela usa created_at, que a PRIMEIRA gravacao ja deixou pronto:
--
--   retentar enquanto  attachments_pending > 0
--                 AND  created_at > now() - interval '10 minutes'
--
-- Com o Schedule de 2 min isso da ~5 tentativas. Vencida a janela, o worker
-- converte o pendente em attachments_missing — uma escrita de verdade, nao
-- uma regra de leitura na tela: sem UPDATE nao ha evento de Realtime, e a
-- bolha aberta na tela de alguem ficaria "carregando" para sempre.
-- ===========================================================

BEGIN;

ALTER TABLE public.email_replies
    ADD COLUMN IF NOT EXISTS attachments_pending integer;

COMMENT ON COLUMN public.email_replies.attachments_pending IS
    'Quantos anexos o Gmail informou e ainda estao sendo baixados/subidos. NULL/0 = nada pendente. Difere de attachments_missing, que significa DESISTIU: um diz espera, o outro diz perdeu. O worker retenta enquanto pending > 0 e created_at estiver dentro de 10 min (~5 passagens do Schedule); vencida a janela, converte para attachments_missing.';

COMMIT;

-- Conferencia:
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='email_replies'
--   AND column_name IN ('attachments','attachments_missing','attachments_pending')
-- ORDER BY ordinal_position;
