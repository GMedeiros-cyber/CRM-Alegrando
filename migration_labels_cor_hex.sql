-- ===========================================================
-- labels.color: de 8 nomes para hex livre (seletor de cor nas tags)
-- ===========================================================
-- Decisão 22/09/2026: SUBSTITUIR o modelo, não somar. Manter nome + hex
-- dobraria o render para sempre. A coluna passa a guardar '#rrggbb' minúsculo.
--
-- Hex de conversão = o tom que JÁ APARECE na tela: o fundo do badge no tema
-- claro é `bg-<cor>-200`, e os valores abaixo são os *-200 do Tailwind v4
-- (oklch → sRGB, calculados, não o hex do v3). O texto passa a ser calculado
-- por luminância no cliente, então as 16 tags existentes continuam com a
-- mesma cara. No tema escuro o cliente recompõe a tinta de antes (matiz
-- saturado a 20% + texto no mesmo matiz) a partir do hex — ver `estiloTag`.
--
-- Conferir ANTES:  SELECT id, name, color FROM public.labels ORDER BY name;  (16 linhas, nomes)
-- Conferir DEPOIS: mesma query → 16 linhas, todas '#......'
-- ===========================================================

BEGIN;

-- 1. Solta o CHECK dos 8 nomes (nome exato, medido em 22/09/2026).
ALTER TABLE public.labels DROP CONSTRAINT labels_color_check;

-- 2. Converte as linhas existentes. Qualquer valor fora do mapa (não deveria
--    existir — o CHECK antigo garantia) cai no cinza, e o WHERE final acusa.
UPDATE public.labels SET color = CASE color
    WHEN 'slate'  THEN '#e2e8f0'
    WHEN 'red'    THEN '#ffc9c9'
    WHEN 'orange' THEN '#ffd6a7'
    WHEN 'amber'  THEN '#fee685'
    WHEN 'green'  THEN '#b9f8cf'
    WHEN 'blue'   THEN '#bedbff'
    WHEN 'violet' THEN '#ddd6ff'
    WHEN 'pink'   THEN '#fccee8'
    ELSE '#e2e8f0'
END
WHERE color !~ '^#[0-9a-f]{6}$';

-- 3. CHECK novo: hex de 6 dígitos, minúsculo (o action normaliza antes de gravar).
ALTER TABLE public.labels
    ADD CONSTRAINT labels_color_check CHECK (color ~ '^#[0-9a-f]{6}$');

COMMIT;

-- -----------------------------------------------------------
-- Conferência (rodar depois de aplicar):
--   SELECT count(*) FROM public.labels WHERE color !~ '^#[0-9a-f]{6}$';   → 0
--   SELECT count(*) FROM public.labels;                                    → 16 (o mesmo de antes)
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--     WHERE conrelid = 'public.labels'::regclass;                          → labels_color_check com o regex
-- -----------------------------------------------------------
