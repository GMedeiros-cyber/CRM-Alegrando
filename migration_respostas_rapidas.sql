-- ===========================================================
-- respostas_rapidas — atalhos de texto da equipe ("/" na caixa do chat)
-- ===========================================================
-- Respostas INDEPENDENTES (cada uma é um atalho), compartilhadas entre as
-- usuárias, 10–15 no total. Sem categoria, sem paginação: o filtro por "/"
-- basta. A inserção é NA CAIXA, para revisar antes de mandar — nunca envia.
--
-- Placeholders substituídos na inserção (client-side): {nome} = primeira
-- palavra do nome do lead; {atendente} = firstName do Clerk de quem manda.
-- Placeholder sem valor fica LITERAL na caixa: falha visível é o ponto.
--
-- `ordem` existe para a lista; sem UI de reordenar no v1 (decisão 22/09/2026).
-- `ativo = false` esconde do menu sem perder o texto.
-- ===========================================================

CREATE TABLE IF NOT EXISTS public.respostas_rapidas (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Com a barra, como a equipe digita: "/apresentacao". Minúsculas, sem espaço.
    atalho      text        NOT NULL UNIQUE
                            CHECK (atalho ~ '^/[a-z0-9_-]{1,30}$'),
    titulo      text        NOT NULL CHECK (char_length(titulo) BETWEEN 1 AND 60),
    conteudo    text        NOT NULL CHECK (char_length(conteudo) BETWEEN 1 AND 4000),
    ordem       integer     NOT NULL DEFAULT 0,
    ativo       boolean     NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.respostas_rapidas IS
    'Atalhos de texto do chat ("/"). Compartilhados. Inseridos na caixa, nunca enviados direto.';

-- updated_at automático: mesma função genérica das outras tabelas.
DROP TRIGGER IF EXISTS respostas_rapidas_updated_at ON public.respostas_rapidas;
CREATE TRIGGER respostas_rapidas_updated_at
    BEFORE UPDATE ON public.respostas_rapidas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -----------------------------------------------------------
-- Segurança (SKILL §2.2): leitura para usuário autenticado, escrita SÓ pelo
-- service_role (server actions). anon não enxerga nada.
-- -----------------------------------------------------------
ALTER TABLE public.respostas_rapidas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.respostas_rapidas FROM anon;
GRANT SELECT ON public.respostas_rapidas TO authenticated;
GRANT ALL ON public.respostas_rapidas TO service_role;

DROP POLICY IF EXISTS "respostas_rapidas: leitura autenticada" ON public.respostas_rapidas;
CREATE POLICY "respostas_rapidas: leitura autenticada"
    ON public.respostas_rapidas FOR SELECT
    USING (auth.role() = 'authenticated');

-- -----------------------------------------------------------
-- Semente: tiradas do WhatsApp da equipe (22/09/2026). Idempotente por atalho.
-- /horario NÃO tem "Estamos abertos agora": é dinâmica e mente fora do horário.
-- -----------------------------------------------------------
INSERT INTO public.respostas_rapidas (atalho, titulo, conteudo, ordem) VALUES
('/apresentacao', 'Apresentação',
 'Olá, meu nome é {atendente}, sou do time de excursões e eventos, será um prazer dar continuidade ao seu atendimento.', 10),
('/logistica', 'Logística',
 'O parque possui uma logística especial para receber os grupos, nossos monitores e bombeiros do shopping recepcionam as crianças na área VIP do estacionamento.', 20),
('/coletes', 'Coletes',
 'As crianças recebem coletes de identificação e os monitores acompanham as crianças até a entrada do parque.', 30),
('/seguranca', 'Segurança',
 'Durante todo o período da excursão, os monitores ficam posicionados nas entradas do parque garantindo a segurança das crianças.', 40),
('/onibus', 'Ônibus e vans',
 'O desembarque e embarque é feito exclusivamente pela rua Engenheiro Camilo Olivetti, ACESSO C — Estacionamento Gratuito.', 50),
('/horario', 'Horário de atendimento',
 E'Horário de atendimento:\nSegunda a sexta: 09:00 às 18:00\nSábado: fechado\nDomingo: fechado', 60),
('/posvenda', 'Pós-venda',
 'Passando para agradecer pela confiança em realizar a excursão conosco. Foi um prazer atender sua escola. Espero que todos tenham aproveitado a experiência!', 70),
('/pagamento', 'Forma de pagamento',
 E'Forma de pagamento\nALEGRANDO EVENTOS\nPIX CNPJ: 18.462.884/0001-61', 80)
ON CONFLICT (atalho) DO NOTHING;

-- -----------------------------------------------------------
-- Conferência (rodar depois de aplicar):
--   SELECT count(*) FROM public.respostas_rapidas;                  → 8
--   SELECT relrowsecurity FROM pg_class WHERE relname = 'respostas_rapidas'; → true
--   SELECT policyname FROM pg_policies WHERE tablename = 'respostas_rapidas'; → 1 linha (SELECT)
-- -----------------------------------------------------------
