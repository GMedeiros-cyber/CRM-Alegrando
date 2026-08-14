-- ===========================================================
-- Conversas: barra de listas (Todas · Não lidas · Favoritos · E-mails)
-- ===========================================================
-- Inclui o ADD COLUMN de `favorito` de propósito, para o arquivo ser
-- autossuficiente: se `migration_clientes_favorito.sql` já rodou, o
-- IF NOT EXISTS não faz nada; se não rodou, a função não quebra por falta da
-- coluna. Ordem garantida num paste só.
--
-- O que muda na RPC, e o que NÃO muda:
--
--   PRESERVADO tal como está em produção — msg_agg, lead_labels_agg, o CASE do
--   unread_count (mensagem de `cliente` mais nova que last_seen_at; nulo = tudo
--   não lido), o filtro de labels com `&&`, a ordenação por
--   COALESCE(last_message_at, created_at) e o `SET search_path`.
--
--   ACRESCENTADO — `p_aba` para filtrar do lado do servidor, e três contagens
--   devolvidas junto da lista.
--
-- SEMÂNTICA DAS CONTAGENS (decisão de produto, não detalhe técnico):
-- elas são calculadas sobre a base JÁ filtrada por canal + busca + tags, mas
-- ANTES do filtro de aba. Então trocar de aba não muda os números — é o que
-- permite ver "57 não lidas" estando em "Todas". E elas NÃO refletem os filtros
-- de Grupos e IA ativa/manual, que hoje rodam no cliente sobre as páginas já
-- carregadas (ver §8.9 da skill).
--
-- DROP antes de CREATE porque o RETURNS TABLE muda: CREATE OR REPLACE não
-- altera tipo de retorno. Dentro da transação isso é atômico para as outras
-- sessões. As duas assinaturas antigas caem (a de 5 args, que é a de produção,
-- e a de 4, que é a versão velha do repositório).
-- ===========================================================

BEGIN;

-- A coluna e o índice já foram aplicados (índice `idx_clientes_whatsapp_favorito`
-- em `(canal, favorito) WHERE favorito`). O ADD COLUMN fica como rede de
-- segurança e não faz nada se já existe; o índice NÃO é recriado aqui de
-- propósito — com outro nome, o IF NOT EXISTS não impediria um segundo índice
-- equivalente.
ALTER TABLE public."Clientes _WhatsApp"
    ADD COLUMN IF NOT EXISTS favorito boolean NOT NULL DEFAULT false;

DROP FUNCTION IF EXISTS public.list_clientes_by_last_msg(text, text, integer, integer, uuid[]);
DROP FUNCTION IF EXISTS public.list_clientes_by_last_msg(text, text, integer, integer);

