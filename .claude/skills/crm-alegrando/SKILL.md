---
name: crm-alegrando
description: Convenções, fronteiras de segurança, padrões de UI e critérios de responsividade do CRM Alegrando (Next.js App Router + Supabase + Clerk + n8n). Use SEMPRE que for mexer neste repositório — qualquer alteração em componente, action, rota de API, policy, workflow do n8n ou layout, e também em revisões, auditorias e diagnósticos de bug. Consulte antes de escrever código, não depois: várias regras aqui vieram de bugs que já custaram horas e não são dedutíveis do código à primeira leitura.
---

# CRM Alegrando

CRM de excursões escolares. Next.js (App Router) + Supabase (Postgres/RLS/Realtime)
+ Clerk (auth) + n8n (automações de e-mail e WhatsApp) + Cloudflare R2 (mídia).
Produção: `crm.alegrando.cloud` (Vercel).

Este documento é para ser lido **antes** de alterar qualquer coisa. Ele descreve
como o projeto está montado, o que não pode ser quebrado, e os critérios pelos
quais uma alteração é considerada pronta.

---

## 1. Mapa do projeto

Números atuais: 53 componentes, 18 páginas, 10 arquivos de server action, 7 rotas
de API, ~25,8 mil linhas em `src/`.

### Fronteira de autenticação

- **`src/proxy.ts`** — é o middleware do Clerk (nome fora do convencional; não
  procure por `middleware.ts`, ele não existe). Aplica `auth.protect()` em tudo
  que não está na lista de rotas públicas.
- **Rotas públicas** (fora da sessão do Clerk): `/sign-in`, `/sign-up`,
  `/unauthorized`, `/api/webhooks/*`, `/api/cron/*`, `/api/email-replies/*`,
  `/api/health`. "Público" aqui significa *chamado por serviço, não por pessoa* —
  **cada uma faz a própria conferência de segredo**. Ao criar uma rota nova nesse
  conjunto, a verificação de segredo é obrigatória e não opcional.
  Rota de API que a **pessoa** usa (ex.: `/api/anexos/download`) fica **fora**
  dessa lista de propósito: aí o Clerk protege de graça.
- **`src/lib/auth.ts`** — helper de sessão (`requireAuth()`) para server actions.
- **`src/app/(app)/layout.tsx`** — usa `currentUser()` do Clerk; é a casca
  autenticada das telas.

### Acesso a dados — a regra mais importante

Existem **dois** clientes Supabase, e confundi-los é a origem de falhas de
segurança e de diagnósticos errados:

- **`src/lib/supabase/client.ts`** (browser) — chave `anon` **mais**
  `accessToken: getClerkToken`. O token do Clerk vem de `window.Clerk` (é um
  singleton de módulo, não dá para usar o hook `useAuth()` ali). No supabase-js
  v2 o `accessToken` vale para PostgREST **e para o socket do Realtime** — o
  browser fala como `authenticated`, não como `anon`.
- **`src/lib/supabase/server.ts`** (servidor) — service role, ignora RLS.

**Consequência prática:** testar comportamento do browser com `curl` usando a
chave `anon` crua mede um cliente que não existe na aplicação. Isso já produziu
um diagnóstico errado que removeu funcionalidade ("Realtime é impossível"), e
custou dias. Para verificar o que o browser faz, verifique **no browser**.

`SUPABASE_SERVICE_ROLE_KEY` aparece em exatamente dois lugares —
`src/lib/supabase/server.ts` e `src/app/api/email-replies/anexo-url/route.ts`.
Nenhum arquivo `"use client"` a referencia. **Mantenha assim**: qualquer
importação de service role em componente de cliente é vazamento de credencial
com acesso total ao banco.

### Telas e componentes

Diretórios em `src/components/`: `agenda`, `configuracoes`, `conversas`,
`dashboard`, `emails`, `kanban`, `labels`, `layout`, `ui`.

Arquivos grandes (candidatos a cuidado redobrado — mudanças cegas neles quebram
coisas distantes):

