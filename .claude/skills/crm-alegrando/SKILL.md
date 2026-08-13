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

Números atuais: 54 componentes, 18 páginas, 10 arquivos de server action, 7 rotas
de API, ~26,4 mil linhas em `src/`.

**Os skills deste repositório ficam em `.claude/skills/`** — é o único caminho
que o Claude Code carrega sozinho. Já houve um `frontend-design` em
`.agent/skills/` que nenhuma sessão nunca enxergou; foi movido, e
`.agent/skills/LEIA-ME.md` marca o lugar. `.agent/workflows/` é do Antigravity e
continua valendo.

### Fronteira de autenticação

- **`src/proxy.ts`** — é o middleware do Clerk (nome fora do convencional; não
  procure por `middleware.ts`, ele não existe). Aplica `auth.protect()` em tudo
  que não está na lista de rotas públicas, **e** confere o e-mail da sessão
  contra `ALLOWED_EMAILS`.
- **Guarda de autorização em layout não protege nada além do render.** No App
  Router a invocação de uma **server action não passa pelo layout** — nem rota de
  API. A allowlist morava só em `app/(app)/layout.tsx`, então uma sessão indevida
  continuava chamando `listLeadEmailConversations`, `sendEmailToLead` e as demais,
  e lendo os 737 leads. Vale como regra geral: **autorização é no middleware**;
  no layout ela é no máximo segunda camada.
- **Entrar alguém novo são DOIS passos.** `/sign-up` está fechado (fora da lista
  pública), então: (1) criar a conta no painel do Clerk e (2) acrescentar o
  e-mail em `ALLOWED_EMAILS` na Vercel. Esquecer o segundo faz a pessoa logar
  normalmente e cair em "não autorizado" — o sintoma não parece configuração.
- **Há DUAS instâncias do Clerk.** O `.env.local` aponta para a de teste
  (`sk_test`, 1 usuário); a produção usa a live (`sk_live`, 4 usuários). Listar
  usuários com a chave local devolve a instância errada — foi o que quase montou
  uma allowlist com uma pessoa só. Para saber quem usa o CRM de verdade, a fonte
  boa é a tabela `users` do Supabase de produção, que o layout sincroniza.
- **Rotas públicas** (fora da sessão do Clerk): `/sign-in`, `/unauthorized`,
  `/api/webhooks/*`, `/api/cron/*`, `/api/email-replies/*`, `/api/health`.
  `/sign-up` **saiu** da lista — cadastro aberto era a porta de entrada.
  `/sign-in` e `/unauthorized` têm de continuar públicas: são as telas de saída
  da allowlist, e protegê-las põe quem não tem acesso num laço de redirect. "Público" aqui significa *chamado por serviço, não por pessoa* —
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
| `lib/actions/emails.ts` | 1089 | envio, agendamento, conversas de e-mail |
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

### E-mail: o corpo, e o que a conversão pra texto perde

O corpo de uma resposta é mostrado como **texto puro** (§2.4). Isso tem um preço
que já custou um bug: **`htmlParaTexto` guarda o texto da âncora e joga o `href`
fora.** Consequências que não são óbvias lendo o código:

- **Arquivo inserido pelo chip do Drive NÃO é anexo.** É um bloco HTML no corpo
  (`<div class="gmail_chip gmail_drive_chip">` com `<a href>`, `<img>` de ícone e
  `<span>` de título). Chegava na tela como texto morto — só o título, sem link.
  O autolink não resolve: não existe URL no texto pra linkar.
- **Teste com "3 anexos" onde 2 são do Drive chega com 1 anexo, e está certo.**
- Quem precisa do endereço usa **`extrairLinksDoCorpo`** (`lib/email/format.ts`),
  que lê o `body_html` — gravado inteiro em todas as respostas — e devolve
  `LinkDoCorpo[]` estruturado. Roda **na leitura**, no servidor: vale
  retroativamente pras respostas antigas, sem migration e sem reprocessar.
