-- ===========================================================
-- Migration: telefone numeric → text
-- ===========================================================
-- Por quê:
-- IDs de grupos do WhatsApp (ex: "120363403370100000-group") excedem
-- Number.MAX_SAFE_INTEGER (~9e15) e perdem precisão em JS quando a
-- coluna é numeric. Além disso, o sufixo "-group" não pode ser
-- representado em coluna numeric.
--
-- Esta migration converte telefone para TEXT em todas as tabelas que
-- usam o campo. Cast direto numeric → text é seguro e preserva valores.
--
-- IMPORTANTE: rodar UMA VEZ no Supabase Studio → SQL Editor.
-- ===========================================================

BEGIN;

-- 1. Clientes _WhatsApp
ALTER TABLE "Clientes _WhatsApp"
    ALTER COLUMN telefone TYPE TEXT USING telefone::text;

-- 2. messages (FK lógica para telefone)
ALTER TABLE messages
    ALTER COLUMN telefone TYPE TEXT USING telefone::text;

-- 3. passeios_historico (FK lógica para telefone)
ALTER TABLE passeios_historico
    ALTER COLUMN telefone TYPE TEXT USING telefone::text;

-- 4. Atualizar telefone do grupo "Operação Alegrando":
--    O ID original do grupo é 120363403370100000 (sem prefixo 55).
--    O webhook antigo prefixou erroneamente com 55. Corrigir agora.
UPDATE "Clientes _WhatsApp"
SET telefone = '120363403370100000-group'
WHERE telefone = '55120363403370100000';

UPDATE messages
SET telefone = '120363403370100000-group'
WHERE telefone = '55120363403370100000';

-- 5. (Opcional) Corrigir RPC list_clientes_by_last_msg para retornar
--    telefone como text. Como já alteramos a coluna, o cast::text na
--    RPC vira no-op, mas garante consistência se a RPC ainda usar o
--    tipo antigo internamente.
--    → Se a RPC quebrar após a alteração, descomentar e ajustar.

COMMIT;

-- Verificação:
SELECT
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name IN ('Clientes _WhatsApp', 'messages', 'passeios_historico')
  AND column_name = 'telefone';