| arquivo | linhas | papel |
|---|---|---|
| `conversas/conversas-layout.tsx` | 2190 | tela principal: lista + chat + painel |
| `conversas/cliente-detail-panel.tsx` | 1301 | painel lateral do lead |
| `app/(app)/tarefas/page.tsx` | 1183 | tela de tarefas |
| `lib/actions/emails.ts` | 1058 | envio, agendamento, conversas de e-mail |
| `lib/actions/leads.ts` | 980 | leads, contadores, badges |
| `conversas/chat-window.tsx` | 903 | conversa de WhatsApp |
| `emails/email-compose-modal.tsx` | 834 | composição de e-mail |
| `emails/email-conversation.tsx` | 605 | conversa de e-mail no painel do lead |

`conversas-layout.tsx` com 2190 linhas concentra lista, chat, painel e a lógica
de alternância mobile. Não refatore por iniciativa própria no meio de outra
tarefa — mas ao mexer nele, mexa cirurgicamente e releia o entorno.

### Dados: as tabelas que o projeto usa

Contagem de referências no código (`grep -rF '"<tabela>"' src`), útil para saber
o que é central:

| tabela | usos | papel |
|---|---|---|
| `"Clientes _WhatsApp"` | 45 | **tabela de leads** — o coração do CRM |
| `messages` | 42 | histórico de WhatsApp |
| `kanban_columns` | 11 | funil |
| `task_cards`, `lead_tasks`, `task_lists` | 16 | tarefas |
| `email_sends` + `email_replies` | 14 | e-mail |
| `labels` + `lead_labels` | 10 | etiquetas |
| `passeios_historico` | 6 | passeios/excursões |
| `documents` | 6 | base RAG do assistente |
| `crm_settings`, `users`, `webhook_events`, `audios`, `avatars` | — | apoio |

**`"Clientes _WhatsApp"` tem um espaço antes do underscore.** Não é erro de
digitação, é o nome real — escrever `"Clientes_WhatsApp"` falha em runtime.

RPCs: `get_dashboard_stats` e `list_clientes_by_last_msg` (a ordenação da lista).
**A versão de `list_clientes_by_last_msg` no repositório está desatualizada em
relação à de produção** — não tem o filtro de labels que o código já usa. Antes
de alterá-la, extraia a definição real do banco (`pg_get_functiondef`), ou você
reverte um filtro em produção sem perceber.

### WhatsApp

- **Dois canais, dois provedores:** Z-API (canal *alegrando*) e Evolution API
  (canal *festas*, operado pela Márcia). Webhooks separados em
  `api/webhooks/zapi` (776 linhas) e `api/webhooks/evolution` (417).
- `src/lib/whatsapp/sender.ts` (670 linhas) concentra o envio.
- **Mídia vai toda para o R2 com dedup global por hash de conteúdo**
  (`media-storage.ts`), inclusive áudio. Isso não é otimização: reenviar o mesmo
  vídeo institucional para 16 telefones criava 16 cópias e estourou a cota de
  storage do projeto Supabase anterior. Qualquer caminho novo de upload precisa
  passar pelo mesmo dedup.
- **Exceção:** fotos de perfil continuam no bucket `avatars` do Supabase Storage
  (`photo-storage.ts`).
- **Áudio:** gravar OGG/Opus de verdade (opus-recorder) e mandar a **URL pública**
  ao provedor, não base64 — é o que faz aparecer a onda sonora nativa da nota de
  voz. Enviar WebM rotulado como ogg produz áudio de 00:00.

### Cloudflare R2 — o que o código já assume

`src/lib/whatsapp/r2-client.ts` é o único ponto de contato: upload, dedup por
SHA-256 e URL assinada de PUT. Duas propriedades que mudam decisão de projeto:

- **O bucket é público** (`R2_PUBLIC_URL`, um host `pub-….r2.dev`), então a URL
  gravada no banco é servível direto no `<img src>` — não precisa assinar para
  **ler**.