- A extração corta a citação antes (`removerCitacaoHtml`): link que só existe no
  histórico citado viraria cartão repetido a cada resposta da thread.
- O título do chip sobra como **linha órfã** no texto. `removerTitulosDeChip`
  tira, comparando a linha inteira — senão aparece duas vezes, uma como texto e
  outra no cartão. Aplique nos **dois** campos (`body_text` e `body_text_full`):
  o componente acha a citação por diferença de tamanho entre eles, e limpar só um
  desalinha a conta.
- Entidades nomeadas acentuadas (`&ccedil;`, `&Atilde;`) são decodificadas com
  **caso exato antes do minúsculo** — senão "Conceição" vira "conceição".

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

O repositório **está conectado** ao projeto na Vercel — GitHub
`GMedeiros-cyber/CRM-Alegrando`, branch de produção `main`. Confira com
`vercel api /v9/projects/crm-alegrando` e olhe o campo `link`.

**`git push origin main` publica.** Não precisa de `vercel --prod`; rodar os dois
só cria dois deployments de produção para o mesmo código (foi o que aconteceu
por duas rodadas seguidas antes de alguém reparar na lista do `vercel ls`).

Uma versão anterior deste documento dizia o contrário — "commitar não publica" —
e isso deixou de valer. A consequência prática é a regra do §7: **migration
primeiro, sempre**, porque o deploy não espera mais por você. Empurrar código que
depende de coluna nova antes de aplicá-la coloca a versão nova no ar contra o
banco velho.

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
6. **URL extraída de HTML de terceiro só pode ser `http`/`https`.** Filtre no
   **servidor**, com `new URL()` (que também normaliza), antes de o endereço
   chegar ao componente — `javascript:`, `data:` e `vbscript:` viram `href`
   executável se passarem. Ver `urlSegura` em `lib/email/format.ts`.
7. **Rota que busca URL vinda do cliente precisa de allowlist de host.** Sem
   isso é SSRF: o servidor vira um proxy para qualquer endereço, inclusive a
   rede interna da Vercel. O padrão do projeto está em
   `src/app/api/anexos/download/route.ts` — só aceita URL que comece com
   `R2_PUBLIC_URL`.

### Estado da segurança (auditado em 13/08/2026)

Resolvidos, não repita a investigação:

- **`WEBHOOK_AUTH_DISABLE`** ficou 94 dias definida em produção, mas com valor
  diferente de `"true"` — e a comparação é de igualdade estrita, então a
  autenticação nunca esteve desligada. Variável removida da Vercel; o caminho
  no código continua, para quem precisar recriar a válvula num incidente.
- **`prefix_esperado` saiu dos logs de 401.** O do recebido ficou: é dado de
  quem chamou e responde "veio token errado ou token nenhum?".
- **PII e URL de mídia saíram dos logs** (`lib/log-redact.ts`:
  `telefoneMascarado`, `hostDe`). Era pior do que parecia — o `sender.ts` logava
  a URL pública do R2, e o bucket é público: quem lesse o log abria o anexo.
- **Os segredos legados viraram `Sensitive` na Vercel** (13 variáveis, incluindo
  service role e Clerk). Antes eram legíveis por quem tivesse acesso ao painel.
  Efeito colateral: `vercel env pull` não devolve mais esses valores, e como
  `--sensitive` só vale em Production/Preview, elas saíram do ambiente
  Development.
- **`ALLOWED_EMAILS` não existia na Vercel**, então a checagem de acesso era
  pulada inteira (`if (allowedEmails.length > 0)`). Somado a `/sign-up` aberto e
  à allowlist do Clerk indisponível no plano (402), qualquer um que achasse o
  endereço criava conta e entrava. Nenhuma conta indevida chegou a existir.

Em aberto, decisão tomada de não fazer agora:

- **Sem rate limiting.** A conta é **Hobby** e a config do firewall está vazia
  (`versions: []`); regra de rate limit exige Pro. As rotas públicas já
  conferem segredo próprio, então isto é defesa em profundidade, não única
  camada. Retomar se subir de plano.
