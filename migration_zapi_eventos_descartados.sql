-- ===========================================================
-- zapi_eventos_descartados — captura do que o webhook da Z-API HOJE joga fora
-- ===========================================================
-- Contexto (SKILL §1, "PENDÊNCIA DE PRODUTO"): api/webhooks/zapi descarta em
-- silêncio, sem log, dois tipos de evento:
--   1. `type` fora de MESSAGE_EVENT_TYPES (ReceivedCallback/SentCallback/
--      ReactionCallback) → sai em {status:"skipped"} sem olhar o corpo;
--   2. fromMe=true, fromApi=true → "já salvo pela action", que é SUPOSIÇÃO.
-- Medido em 16/09/2026: duas mensagens chegaram no aparelho do cliente e nunca
-- existiram em `messages`. É a mesma família do incidente de 12–14/08.
--
-- Esta tabela existe para PARAR DE SER CEGO. Não é fila, não é fonte de verdade,
-- não alimenta tela nenhuma: é diagnóstico com prazo de validade.
--
-- Por que tabela PRÓPRIA e não `webhook_events`:
--   `webhook_events` é o livro-razão de idempotência do webhook do Clerk
--   (svix_id único, sem payload, vida longa). Aplicar retenção de 7 dias nele
--   apagaria os registros de dedup e uma reentrega do Clerk voltaria a ser
--   processada como nova. Dois ciclos de vida opostos não cabem na mesma
--   limpeza. Ela fica INTACTA.
--
-- O que NÃO entra aqui: o fluxo normal, que já vira linha em `messages`.
--
-- PII: o payload é gravado JÁ REDIGIDO pelo handler (lib/log-redact.ts):
-- telefone mascarado, URL de mídia reduzida a host, texto substituído pelo
-- tamanho. Para descobrir o formato de um evento (ex.: edição) precisa-se da
-- ESTRUTURA, não do conteúdo. A coluna não deve receber payload cru.
-- ===========================================================

CREATE TABLE IF NOT EXISTS public.zapi_eventos_descartados (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    recebido_em   timestamptz NOT NULL DEFAULT now(),

    -- Qual dos dois descartes do handler produziu esta linha.
    motivo        text        NOT NULL
                              CHECK (motivo IN ('tipo_nao_reconhecido', 'from_api')),

    -- Campos de topo extraídos para consulta sem abrir o jsonb.
    event_type    text,
    message_id    text,
    from_me       boolean,
    from_api      boolean,
    telefone_mask text,       -- já mascarado (telefoneMascarado), nunca o número

    -- Corpo REDIGIDO. Ver cabeçalho.
    payload       jsonb       NOT NULL,

    -- Retenção: 7 dias, decisão de produto (16/09/2026). A limpeza abaixo apaga
    -- pelo campo, então mudar a retenção é mudar só este DEFAULT.
    expira_em     timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);

COMMENT ON TABLE public.zapi_eventos_descartados IS
    'Diagnóstico: eventos da Z-API que api/webhooks/zapi descarta. Payload redigido. Retenção 7 dias via pg_cron. NÃO é fonte de verdade.';

-- Leitura recente e limpeza por validade são os dois únicos acessos previstos.
CREATE INDEX IF NOT EXISTS zapi_eventos_descartados_recebido_idx
    ON public.zapi_eventos_descartados (recebido_em DESC);
CREATE INDEX IF NOT EXISTS zapi_eventos_descartados_expira_idx
    ON public.zapi_eventos_descartados (expira_em);

-- -----------------------------------------------------------
-- Segurança (SKILL §2.2): ninguém lê isto pelo browser.
-- RLS ligada e NENHUMA policy → anon e authenticated não enxergam nada.
-- service_role ignora RLS, e é o único que escreve (o handler usa o cliente
-- de servidor). Revoke explícito por cima, para não depender só da ausência
-- de policy.
-- -----------------------------------------------------------
ALTER TABLE public.zapi_eventos_descartados ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.zapi_eventos_descartados FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.zapi_eventos_descartados TO service_role;

-- -----------------------------------------------------------
-- Limpeza automática: DIÁRIA, 04:30 UTC (01:30 em São Paulo), apaga o vencido.
-- Diária e não semanal de propósito: com TTL de 7 dias, um job de domingo deixa
-- linha viva até 13 dias e a "retenção de 7" vira 7-a-13. O :30 evita empilhar
-- com o cleanup_media_weekly, que roda domingo às 04:00. Fora de pico.
-- Se pg_cron não estiver ativo neste projeto, a migration NÃO falha: avisa.
-- Sem a limpeza a tabela cresce sem freio — então o NOTICE abaixo é para ser
-- lido, não ignorado.
-- -----------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        -- unschedule idempotente: reaplicar a migration não duplica o job.
        PERFORM cron.unschedule(jobid)
        FROM cron.job
        WHERE jobname = 'zapi_eventos_descartados_limpeza';

        PERFORM cron.schedule(
            'zapi_eventos_descartados_limpeza',
            '30 4 * * *',
            $job$ DELETE FROM public.zapi_eventos_descartados WHERE expira_em < now(); $job$
        );
        RAISE NOTICE 'pg_cron: job zapi_eventos_descartados_limpeza agendado (diário, 04:30 UTC).';
    ELSE
        RAISE NOTICE 'pg_cron NÃO está ativo: a limpeza de zapi_eventos_descartados NÃO foi agendada. Ative a extensão e reaplique este bloco, ou a tabela cresce sem limite.';
    END IF;
END
$$;

-- -----------------------------------------------------------
-- Conferência (rodar depois de aplicar):
--
--   SELECT relrowsecurity FROM pg_class WHERE relname = 'zapi_eventos_descartados';
--     → true
--   SELECT jobname, schedule FROM cron.job WHERE jobname LIKE 'zapi_%';
--     → 1 linha, '30 4 * * *'
--   SELECT count(*) FROM public.webhook_events;
--     → o MESMO número de antes (tabela do Clerk intacta)
-- -----------------------------------------------------------