- **A credencial do R2 só é comprovadamente usada para escrever.** O próprio
  `objectExistsInR2` trata `403` de "token write-only" como caso esperado. Não
  construa nada em cima de URL assinada de **GET** sem antes confirmar que o
  token tem permissão de leitura — inclusive o truque de
  `response-content-disposition` para forçar download, que depende disso.
- **As variáveis `R2_*` não estão no `.env.local`** (só na Vercel). Em
  desenvolvimento, portanto, anexo não sobe nem baixa: quem depende do R2 falha
  com "não configurado". Não gaste tempo depurando isso como bug de código — ou
  copie as chaves do painel da Cloudflare para o `.env.local`.
- **`<a download>` é ignorado quando a URL é de outra origem.** Como o R2 é
  outro host, um "Baixar" apontado direto para lá só abre em nova aba. Quem
  resolve é `/api/anexos/download`, que faz proxy do arquivo e devolve
  `Content-Disposition: attachment` — same-origin, então o navegador salva.

### Integrações e rotinas

- **Google Calendar e Drive** compartilham o client OAuth "AlegrandoCRM", mas têm
  **refresh tokens separados por desenho** (`GOOGLE_REFRESH_TOKEN` para Calendar,
  `GOOGLE_DRIVE_REFRESH_TOKEN` para Drive) — se um quebra, o outro segue.
- **`/api/cron/followup`** é autenticado por `CRON_SECRET` no header
  `authorization`. Rotinas no banco via `pg_cron`.
- **n8n** cuida de tudo que fala com API externa (WhatsApp, Gmail); o CRM cuida
  de dado e UI. Ao acrescentar integração, siga essa divisão em vez de chamar a
  API externa direto do Next.

### Deploy

O repositório **não está conectado** ao projeto na Vercel: os deploys são upload
por CLI (`vercel --prod`), sem commit associado. É a causa dos recorrentes
"commitei e não subiu" — o commit existe e o deploy nunca aconteceu. Enquanto
isso não for religado em Settings → Git, **commitar não publica**; diga
explicitamente ao usuário quando algo depende de deploy.

---

## 2. Segurança — regras invioláveis

1. **Service role nunca no cliente.** Nem importado, nem em variável
   `NEXT_PUBLIC_*`, nem "temporariamente para testar".
2. **RLS é a fronteira real, não a UI.** Toda tabela com dado de pessoa
   (`messages`, `email_replies`, `email_sends`, `leads`) precisa de policy que
   barre `anon`. O padrão adotado é `qual: auth.role() = 'authenticated'` para
   leitura e `service_role` para escrita. Já houve exposição de PII de WhatsApp
   por policy aberta a `public`; foi corrigida e não pode voltar.
3. **Rota pública nova = verificação de segredo obrigatória.** Use
   `src/lib/webhook-auth.ts`, que compara em tempo constante (`timingSafeEqual`).
   Comparação com `===` em segredo é vulnerável a timing attack.
4. **Não renderize HTML de remetente.** O corpo de e-mail é renderizado como
   texto puro e os links viram âncoras por *autolink montando nós React*. Existe
   exatamente **um** `dangerouslySetInnerHTML` no projeto
   (`src/app/layout.tsx`, script de tema, string estática). Ele nunca deve passar
   a interpolar dado dinâmico, e nenhum segundo deve aparecer.
5. **Anexos passam por validação** (`src/lib/email/attachments.ts`): lista de
   bloqueio por extensão (executáveis) e teto de 25 MB (limite do Gmail, contando
   todos os anexos; o aviso começa em 18 MB porque Base64 infla ~33%). É lista de
   **bloqueio**, não de permissão — PDF, docx, xlsx, zip passam por desenho.
6. **Rota que busca URL vinda do cliente precisa de allowlist de host.** Sem
   isso é SSRF: o servidor vira um proxy para qualquer endereço, inclusive a
   rede interna da Vercel. O padrão do projeto está em
   `src/app/api/anexos/download/route.ts` — só aceita URL que comece com
   `R2_PUBLIC_URL`.

