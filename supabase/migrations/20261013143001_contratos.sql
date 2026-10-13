-- ===========================================================
-- contratos — um registro por passeio contratado
-- ===========================================================
-- Tabela PRÓPRIA, e não colunas no lead, por um motivo medido: a tag
-- LEAD RECORRENTE tem 18 escolas que voltam, e cada passeio é um contrato.
-- Campo no lead guardaria só o último e apagaria o histórico a cada venda.
--
-- `lead_id` é uuid apontando para "Clientes _WhatsApp"(id) -- mesma chave que
-- lead_labels usa. ON DELETE CASCADE: contrato de lead apagado não tem dono
-- nem sentido.
--
-- `valor_total` é DIGITADO, não gerado a partir de valor_por_aluno × qtd:
-- desconto, professor que não paga e arredondamento de fechamento fazem o
-- produto não bater. A UI sugere o cálculo; o valor que vale é o acordado.
--
-- V1 gera o TEXTO do contrato preenchido, para revisar e copiar. PDF e
-- assinatura são rodada própria.
-- ===========================================================

CREATE TABLE IF NOT EXISTS public.contratos (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id          uuid        NOT NULL
                                 REFERENCES "Clientes _WhatsApp"(id) ON DELETE CASCADE,

    data_passeio     date,
    destino          text,
    qtd_alunos       integer     CHECK (qtd_alunos IS NULL OR qtd_alunos >= 0),
    qtd_professores  integer     CHECK (qtd_professores IS NULL OR qtd_professores >= 0),

    valor_por_aluno  numeric(10,2) CHECK (valor_por_aluno IS NULL OR valor_por_aluno >= 0),
    valor_total      numeric(10,2) CHECK (valor_total IS NULL OR valor_total >= 0),
    forma_pagamento  text,
    observacoes      text,

    -- rascunho: em edição no CRM. enviado: foi para a escola. assinado: fechado.
    status           text        NOT NULL DEFAULT 'rascunho'
                                 CHECK (status IN ('rascunho', 'enviado', 'assinado')),

    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.contratos IS
    'Um contrato por passeio. Lead recorrente tem vários -- por isso tabela e não colunas no lead.';
COMMENT ON COLUMN public.contratos.valor_total IS
    'Valor acordado, digitado. Não é valor_por_aluno × qtd_alunos: desconto e professor isento fazem o produto não fechar.';

-- O acesso previsto é "os contratos deste lead, do mais recente para o mais
-- antigo" -- é o que a tela do lead mostra.
CREATE INDEX IF NOT EXISTS contratos_lead_data_idx
    ON public.contratos (lead_id, data_passeio DESC NULLS LAST);

-- updated_at automático: mesma função genérica das outras tabelas.
DROP TRIGGER IF EXISTS contratos_updated_at ON public.contratos;
CREATE TRIGGER contratos_updated_at
    BEFORE UPDATE ON public.contratos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -----------------------------------------------------------
-- Segurança (SKILL §2.2): contrato tem valor e nome de escola. Leitura para
-- usuário autenticado, escrita só pelo service_role (server actions).
-- anon não enxerga nada.
-- -----------------------------------------------------------
ALTER TABLE public.contratos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contratos FROM anon;
GRANT SELECT ON public.contratos TO authenticated;
GRANT ALL ON public.contratos TO service_role;

DROP POLICY IF EXISTS "contratos: leitura autenticada" ON public.contratos;
CREATE POLICY "contratos: leitura autenticada"
    ON public.contratos FOR SELECT
    USING (auth.role() = 'authenticated');

-- -----------------------------------------------------------
-- Modelo do contrato, editável em Configurações.
--
-- ⚠️ O texto abaixo é RASCUNHO, montado a partir dos campos desta tabela só
-- para a tela ter o que mostrar. NÃO é o contrato da Alegrando e não tem
-- validade: o aviso está DENTRO do texto, em maiúsculas, na primeira linha,
-- para que ninguém mande isto a uma escola por engano. Substituir pelo
-- modelo real assim que a equipe entregar.
--
-- Placeholders: `{...}` de chave simples, a convenção dos textos novos.
-- O applyPlaceholders aceita `{x}` e `{{x}}`.
-- -----------------------------------------------------------
INSERT INTO crm_settings (chave, valor) VALUES (
    'contrato_modelo',
    E'*** RASCUNHO -- MODELO PROVISÓRIO, SEM VALIDADE. SUBSTITUIR PELO CONTRATO OFICIAL DA ALEGRANDO ANTES DE ENVIAR A QUALQUER ESCOLA. ***\n\nCONTRATO DE PRESTAÇÃO DE SERVIÇOS -- EXCURSÃO ESCOLAR\n\nCONTRATANTE: {nome}\nCNPJ/CPF: {documento}\nEndereço: {endereco}\nResponsável: {responsavel}\n\nCONTRATADA: Alegrando Eventos\n\n1. OBJETO\nExcursão escolar para {destino}, na data de {data_passeio}.\n\n2. PARTICIPANTES\nAlunos: {qtd_alunos}\nProfessores/acompanhantes: {qtd_professores}\n\n3. VALORES\nValor por aluno: R$ {valor_por_aluno}\nValor total: R$ {valor_total}\nForma de pagamento: {forma_pagamento}\n\n4. OBSERVAÇÕES\n{observacoes}\n\n*** FIM DO RASCUNHO -- ESTE TEXTO NÃO SUBSTITUI O CONTRATO OFICIAL. ***'
)
ON CONFLICT (chave) DO NOTHING;

-- -----------------------------------------------------------
-- Conferência (rodar depois de aplicar):
--
--   SELECT relrowsecurity FROM pg_class WHERE relname = 'contratos';   → true
--   SELECT policyname FROM pg_policies WHERE tablename = 'contratos';  → 1 (SELECT)
--   SELECT count(*) FROM public.contratos;                             → 0
--   SELECT chave FROM crm_settings ORDER BY chave;                     → inclui contrato_modelo
--
--   -- a FK aponta para a chave certa:
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public.contratos'::regclass AND contype = 'f';
--     → REFERENCES "Clientes _WhatsApp"(id) ON DELETE CASCADE
-- -----------------------------------------------------------