- **`/api/email-replies/anexo-url` autentica com a própria
  `SUPABASE_SERVICE_ROLE_KEY`**, o que obriga o n8n a guardar a chave de acesso
  total. É concentração de poder desnecessária, mas com o painel restrito a uma
  pessoa é melhoria, não correção.

Contexto que calibra a gravidade de qualquer vazamento em log: **a retenção de
runtime log no Hobby é de 1 hora e não há log drain configurado.** Vazamento em
log tem janela curta e plateia de um. Se um dia entrar log drain, a conta muda.

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
`w-fit min-w-[320px]` **sem** guarda de breakpoint. Transborda **128px a 320px**
e 73px a 375px — e o sintoma **não é scroll horizontal, é recorte**: a raiz da
página tem `overflow-hidden`, então o cabeçalho é cortado e o texto some sem
deixar rastro. Trocar por `w-full sm:w-fit sm:min-w-[320px]`, igual às outras
duas páginas.

### O orçamento de largura — o número que a maioria das contas esquece

O shell (`src/app/(app)/layout.tsx`) põe **`pl-[64px]`** no `<main>` (o rail
fixo da sidebar, que existe em TODAS as larguras) **mais** `p-6 lg:p-8`. Então a
largura útil de conteúdo é bem menor que o viewport:

| viewport | útil |
|---|---|
| 320px | **208px** |
| 375px | 263px |
| 768px | 656px |
| 1024px | 896px |
| 1440px | 1312px |

Meça contra essa coluna, não contra o viewport. Uma versão anterior deste
documento dizia "a 320px sobram 272px" — tinha esquecido o rail de 64px, e
subestimava todo estouro em 64px.

**`mx-auto` anula margem negativa horizontal.** `conversas-layout.tsx:1669` tem
`-m-6 lg:-m-8 … mx-auto` querendo sangrar até a borda; o `mx-auto` vem depois na
cascata e zera o `-mx`. Na prática a tela vive dentro dos mesmos 208px — medido,
não deduzido. O `-m-6` só vale no eixo vertical.

**A soma das colunas fixas é o que quebra o tablet.** Em `conversas-layout` a
lista tem `md:w-[350px]` e o painel de detalhes tinha `hidden md:flex` com
`w-[300px]`: a 768px isso dava 350 + 300 + bordas = 654 dos 656 úteis, e **o chat
ficava com 6px**. Corrigido movendo só o painel (e o Sheet que o substitui) de
`md:` para `lg:` — a 768px o chat passou a 306px e os detalhes seguem a um
toque. Ao acrescentar coluna fixa, some as colunas contra a tabela acima **antes**
de escolher o breakpoint; `md:` não é o padrão, é uma conta.

**`grid-cols-2` dentro do painel do lead cabe — já foi medido.** Os 226px úteis
dão colunas de 109px, com rótulo em uma linha e o `TimePicker` ocupando 107px.
Não "conserte" empilhando: dobra a altura do bloco (51px → 110px) num painel que
já rola. Só mexa se a medição de novo disser outra coisa.

Padrão certo já usado no projeto, para copiar: `novo-lead-modal.tsx:82` faz
`w-[380px] max-w-[90vw]` — largura de conforto com teto de segurança.

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

- **Migration primeiro, sempre.** Não é preferência: o repositório está conectado
  à Vercel e `git push origin main` publica sozinho (§1). O deploy não espera por
  você, então a ordem é aplicar a migration, conferir que pegou, e só então
  empurrar o código.
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
   para o resto) e **uma** de baixar — não duas de abrir competindo. E cartão de
   **link** (arquivo no Drive de terceiro) não oferece "baixar": o arquivo não é
   nosso e o acesso depende da permissão de lá.
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
      abrir/baixar anexo, cartão de link do Drive.
- [ ] Se mexi em workflow do n8n: religuei `availableInMCP` e conferi que nada
      mais mudou junto.
- [ ] Se depende de deploy, avisei — **commitar não publica** (§1).