### Achados de segurança em aberto (decidir, não ignorar)

- **`WEBHOOK_AUTH_DISABLE=true` desliga a autenticação dos webhooks.** É uma
  válvula de emergência legítima, mas se ficar ligada em produção os webhooks
  passam a aceitar qualquer chamada. Não está definida no `.env.local`; falta
  **verificar o valor na Vercel (Production)**. Considere fazer a flag expirar
  sozinha.
- **O log de 401 imprime o prefixo do segredo esperado** (`prefix_esperado='xxxx'`
  em `webhook-auth.ts`, nas **duas** linhas: Z-API e Evolution). Logs vazam para
  painéis e terceiros. Remova o prefixo do segredo esperado do log — o do
  recebido, para depuração, é aceitável.
- **`/api/email-replies/anexo-url` autentica comparando o bearer com a própria
  `SUPABASE_SERVICE_ROLE_KEY`.** Funciona, mas obriga o n8n a guardar a chave de
  acesso total ao banco. Um segredo dedicado a essa rota reduziria o estrago de
  um vazamento no n8n.
- **Não há rate limiting em lugar nenhum.** As rotas públicas (webhooks,
  `anexo-url`, `health`) aceitam chamadas ilimitadas. Baixo risco hoje, mas é o
  tipo de coisa que só aparece quando já está sendo abusada.
- **20 `console.log` em código de produção.** Confira se algum imprime corpo de
  mensagem, telefone ou e-mail — logs de servidor não são lugar de PII.

Sobre tipagem: o `src/` tem **um único** `any` explícito —
`src/components/conversas/reaction-picker.tsx:23`
(`{ current: null } as React.RefObject<any>`). É o teto: não acrescente o
segundo, e se for mexer nesse arquivo, aproveite para tipar o ref direito.

---

## 3. Responsividade

### O diagnóstico, com números

O projeto usa **50 utilitários responsivos no total** (29 em `src/components`,
21 em `src/app`), e eles estão concentrados em **15 dos 71 arquivos `.tsx`** —
os outros 56 não têm nenhum. Isso é muito pouco: a maior parte da interface foi
construída para uma largura só. **Assuma que qualquer tela ainda não revisada
quebra no mobile** até prova em contrário.

Ao medir isso de novo, varra `src/components` **e** `src/app`: as páginas ficam
em `src/app` e é fácil esquecê-las (a primeira medição deste documento
subcontou por esse motivo). Comando:

```sh
grep -rhoE '\b(sm|md|lg|xl|2xl):' src/components --include="*.tsx" | wc -l
grep -rhoE '\b(sm|md|lg|xl|2xl):' src/app        --include="*.tsx" | wc -l
grep -rlE  '\b(sm|md|lg|xl|2xl):' src            --include="*.tsx" | wc -l   # arquivos
```

Não existe hook de detecção de mobile (`src/hooks/` tem apenas
`useLeadMessages` e `useTheme`). A estratégia atual é CSS + um estado de
alternância.

### Como o projeto resolve mobile hoje

Em `conversas-layout.tsx`:
- Estado `mobileView: "list" | "chat"` alterna qual painel ocupa a tela, via
  classes `hidden md:flex`. No desktop os dois aparecem lado a lado.
- O painel de detalhes do lead vira **Sheet** no mobile
  (`w-[320px] … md:hidden`), enquanto no desktop é coluna fixa
  (`hidden md:flex`).

Esse é o padrão a seguir para telas novas: **um mesmo componente com duas
apresentações**, não duas árvores duplicadas.

### Larguras fixas — meça direito antes de "corrigir"

**Cuidado com o regex.** `w-\[[0-9]+px\]` também casa dentro de
`max-w-[…]` e `min-w-[…]`, e as três coisas têm riscos opostos: `max-w` é
proteção, `min-w` é o perigo. Separe:

