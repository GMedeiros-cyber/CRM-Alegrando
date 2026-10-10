-- ============================================
-- SQL Consolidado — CRM Alegrando
-- Executar no Supabase Dashboard (SQL Editor)
-- ============================================

-- ============================================
-- 1. CONCORRÊNCIA — updated_at automático
-- ============================================

-- Função genérica para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Clientes _WhatsApp
ALTER TABLE "Clientes _WhatsApp"
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TRIGGER trigger_clientes_updated_at
    BEFORE UPDATE ON "Clientes _WhatsApp"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- messages
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- lead_tasks
ALTER TABLE lead_tasks
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TRIGGER trigger_lead_tasks_updated_at
    BEFORE UPDATE ON lead_tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- passeios_historico
ALTER TABLE passeios_historico
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- kanban_columns
ALTER TABLE kanban_columns
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TRIGGER trigger_kanban_columns_updated_at
    BEFORE UPDATE ON kanban_columns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- task_lists (já pode ter updated_at — IF NOT EXISTS garante segurança)
ALTER TABLE task_lists
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE OR REPLACE TRIGGER trigger_task_lists_updated_at
    BEFORE UPDATE ON task_lists
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- task_cards (já pode ter updated_at)
ALTER TABLE task_cards
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE OR REPLACE TRIGGER trigger_task_cards_updated_at
    BEFORE UPDATE ON task_cards
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 2. AUDITORIA — created_by / updated_by
-- ============================================

-- Clientes _WhatsApp
ALTER TABLE "Clientes _WhatsApp"
ADD COLUMN IF NOT EXISTS created_by text,
ADD COLUMN IF NOT EXISTS updated_by text;

-- messages
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS created_by text;

-- lead_tasks
ALTER TABLE lead_tasks
ADD COLUMN IF NOT EXISTS created_by text;

-- passeios_historico
ALTER TABLE passeios_historico
ADD COLUMN IF NOT EXISTS created_by text;

-- kanban_columns
ALTER TABLE kanban_columns
ADD COLUMN IF NOT EXISTS created_by text;

-- task_lists
ALTER TABLE task_lists
ADD COLUMN IF NOT EXISTS created_by text;

-- task_cards
ALTER TABLE task_cards
ADD COLUMN IF NOT EXISTS created_by text,
ADD COLUMN IF NOT EXISTS updated_by text;

-- ============================================
-- 3. ÍNDICES — Performance
-- ============================================

-- Índice principal para lookups por telefone
CREATE INDEX IF NOT EXISTS idx_clientes_telefone
    ON "Clientes _WhatsApp"(telefone);

-- Índice para buscar mensagens por telefone + ordenação
CREATE INDEX IF NOT EXISTS idx_messages_telefone_created
    ON messages(telefone, created_at DESC);

-- Índice para buscar tasks por telefone
CREATE INDEX IF NOT EXISTS idx_lead_tasks_telefone
    ON lead_tasks(telefone);

-- Índice para buscar passeios por telefone
CREATE INDEX IF NOT EXISTS idx_passeios_historico_telefone
    ON passeios_historico(telefone);

-- Índice para kanban_column_id (joins frequentes)
CREATE INDEX IF NOT EXISTS idx_clientes_kanban_column
    ON "Clientes _WhatsApp"(kanban_column_id);

-- Índice para follow-up cron job
CREATE INDEX IF NOT EXISTS idx_clientes_followup
    ON "Clientes _WhatsApp"(followup_ativo, followup_enviado)
    WHERE followup_ativo = true AND followup_enviado = false;

-- Índice para task_cards por list_id
CREATE INDEX IF NOT EXISTS idx_task_cards_list
    ON task_cards(list_id, position);

-- ============================================
-- FIM — Verificar resultados no SQL Editor
-- ============================================

-- ============================================
-- 4. CONFIGURAÇÕES — Menu Configurações
-- ============================================

CREATE TABLE IF NOT EXISTS crm_settings (
    chave text PRIMARY KEY,
    valor text NOT NULL,
    updated_at timestamptz DEFAULT now()
);

-- Permite uso com RLS (Se aplicável no futuro)
ALTER TABLE crm_settings ENABLE ROW LEVEL SECURITY;

-- Como o sistema não usa RLS por usuário, criamos uma policy permissiva para operations via dashboard/backend 
-- (Supondo acesso restrito por service_role via backend e sem RLS ativo de forma estrita, mas caso esteja ativo:)
CREATE POLICY "Permitir leitura/escrita para todos os usuários autenticados" ON crm_settings FOR ALL USING (auth.role() = 'authenticated');

-- ============================================
-- 5. FUNCIONALIDADE — PÓS-PASSEIO
-- ============================================

ALTER TABLE "Clientes _WhatsApp"
ADD COLUMN IF NOT EXISTS pos_passeio_ativo boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS pos_passeio_enviado boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS pos_passeio_enviado_em timestamptz;
