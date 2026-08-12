# Os skills mudaram de lugar

Os skills deste repositório vivem agora em **`.claude/skills/`**:

- `.claude/skills/crm-alegrando/SKILL.md` — convenções, segurança, UI e
  responsividade do CRM. Leia antes de mexer em qualquer coisa.
- `.claude/skills/frontend-design/SKILL.md` — veio daqui, de
  `.agent/skills/frontend-design/`.

## Por que ali e não aqui

Havia dois diretórios de skill no mesmo repositório, com risco de divergirem.
A escolha foi `.claude/skills/`, porque é o caminho que o Claude Code carrega
sozinho — o skill em `.agent/skills/` nunca era encontrado por ele. Um documento
que ninguém lê no momento de escrever código não serve pra nada.

`.agent/workflows/` continua onde estava: são workflows do Antigravity, não
skills, e nada mudou pra eles.

**Se o Antigravity (ou outra ferramenta) precisar ler skills daqui**, o caminho
é reverter o movimento — `git mv .claude/skills/frontend-design
.agent/skills/frontend-design` — ou duplicar. Duplicar recria exatamente o
problema que este arquivo existe pra evitar: prefira apontar a ferramenta pro
`.claude/skills/`.