```sh
grep -rhoE '(^|[^-a-z])w-\[[0-9]+px\]' src --include="*.tsx" | grep -oE 'w-\[[0-9]+px\]' | sort | uniq -c
grep -rhoE 'min-w-\[[0-9]+px\]'        src --include="*.tsx" | sort | uniq -c
```

O inventário real hoje: em `src/components`, `w-[300px]` ×5, `w-[320px]` ×2,
`min-w-[300px]` ×4, `min-w-[350px]` ×1; em `src/app`, `w-[280px]` ×3,
`min-w-[280px]` ×3, `min-w-[320px]` ×3.

**A maioria é legítima e não deve ser mexida:** os `min-w-[300px]` de
`kanban-board.tsx`/`kanban-column.tsx` e os `min-w-[280px]` de
`tarefas/page.tsx` são colunas de quadro dentro de um container com **scroll
horizontal deliberado** — tirá-los espreme as colunas e quebra o quadro. Os
`min-w-[320px]` de `agenda/page.tsx` e `kanban/page.tsx` já vêm
breakpoint-guardados (`w-full sm:w-fit sm:min-w-[320px]`).

Ofensor real confirmado: **`src/app/(app)/tarefas/page.tsx:1108`**, um
`w-fit min-w-[320px]` **sem** guarda de breakpoint, dentro do shell que tem
`p-6` — a 320px de viewport sobram 272px de conteúdo, então dá scroll
horizontal. Trocar por `w-full sm:w-fit sm:min-w-[320px]`, igual às outras duas
páginas.

E **`max-w-[1600px]` em `src/app/(app)/layout.tsx:63` não é um problema** — é o
teto do container centralizado do app. A primeira versão deste documento o
listou como "largura fixa de 1600px que merece inspeção"; era artefato do regex.

### Critérios de aceite (use como checklist)

Uma alteração de UI só está pronta quando, nas larguras **320px, 375px, 768px,
1024px e 1440px**:

- [ ] Não há scroll horizontal em nenhuma delas.
- [ ] Nenhum controle cortado, sobreposto ou encostando em outro.
- [ ] Texto longo trunca com reticências **ou** quebra — nunca empurra o layout.
      Nome de escola, assunto de e-mail e nome de arquivo são os casos reais.
- [ ] URL longa (Google Docs) não estoura o balão — `break-words` no container.
- [ ] Alvos de toque com no mínimo ~40px de altura efetiva no mobile.
- [ ] **Nada de ação só-no-hover.** `opacity-0 group-hover:opacity-100` some no
      celular, onde hover não existe: o controle fica invisível (e clicável às
      cegas, porque `opacity` não desliga o ponteiro). O padrão certo é visível
      por padrão e escondido só a partir do breakpoint:
      `opacity-100 md:opacity-0 md:group-hover/x:opacity-100 md:focus-visible:opacity-100`.
- [ ] Ação destrutiva não fica colada na ação primária (regra vinda de um caso
      real: "Descartar" ao lado de "Responder" convida ao erro).
- [ ] Funciona nos **dois temas** (claro e escuro).
- [ ] Dentro de `Sheet`/`Dialog` no mobile o comportamento é o mesmo — é onde
      mais quebra.

### Medição, não adivinhação

Quando o comportamento depende do tamanho do conteúdo (recolher texto longo,
mostrar ou não um botão "ver mais"), **decida pela altura renderizada**, não por
contagem de caracteres: o mesmo texto ocupa números de linhas diferentes no
painel estreito, no Sheet e no desktop. E **remeça quando a largura mudar** —
sem isso o estado congela ao girar o aparelho ou redimensionar o painel.
`CorpoRecolhivel` em `email-conversation.tsx` é a implementação de referência
(`ResizeObserver` + `scrollHeight`).

O mesmo vale para largura: em vez de escolher um `max-w-[Npx]` que caiba, deixe
o cartão/linha **encolher** (`max-w-full` no item + `min-w-0` no miolo flexível
+ `truncate` no texto). Número fixo que cabe no Sheet de 320px do mobile pode
não caber na coluna de detalhes do desktop, que é mais estreita depois dos
paddings — 226px úteis contra 246px.