CREATE OR REPLACE FUNCTION public.list_clientes_by_last_msg(
    p_canal     text     DEFAULT NULL::text,
    p_search    text     DEFAULT NULL::text,
    p_offset    integer  DEFAULT 0,
    p_limit     integer  DEFAULT 50,
    p_label_ids uuid[]   DEFAULT NULL::uuid[],
    p_aba       text     DEFAULT NULL::text
)
RETURNS TABLE(
    telefone           text,
    nome               text,
    email              text,
    status             text,
    status_atendimento text,
    ia_ativa           boolean,
    last_seen_at       timestamp with time zone,
    created_at         timestamp with time zone,
    foto_url           text,
    canal              text,
    last_message_at    timestamp with time zone,
    unread_count       bigint,
    total_count        bigint,
    labels             jsonb,
    favorito           boolean,
    tem_email          boolean,
    count_nao_lidas    bigint,
    count_favoritos    bigint,
    count_emails       bigint
)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
    WITH msg_agg AS (
        SELECT
            m.telefone::text                                  AS telefone,
            m.canal                                           AS canal,
            MAX(m.created_at)                                 AS last_message_at,
            COUNT(*) FILTER (WHERE m.sender_type = 'cliente') AS total_cliente_msgs
        FROM messages m
        WHERE (p_canal IS NULL OR m.canal = p_canal)
        GROUP BY m.telefone, m.canal
    ),

    lead_labels_agg AS (
        SELECT
            ll.lead_id,
            jsonb_agg(
                jsonb_build_object(
                    'id',    l.id,
                    'name',  l.name,
                    'color', l.color
                ) ORDER BY l.name
            ) AS labels,
            array_agg(ll.label_id) AS label_ids
        FROM lead_labels ll
        JOIN labels l ON l.id = ll.label_id
        GROUP BY ll.lead_id
    ),

    -- Leads que já trocaram e-mail, dos dois lados. UNION (não ALL) porque só
    -- interessa a existência: o mesmo lead aparece nas duas tabelas.
    leads_com_email AS (
        SELECT es.lead_id FROM email_sends   es WHERE es.lead_id IS NOT NULL
        UNION
        SELECT er.lead_id FROM email_replies er WHERE er.lead_id IS NOT NULL
    ),

    base AS (
        SELECT
            c.telefone::text                              AS telefone,
            c.nome::text                                  AS nome,
            c.email::text                                 AS email,
            c.status::text                                AS status,
            c.status_atendimento::text                    AS status_atendimento,
            COALESCE(c.ia_ativa, true)                    AS ia_ativa,
            c.last_seen_at                                AS last_seen_at,
            c.created_at                                  AS created_at,
            c.foto_url::text                              AS foto_url,
            COALESCE(c.canal, 'alegrando')::text          AS canal,
            ma.last_message_at                            AS last_message_at,
            CASE
                WHEN c.last_seen_at IS NULL
                    THEN COALESCE(ma.total_cliente_msgs, 0)
                ELSE (
                    SELECT COUNT(*)
                    FROM messages m2
                    WHERE m2.telefone::text = c.telefone::text
                      AND m2.canal = COALESCE(c.canal, 'alegrando')
                      AND m2.sender_type = 'cliente'
                      AND m2.created_at > c.last_seen_at
                )
            END::bigint                                   AS unread_count,
            COALESCE(lla.labels, '[]'::jsonb)             AS labels,
            COALESCE(lla.label_ids, ARRAY[]::uuid[])      AS label_ids_arr,
            COALESCE(c.favorito, false)                   AS favorito,
            (lce.lead_id IS NOT NULL)                     AS tem_email
        FROM "Clientes _WhatsApp" c
        LEFT JOIN msg_agg ma
               ON ma.telefone = c.telefone::text
              AND ma.canal    = COALESCE(c.canal, 'alegrando')
        LEFT JOIN lead_labels_agg lla
               ON lla.lead_id = c.id
        LEFT JOIN leads_com_email lce
               ON lce.lead_id = c.id
        WHERE (p_canal  IS NULL OR c.canal = p_canal)
          AND (
              p_search IS NULL
              OR c.nome::text     ILIKE '%' || p_search || '%'
              OR c.telefone::text ILIKE '%' || p_search || '%'
          )
          AND (
              p_label_ids IS NULL
              OR array_length(p_label_ids, 1) IS NULL
              OR lla.label_ids && p_label_ids
          )
    ),

    -- As contagens saem daqui, ANTES do filtro de aba: é o que faz a barra
    -- mostrar os quatro números sem uma consulta por aba.
    counted AS (
        SELECT
            *,
            COUNT(*)                                      OVER ()::bigint AS total_count,
            COUNT(*) FILTER (WHERE base.unread_count > 0) OVER ()::bigint AS count_nao_lidas,
            COUNT(*) FILTER (WHERE base.favorito)         OVER ()::bigint AS count_favoritos,
            COUNT(*) FILTER (WHERE base.tem_email)        OVER ()::bigint AS count_emails
        FROM base
    )

    SELECT
        telefone, nome, email, status, status_atendimento,
        ia_ativa, last_seen_at, created_at, foto_url, canal,
        last_message_at, unread_count, total_count, labels,
        favorito, tem_email,
        count_nao_lidas, count_favoritos, count_emails
    FROM counted
    WHERE
        p_aba IS NULL
        OR p_aba = 'todas'
        OR (p_aba = 'nao_lidas' AND counted.unread_count > 0)
        OR (p_aba = 'favoritos' AND counted.favorito)
        OR (p_aba = 'emails'    AND counted.tem_email)
    ORDER BY COALESCE(last_message_at, created_at) DESC NULLS LAST
    OFFSET p_offset
    LIMIT  p_limit;
$function$;

-- DROP leva os grants embora; devolver explicitamente em vez de contar com o
-- EXECUTE que o Postgres concede a PUBLIC por padrão.
GRANT EXECUTE ON FUNCTION public.list_clientes_by_last_msg(text, text, integer, integer, uuid[], text)
    TO authenticated, service_role;

COMMIT;

-- ===========================================================
-- Conferência (esperado hoje: total 313, não lidas 57, favoritos 0, e-mails 1)
-- ===========================================================
-- SELECT DISTINCT total_count, count_nao_lidas, count_favoritos, count_emails
-- FROM list_clientes_by_last_msg('alegrando', NULL, 0, 1, NULL, 'todas');
--
-- Aba de não lidas devolve só quem tem não lida:
-- SELECT count(*), min(unread_count)
-- FROM list_clientes_by_last_msg('alegrando', NULL, 0, 1000, NULL, 'nao_lidas');
--
-- E a chamada antiga, com 5 argumentos nomeados, tem de continuar funcionando:
-- SELECT count(*) FROM list_clientes_by_last_msg(
--     p_canal => 'alegrando', p_search => NULL,
--     p_offset => 0, p_limit => 50, p_label_ids => NULL);
