-- ===========================================================
-- Conversas: barra de listas (Todas · Não lidas · Favoritos · E-mails)
-- ===========================================================
-- SOBRECARGA, não substituição. A função de 5 argumentos que está em produção
-- fica INTACTA; esta acrescenta uma segunda assinatura com `p_aba`.
--
-- Por que sobrecarga: DROP + CREATE abre uma janela em que a lista de conversas
-- quebra se o deploy do front não subir junto — e o DROP ainda levaria os grants
-- embora. Com as duas assinaturas vivas, a ordem entre migration e deploy deixa
-- de importar: código velho continua chamando a de 5, código novo chama a de 6.
--
-- ATENÇÃO AO DEFAULT — é o detalhe que faz isto funcionar ou não:
-- em Postgres, "todo parâmetro depois de um com DEFAULT também precisa de
-- DEFAULT". Então NÃO dá para escrever `p_label_ids uuid[] DEFAULT NULL,
-- p_aba text` — o CREATE falha na hora.
--
-- E dar DEFAULT a `p_aba` seria pior, porque falha só na CHAMADA: uma chamada
-- de 5 argumentos passaria a casar com as DUAS assinaturas e o Postgres
-- devolveria `function ... is not unique`, derrubando a lista inteira.
--
-- Solução: esta assinatura de 6 não tem DEFAULT em NENHUM parâmetro. Aí a
-- resolução é exata e sem ambiguidade — 5 argumentos só casam com a antiga,
-- 6 só casam com esta.
--
-- O CORPO é cópia fiel do `pg_get_functiondef` do banco VIVO (msg_agg,
-- lead_labels_agg, o CASE de unread_count, o filtro `&&` de labels, a ordenação
-- por COALESCE(last_message_at, created_at) e o SET search_path), mais o filtro
-- de aba e as três contagens. A versão do repositório NÃO foi usada como base:
-- ela está velha e não tem `p_label_ids` — copiá-la mataria o filtro de Tags.
--
-- SEMÂNTICA DAS CONTAGENS (decisão de produto, não detalhe técnico):
-- são calculadas sobre a base já filtrada por canal + busca + tags, mas ANTES
-- do filtro de aba. Por isso trocar de aba não muda os números — é o que
-- permite ver "57 não lidas" estando em "Todas". Elas NÃO refletem os filtros
-- de Grupos e IA ativa/manual, que rodam no cliente sobre as páginas já
-- carregadas (ver §8.9 da skill).
-- ===========================================================

BEGIN;

-- Rede de segurança: a coluna e o índice `idx_clientes_whatsapp_favorito`
-- (em `(canal, favorito) WHERE favorito`) já foram aplicados. O ADD COLUMN não
-- faz nada se já existe; o índice NÃO é recriado aqui de propósito — com outro
-- nome, o IF NOT EXISTS não impediria um segundo índice equivalente.
ALTER TABLE public."Clientes _WhatsApp"
    ADD COLUMN IF NOT EXISTS favorito boolean NOT NULL DEFAULT false;

-- Sem DROP: a assinatura de 5 argumentos continua existindo e atendendo.
CREATE OR REPLACE FUNCTION public.list_clientes_by_last_msg(
    p_canal     text,
    p_search    text,
    p_offset    integer,
    p_limit     integer,
    p_label_ids uuid[],
    p_aba       text
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

GRANT EXECUTE ON FUNCTION public.list_clientes_by_last_msg(text, text, integer, integer, uuid[], text)
    TO authenticated, service_role;

COMMIT;

-- O PostgREST guarda o schema em cache: sem isto a função nova só aparece no
-- próximo reinício, e o front recebe PGRST202 achando que a migration falhou.
NOTIFY pgrst, 'reload schema';

-- ===========================================================
-- Conferência
-- ===========================================================
-- 1) As DUAS assinaturas têm de existir (esperado: 2 linhas, 5 e 6 argumentos):
-- SELECT p.oid::regprocedure AS assinatura, pronargs
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public' AND p.proname = 'list_clientes_by_last_msg'
-- ORDER BY pronargs;
--
-- 2) A chamada ANTIGA de 5 argumentos continua resolvendo (não pode dar
--    "function is not unique"):
-- SELECT count(*) FROM list_clientes_by_last_msg(
--     p_canal => 'alegrando', p_search => NULL,
--     p_offset => 0, p_limit => 50, p_label_ids => NULL);
--
-- 3) Contagens (esperado hoje: 313 / 57 / 0 / 1):
-- SELECT DISTINCT total_count, count_nao_lidas, count_favoritos, count_emails
-- FROM list_clientes_by_last_msg('alegrando', NULL, 0, 1, NULL, 'todas');
--
-- 4) A aba de não lidas devolve só quem tem não lida (min tem de ser >= 1):
-- SELECT count(*), min(unread_count)
-- FROM list_clientes_by_last_msg('alegrando', NULL, 0, 1000, NULL, 'nao_lidas');