E ao medir com navegador headless, **espere a transição terminar** antes de ler
`getComputedStyle(...).opacity`: com `transition-opacity` o valor lido logo após
o hover é um ponto intermediário (0,03) e parece um controle que não aparece.
Isso já gerou um "bug" que não existia.

---

## 4. UI e consistência

- **Componentes base em `src/components/ui/`** (shadcn/ui). Prefira compor com
  eles a criar um controle novo.
- **Tema escuro** via atributo `data-theme` no `<html>`, com bootstrap síncrono
  no `layout.tsx` (evita flash) e persistência em `localStorage` (`crm-theme`).
  Todo estilo novo precisa do par `dark:`.
- **Acessibilidade** já tem base: `aria-expanded`, `aria-label`, `aria-live`,
  `aria-pressed`, `aria-selected`, `aria-busy` aparecem no código. Mantenha:
  controle que expande recebe `aria-expanded`; região que atualiza sozinha
  (Realtime) merece `aria-live`.
- **Ponto fraco conhecido:** as cores são **hex literais espalhados nas
  classes** (`#6366F1`, `#191918`, `#9B9A97`, `dark:#94a3b8`…), não tokens. Ao
  criar algo novo, reutilize os hex já usados no mesmo contexto em vez de
  inventar tons próximos — a alternativa (migrar tudo para tokens) é um projeto à
  parte e não deve ser feita de carona em outra tarefa.
- **`portal-guards`** (`src/components/emails/portal-guards.ts`,
  `ignorarSeForPortalDeEmail`) impede que cliques em portais (dropdown, seletor
  de arquivo) fechem o Sheet/Dialog e destruam o rascunho. Usado em
  `email-compose-modal.tsx` e `conversas-layout.tsx`. **Nunca remova sem
  substituto** — a regressão só aparece no mobile e destrói trabalho do usuário.
- **Link que navega a janela inteira mata rascunho.** Dentro da composição de
  e-mail o corpo é `contentEditable`: qualquer `<a href>` sem `target="_blank"`
  que aponte para uma rota que pode responder erro (em vez de um download) leva
  a página embora e o texto digitado junto. Âncora de anexo/download vai sempre
  com `target="_blank" rel="noopener noreferrer"`.

---

## 5. Realtime

- A assinatura vive no cliente e usa o client de `supabase/client.ts` (já
  autenticado via Clerk). Tabelas publicadas e efetivamente assinadas hoje:
  `messages`, `labels`, `lead_labels`, `email_replies` (em
  `conversas-layout.tsx`) e `email_replies` + `UPDATE` de `email_sends` (em
  `lead-email-section.tsx`, que é o que tira a bolha de "Na fila de envio").
- **O callback rebusca no servidor; não remende estado local.** As conversas são
  agrupadas por thread no servidor — reproduzir esse agrupamento a partir de uma
  linha solta cria uma segunda verdade sobre o mesmo dado, e as duas divergem em
  algum caso de borda.
- **Contadores e badges são calculados no servidor.** O evento serve como aviso
  para recontar, não como fonte do número. Isso faz o caminho de volta funcionar
  de graça (ler numa aba apaga o badge na outra).
- **Guarda de "requisição em voo" não pode DESCARTAR o evento.** O padrão
  `if (emVoo) return` protege contra empilhar requisição, mas se o evento do
  Realtime chegar durante um refetch que já estava em andamento, a atualização
  se perde e a tela só corrige no intervalo de segurança. Marque um pedido
  pendente e refaça ao terminar (coalescer), em vez de ignorar.
- **Sempre logue `CHANNEL_ERROR` e `TIMED_OUT`.** O Realtime falha em silêncio:
  sem log, "não atualiza" é indistinguível de "não conectou" e de "conectou sem
  permissão".
- Rotação de token não precisa de tratamento manual: o `RealtimeClient`
  reautentica no heartbeat.

Antes de teorizar sobre por que um evento não chega, **verifique se existe
alguém assinando**. Já aconteceu de o problema ser a ausência de assinatura
enquanto se investigava JWT, policy e publicação.

