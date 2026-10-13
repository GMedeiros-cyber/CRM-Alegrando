-- ===========================================================
-- Aniversário da coordenadora e da diretora
-- ===========================================================
-- Quatro colunas em "Clientes _WhatsApp": a data de nascimento de cada uma e
-- a data do último parabéns enviado. O cron compara o ANO de `*_enviado_em`
-- com o ano corrente -- se forem iguais, já mandou este ano e não repete.
--
-- ⚠️ NÃO CONFUNDIR com a coluna `aniversariante`, que já existe nesta tabela:
-- ela é TEXT, guarda o NOME da criança da festa (104 leads preenchidos, com
-- valores como 'Maria Fernanda', 'Lara', 'Rafael e Gustavo') e pertence ao
-- canal festas. Nada a ver com as colunas abaixo, que são datas de
-- nascimento de adultos no canal alegrando. Os nomes são parecidos por
-- acidente, não por parentesco.
--
-- Por que `date` e não `timestamptz`: é dia e mês de nascimento, não instante.
-- O ano existe no dado mas não é usado para decidir envio.
--
-- O envio é feito pelo cron em /api/cron/followup, numa janela própria de
-- 12 UTC (9h de Brasília), com comparação de hora explícita -- ele NÃO usa o
-- `followup_hora` do lead. Ver a pendência "follow-up não dispara" no SKILL.
-- ===========================================================

ALTER TABLE "Clientes _WhatsApp"
    ADD COLUMN IF NOT EXISTS coordenadora_aniversario            date,
    ADD COLUMN IF NOT EXISTS diretora_aniversario                date,
    -- Controle de envio: data do último parabéns. Só o ano é comparado.
    ADD COLUMN IF NOT EXISTS coordenadora_aniversario_enviado_em date,
    ADD COLUMN IF NOT EXISTS diretora_aniversario_enviado_em     date;

COMMENT ON COLUMN "Clientes _WhatsApp".coordenadora_aniversario IS
    'Data de nascimento da coordenadora. NÃO confundir com a coluna `aniversariante` (nome da criança da festa, canal festas).';
COMMENT ON COLUMN "Clientes _WhatsApp".coordenadora_aniversario_enviado_em IS
    'Data do último parabéns enviado à coordenadora. O cron compara o ANO para não mandar duas vezes no mesmo ano.';
COMMENT ON COLUMN "Clientes _WhatsApp".diretora_aniversario IS
    'Data de nascimento da diretora.';
COMMENT ON COLUMN "Clientes _WhatsApp".diretora_aniversario_enviado_em IS
    'Data do último parabéns enviado à diretora. O cron compara o ANO para não mandar duas vezes no mesmo ano.';

-- -----------------------------------------------------------
-- Mensagem configurável (Configurações → mesma tabela das outras).
-- `{nome}` recebe coordenadora_nome ou diretora_nome na hora do envio.
-- Chave simples de propósito: é a convenção dos textos novos, e o
-- applyPlaceholders passou a aceitar `{nome}` e `{{nome}}`.
-- ON CONFLICT DO NOTHING: reaplicar não sobrescreve texto que a equipe editou.
-- -----------------------------------------------------------
INSERT INTO crm_settings (chave, valor) VALUES (
    'aniversario_mensagem',
    E'Olá {nome}! 🎉\n\nA equipe da Alegrando passou para desejar um feliz aniversário! Que o seu dia seja tão especial quanto as experiências que você proporciona para as crianças.\n\nUm abraço de todos nós! 🥳'
)
ON CONFLICT (chave) DO NOTHING;

-- -----------------------------------------------------------
-- Conferência (rodar depois de aplicar):
--
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'Clientes _WhatsApp'
--      AND column_name LIKE '%aniversario%'
--    ORDER BY column_name;
--     → 4 linhas, todas `date`
--
--   SELECT count(*) FROM "Clientes _WhatsApp" WHERE aniversariante IS NOT NULL;
--     → 104, o MESMO de antes (a coluna antiga fica intacta)
--
--   SELECT chave FROM crm_settings ORDER BY chave;
--     → inclui aniversario_mensagem
-- -----------------------------------------------------------
