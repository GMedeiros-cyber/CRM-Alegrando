-- ===========================================================
-- FIX: list_clientes_by_last_msg após coluna telefone virar VARCHAR
-- ===========================================================
-- Erro: "return type mismatch in function declared to return record"
--       "Final statement returns character varying instead of numeric at column 1"
--
-- Causa: a RETURNS TABLE da RPC declarava telefone NUMERIC, mas
--        após o ALTER TABLE a coluna virou VARCHAR(255).
--
-- Solução: recriar a função com telefone TEXT na RETURNS TABLE.
--          DROP é necessário porque mudar o tipo de retorno de uma
--          função existente quebraria o contrato.
--
-- IMPORTANTE: rodar UMA VEZ no Supabase Studio → SQL Editor.
-- ===========================================================

BEGIN;

DROP FUNCTION IF EXISTS public.list_clientes_by_last_msg(text, text, integer, integer);

CREATE OR REPLACE FUNCTION public.list_clientes_by_last_msg(
    p_canal  text DEFAULT NULL,
    p_search text DEFAULT NULL,
    p_offset integer DEFAULT 0,
    p_limit  integer DEFAULT 50
)
RETURNS TABLE (
    telefone           text,
    nome               text,
    email              text,
    status             text,
    status_atendimento text,
    ia_ativa           boolean,
    last_seen_at       timestamptz,
    created_at         timestamptz,
    foto_url           text,
    canal              text,
    last_message_at    timestamptz,
    unread_count       bigint,
    total_count        bigint
)
LANGUAGE sql
STABLE
AS $$
    WITH base AS (
        SELECT
            c.telefone::text                                 AS telefone,
            c.nome::text                                     AS nome,
            c.email::text                                    AS email,
            c.status::text                                   AS status,
            c.status_atendimento::text                       AS status_atendimento,
            COALESCE(c.ia_ativa, true)                       AS ia_ativa,
            c.last_seen_at                                   AS last_seen_at,
            c.created_at                                     AS created_at,
            c.foto_url::text                                 AS foto_url,
            COALESCE(c.canal, 'alegrando')::text             AS canal,
            (
                SELECT MAX(m.created_at)
                FROM messages m
                WHERE m.telefone::text = c.telefone::text
            )                                                AS last_message_at,
            (
                SELECT COUNT(*)
                FROM messages m
                WHERE m.telefone::text = c.telefone::text
                  AND m.sender_type = 'cliente'
                  AND (
                      c.last_seen_at IS NULL
                      OR m.created_at > c.last_seen_at
                  )
            )::bigint                                        AS unread_count
        FROM "Clientes _WhatsApp" c
        WHERE
            (p_canal  IS NULL OR c.canal = p_canal)
        AND (
            p_search IS NULL
            OR c.nome     ILIKE '%' || p_search || '%'
            OR c.telefone::text ILIKE '%' || p_search || '%'
        )
    ),
    counted AS (
        SELECT *, COUNT(*) OVER ()::bigint AS total_count
        FROM base
    )
    SELECT
        telefone, nome, email, status, status_atendimento,
        ia_ativa, last_seen_at, created_at, foto_url, canal,
        last_message_at, unread_count, total_count
    FROM counted
    ORDER BY COALESCE(last_message_at, created_at) DESC NULLS LAST
    OFFSET p_offset
    LIMIT  p_limit;
$$;

COMMIT;

-- Teste:
SELECT telefone, nome, last_message_at, unread_count, total_count
FROM list_clientes_by_last_msg(NULL, NULL, 0, 5);