---

## 6. Integração com n8n

- Workflows relevantes: worker de respostas de e-mail (gatilho duplo: webhook do
  Gmail Push + schedule de 2 min como rede de segurança), envio, envio agendado,
  renovação do `watch` do Gmail (diária; o watch expira em 7 dias) e um workflow
  de aviso de falha.
- **Escrever workflow: leia do servidor imediatamente antes, mute sobre esse
  retorno, e releia depois para confirmar.** O retorno do PUT não é prova. Já
  houve regressão silenciosa que apagou uma correção validada.
- **Escrita pela API pública zera `availableInMCP`.** Religue pela UI ao final,
  senão o workflow some das ferramentas MCP e o próximo diagnóstico fica cego.
- Nos Code nodes, **`$input` é a saída do nó imediatamente anterior** — não
  necessariamente o nó cujo dado você quer. Referencie explicitamente
  (`$('Nome do nó')`) e pareie por **linhagem** (`itemMatching()`), não por
  índice. Pareamento posicional já causou dois bugs.

---

## 7. Migrations e deploy

- **Migration primeiro, deploy depois.** Com o repositório conectado à Vercel, o
  deploy deixa de esperar por você.
- Existe cascata de tolerância nos dois lados (o `select` do CRM cai para uma
  lista reduzida de colunas; o worker tem um nó de gravação sem as colunas
  novas), então rodar à frente do banco não quebra nem perde dado. **Mas confira
  o que o caminho de fallback descarta**: já houve um caso em que ele salvava a
  linha e jogava fora os anexos. Fallback deve mandar tudo que já existe hoje,
  deixando de fora apenas o campo novo.

---

## 8. Anti-padrões (todos vieram de bugs reais deste projeto)

1. **Falha silenciosa.** O padrão que mais custou tempo: o texto entrava, o
   arquivo sumia, nada indicava. Toda falha parcial precisa de sinal — na tela
   quando afeta o usuário, no log quando é operacional. Ao escrever um `catch`
   ou um `continue`, pergunte: se isso acontecer 200 vezes, alguém percebe?
2. **Medir o cliente errado.** Ver §1.
3. **Pareamento por índice** entre listas de origens diferentes. Ver §6.
4. **Confiar no retorno da escrita** em vez de reler o estado persistido.
5. **Conflacionar mecanismos parecidos.** "Ver mensagem completa" (revela a
   citação do Gmail) e "recolher texto longo" são coisas diferentes; rótulos
   parecidos em botões vizinhos confundem em uma semana de uso. Corolário: um
   cartão de anexo tem **uma** ação de abrir (lightbox para imagem, nova aba
   para o resto) e **uma** de baixar — não duas de abrir competindo.
6. **Refatorar de carona.** Arquivo de 2000 linhas convida, mas misturar
   refatoração com correção torna impossível saber o que quebrou.
7. **Comentário que sobrevive ao código que descreve.** Um comentário afirmando
   que "o Realtime dessas tabelas não chega ao navegador" ficou meses ao lado da
   assinatura que funciona — e é justamente o diagnóstico errado do §1. Ao
   corrigir um mecanismo, corrija o comentário que o explicava errado.

---

## 9. Antes de dar por pronto

- [ ] Reli do servidor/repositório o que escrevi e confirmei que persistiu.
- [ ] Rodei o checklist de larguras da §3 nos dois temas.
- [ ] Nenhuma falha nova é silenciosa.
- [ ] Nenhum service role, segredo ou PII cruzou para o cliente ou para o log.
- [ ] Não regredi: portal-guards, marcação de lida ao expandir, estilos de
      bounce e de não lida, selo de rascunho, editor recolhido por padrão,
      abrir/baixar anexo.
- [ ] Se mexi em workflow do n8n: religuei `availableInMCP` e conferi que nada
      mais mudou junto.
- [ ] Se depende de deploy, avisei — **commitar não publica** (§1).
