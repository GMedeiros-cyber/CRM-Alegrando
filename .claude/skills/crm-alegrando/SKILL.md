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

**Antes de tudo: existem dois projetos Supabase, e o antigo continua de pé.** O
banco vivo é `aymdpooolgwfeczzepmq` — é o do `.env.local`, e é onde
`email_sends`/`email_replies` respondem. O `mtzlpogvcyhhjaagmlxn`
("Alegrando IA") está **congelado desde 23/07/2026** (última mensagem gravada
nessa data), mas segue `ACTIVE_HEALTHY` com 706 leads e 22.636 mensagens: ele
responde a qualquer consulta com uma foto convincente e velha. As tabelas de
e-mail **nem existem** lá — é o teste mais rápido para saber em qual banco você
caiu.

**Confirme o `ref` antes de concluir qualquer coisa a partir de um SQL.** Não é
preciso ferramenta errada para se enganar: basta um ref velho copiado de uma
anotação — foi assim que uma sessão inteira mediu o banco congelado, e só
percebeu quando `email_replies` não existia. Some-se a isso que consultas podem
vir de contas ou conectores diferentes, cada um apontado para um projeto. O
teste de um segundo: **`email_replies` existe? Então é o banco vivo.** É o
anti-padrão "medir o cliente errado" (§8.2) na variante mais cara: medir o
**banco** errado, com números plausíveis.

**O servidor MCP chamado `alegrando` aponta para o `project_ref` CONGELADO**
(`mtzlpogvcyhhjaagmlxn`). É uma armadilha de nome: quem procurar "o banco da
alegrando" pega o banco morto e recebe números plausíveis. O `.mcp.json`
(gitignored, não versionado) ganhou um servidor `supabase` apontado para
`aymdpooolgwfeczzepmq`, o vivo. **Confira o `project_ref` do servidor antes de
confiar em qualquer SQL** — o nome não é garantia de nada.

Cuidado para não repetir o erro que este parágrafo já teve numa versão: **isso
NÃO é a explicação do `You do not have permission`.** Aquele erro vinha do
conector `claude.ai Supabase` (que aparece `Connected` e **não** tem
`project_ref` na URL), e a causa segue desconhecida — provavelmente restrição do
próprio conector. Ligar o achado do `alegrando` a esse sintoma foi uma causa
inventada em cima de duas observações verdadeiras: exatamente o §8.2/§8.8 na
forma mais sedutora, porque a peça encontrada é real e parece encaixar.

Para saber o que está de fato disponível, `claude mcp list` mostra o estado de
cada servidor (`Connected`, `Needs authentication`, `Pending approval`). Servidor
de escopo de projeto exige **aprovação** ao abrir o `claude` no diretório, antes
de qualquer OAuth — são dois portões, não um.

**Antes de aplicar DDL por MCP, faça o teste de um segundo mesmo assim**
(`email_replies` existe?). Historicamente a sessão recebia
`You do not have permission` no projeto vivo, e `apply_migration` com um `ref`
insistido aplicava **no congelado** reportando sucesso. O caminho garantido
continua sendo o arquivo `migration_*.sql` na raiz colado no SQL Editor. Não há
`psql` nem CLI do Supabase nesta máquina, e o `.env.local` não tem string de
conexão.

> ## ⛔ NÃO PAUSE NEM APAGUE O PROJETO `mtzlpogvcyhhjaagmlxn`
>
> Ele **parece** morto — está congelado desde 23/07/2026 e ninguém o mantém —
> mas **ainda serve mídia que o CRM de produção exibe todo dia**. Se alguém
> limpar aquele projeto "porque está sem uso", o histórico perde o conteúdo e
> **não há de onde recuperar**.
>
> Pendurado nele hoje:
>
> | canal | mensagens com mídia lá |
> |---|---|
> | alegrando | **560** (299 áudio · 118 documento · 72 imagem · 46 sticker · 25 vídeo) |
> | festas | **1.095** |
> | — | mais **7 leads** com `foto_url` apontando pra lá |
>
> A trava só pode ser levantada quando a migração terminar e a conferência
> mostrar zero URLs remanescentes nos dois canais. Enquanto isso não acontecer,
> pausar o projeto é perda de dado irreversível — e o `ACTIVE_HEALTHY` de hoje
> não é garantia: ele **já esteve restrito uma vez**.

**Destino da migração — são DOIS destinos, não um.** A resposta não sai de
memória; sai do código:

- **Mídia de mensagem (áudio, documento, imagem, sticker, vídeo) → R2.**
  `sendAudioMessage` já chama `putMediaDeduped` (R2, com dedup por hash), e o
  bucket `audios` do Supabase sobrevive **apenas** no caminho de exclusão, como
  limpeza de legado. Se alguma anotação disser que "áudio segue no Supabase",
  está desatualizada: medido, 15 áudios já estão no R2 contra 75 no projeto
  velho.
- **Foto de perfil de lead → Storage do projeto NOVO, bucket `avatars`.**
  `photo-storage.ts` tem `BUCKET = "avatars"` e usa o cliente de servidor, que
  aponta pro banco vivo. São 230 avatares já lá. **Avatar não vai pro R2** —
  mandar pra lá contraria a arquitetura vigente.

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

### Latência: primeiro a geografia, depois o cold start

**As funções rodam em `gru1` (São Paulo), e isso é deliberado** — está em
`vercel.json`, não na config do painel, para aparecer no diff. O padrão da Vercel
é `iad1` (Virgínia), e com o Supabase em São Paulo cada server action fazia
navegador (SP) → lambda (Virgínia) → Supabase (SP) → volta: duas travessias de
~9.000 km para buscar dado da mesma cidade do usuário.

Medido daqui, na mesma rota (`/api/health`, quente):

| região | mediana |
|---|---|
| `iad1` | 215–220 ms |
| `gru1` | **87 ms** (p90 118) |

**2,5× em toda função** — página, rota de API e server action —, sem uma linha de
código. Antes de otimizar consulta, confira em que hemisfério a função está.

**Quem atravessa o oceano agora é o Clerk.** `api.clerk.com` responde em ~200 ms
medido do Brasil, contra os ~20–50 ms que custaria de `iad1`. Isso está embutido
nos 87 ms acima (a medição foi na rota real), então não é problema — mas é o
primeiro lugar a olhar se algum caminho **dependente do Clerk** parecer lento.

O caminho que paga essa conta é a allowlist do `proxy.ts`: quando o e-mail não
vem no token da sessão, ela busca o usuário no Clerk (com cache de 5 min por
instância). **Dá para zerar isso:** no painel do Clerk, em Sessions →
personalizar o token da sessão, acrescentar `"email": "{{user.primary_email_address}}"`.
O `proxy.ts` já prefere o claim quando ele existe e só cai para a API quando
não — ou seja, a melhoria é de configuração, sem tocar em código.

### O cold start, que sobra depois disso

**Medido, não suposto.** O banco responde em **0,2 ms** — `EXPLAIN (ANALYZE)` no
lead com 1.224 mensagens, índice `(telefone, canal, created_at DESC)`, 12 buffers.
Não há SQL nem índice a otimizar.

O custo está na função serverless. Em `/api/health`, que é uma linha de JSON:

| | tempo |
|---|---|
| quente | 0,20–0,24 s |
| após 22 min ocioso | **1,64 s** (as seguintes voltam a 0,21 s) |

São ~1,4 s de cold start na rota mais barata que existe. As de Conversas carregam
Clerk e Supabase num bundle de 3,25 MB — o custo delas é **maior**, não menor.
Com 61 visitantes/mês o lambda está quase sempre frio.

**Cada rota é uma lambda separada — e `.rsc` é outra ainda.** O `vercel inspect`
lista `λ agenda` e `λ agenda.rsc` como entradas distintas. Três consequências
que não são óbvias:

- `router.push` com query nova busca o **RSC payload**, que mora na lambda
  `<rota>.rsc` — só usada em navegação client-side, logo fria quase sempre. Por
  isso `handleSelectCliente` usa `history.pushState`: não é só uma viagem a
  menos, é deixar de acordar uma lambda que ninguém mais acorda. Quem empilha a
  entrada do histórico passa a ser o componente, então o `popstate` também é
  dele — há um listener que devolve o estado ao voltar, e **o botão voltar faz
  parte do teste** de qualquer mexida ali.
- **Ping em `/api/health` para "manter quente" não serve.** Ele aquece a lambda
  do health e mais nada. Aquecer a de Conversas exigiria requisição autenticada
  na própria rota — ping anônimo para em `307` no middleware, sem nunca executar
  a página.
- Sobra uma exposição a frio por troca de lead: a server action `loadCliente`.
  Só sai lendo o lead direto do browser, o que depende de abrir
  `"Clientes _WhatsApp"` para `authenticated` — decisão de segurança, não de
  performance.

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

#### Convenções de valor que já enganaram (confirme antes de assumir)

- **`messages.sender_type` vale `cliente` ou `equipe`.** Só esses dois. Medido:
  10.090 e 13.841 linhas. `user` e `bot` devolvem **zero**. Filtrar por `'user'`
  não dá erro — devolve lista vazia, e a conclusão que se tira dela é
  "o mecanismo não existe". Foi exatamente isso que levou alguém a afirmar que
  não havia controle de não-lidas no CRM, quando havia. Ver §8.9.
- **Grupo de WhatsApp é identificado pelo sufixo `-group` no `telefone`**, não
  por `@g.us`. Exemplo real: `120363403370100527-group`. São 5 grupos no canal
  alegrando. O helper canônico é `isGroupTelefone` em `lead-list-item.tsx`, que
  também cobre os IDs gravados como numeric antes da migração para TEXT — use
  ele em vez de comparar sufixo na mão.
- **Não-lida não é coluna: é comparação.** Mensagem de `cliente` mais nova que
  o `last_seen_at` do lead (nulo = tudo não lido). Quem calcula é a RPC
  `list_clientes_by_last_msg`, que devolve `unread_count` por lead — hoje 57 dos
  313 leads de alegrando. **Reaproveite essa fonte**; uma segunda regra de
  não-lida divergiria do badge do card.
- **`last_seen_at` é compartilhado entre os usuários**, não por pessoa. Qualquer
  semântica nova de "estado da conversa" (favorito, arquivado) deve seguir a
  mesma escolha, sob pena de a barra de filtros misturar o que é de todos com o
  que é de cada um.

RPCs: `get_dashboard_stats` e `list_clientes_by_last_msg` (a ordenação da lista).
**A versão de `list_clientes_by_last_msg` no repositório está desatualizada em
relação à de produção** — não tem o filtro de labels que o código já usa. Antes
de alterá-la, extraia a definição real do banco (`pg_get_functiondef`), ou você
reverte um filtro em produção sem perceber.

### WhatsApp

- **Um canal ativo: *alegrando*, via Z-API.** O canal *festas* (Evolution API,
  operado pela Márcia) foi **encerrado em agosto/2026** — ver a seção abaixo.
  Webhooks continuam em `api/webhooks/zapi` (776 linhas) e
  `api/webhooks/evolution` (o segundo agora só responde "canal desativado").
- `src/lib/whatsapp/sender.ts` (670 linhas) concentra o envio.
- **`fromApi=true` ⇒ "já salvo" é SUPOSIÇÃO, não fato.** O handler
  (`api/webhooks/zapi`) ignora todo evento com `fromMe=true, fromApi=true`,
  partindo do princípio de que a server action do CRM já gravou. Medido em
  16/09/2026: duas mensagens enviadas à Z-API por um script de diagnóstico
  chegaram no aparelho e **nunca existiram no banco** — o webhook as descartou,
  e nenhuma action as havia gravado. Qualquer caminho que fale com a Z-API sem
  gravar no `messages` produz conversa que o cliente vê e o CRM desconhece.
- **O handler descarta edição em silêncio, por dois caminhos.**
  `MESSAGE_EVENT_TYPES` só aceita `ReceivedCallback`, `SentCallback` e
  `ReactionCallback` — qualquer outro `type` sai em
  `{status:"skipped", reason:"non-message event"}`, **sem log**. E mesmo passando
  o filtro, o bloco que salva exige `!isFromApi`, então edição disparada pelo
  CRM cai fora de novo. **Não há log cru de payload da Z-API** (`webhook_events`
  é usada só pelo webhook do Clerk), então o formato do evento de edição **não
  é conhecível a partir do repositório** — tem de ser capturado em execução.
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
- **Tamanho: o teto é do WhatsApp, não do CRM — 100MB para vídeo e documento**
  (doc da Z-API). Os 10MB/16MB que o CRM aplicava eram invenção nossa e foram
  removidos em 18/09/2026; o mesmo número vale para clipe, Ctrl+V e Drive
  (`adicionarArquivos` e `attachDriveFile` destino chat). A mensagem de erro
  diz o limite real e de quem ele é — vídeo 4K do celular estoura sempre, e a
  pessoa precisa entender que não é defeito do sistema.
- **Vídeo: a Z-API recomenda H.264. iPhone grava HEVC (H.265) por padrão.**
  HEVC cai na conversão interna do provedor, que pode **falhar de forma
  intermitente** ou **aumentar** o tamanho do arquivo — e aí um vídeo que cabia
  no teto deixa de caber depois de convertido. "Vídeo às vezes não vai" com
  arquivo de iPhone: olhar o codec antes de olhar código. Compressão/transcode
  no navegador é rodada própria, em andamento por outro agente — não embutir
  em outra tarefa.
- **O caminho de upload, ponto a ponto (medido em 18/09/2026):**
  - **Clipe e Ctrl+V** acima de 10MB vão **direto browser→R2** por presigned
    PUT: o R2 aceita até 5GB num PUT, o `fetch` do browser não tem timeout, e a
    assinatura de **300s** é conferida no **início** do PUT. Aguentam 100MB.
  - **Drive** (`attachDriveFile`) é **server-side**: baixa o arquivo inteiro para
    memória e sobe ao R2 (`fetchWithTimeout` de 60s). **Medido pelo mesmo
    código, da máquina de dev:** 5MB em 2,8s · 15MB em 5,0s · 29MB em 8,8s ·
    57MB em 8,0s · 79MB em 9–11s · **129MB em 10,8s**. Download do Drive a
    4–27 MB/s, PUT no R2 a 6–21 MB/s. **Nada falhou e nada chegou perto dos
    60s.** Uma versão anterior deste documento chamava esse caminho de "gargalo
    real para 100MB" — era inferência, não medição, e estava **errada**.
  - **⚠️ Esses números são da MÁQUINA LOCAL, pela conexão doméstica do Gabriel.**
    A função roda em `gru1`, com banda de datacenter para o Google e para o R2.
    Os 11s são **teto pessimista**, não otimista: em produção a tendência é
    menor. Quem reler achando que são tempos de produção vai superestimar o
    risco. E a prova final é só uma: arquivo grande de verdade pelo Drive, em
    produção, depois do deploy — até lá tudo isto é inferência, inclusive esta.
  - **Conclusão (18/09/2026): o Drive NÃO tem teto próprio.** Nenhuma faixa
    falhou; inventar um número seria repetir o erro dos 10/16MB. O que entrou
    no lugar foi declarar a duração.

### Duração de função: SEMPRE declarada no repo, nunca no default

**O default de `maxDuration` da Vercel não é legível.** A API do projeto
(`/v9/projects/…`) **não expõe** `maxDuration` nem o estado do Fluid Compute —
medido em 18/09/2026 — e o painel não é confiável para isso. Depender do
default é depender de um número que ninguém consegue conferir, e que muda com
o plano. Neste projeto, portanto, **a duração é declarada em código**:

```ts
// src/app/(app)/layout.tsx
export const maxDuration = 60;
```

**Por que no layout, e não na action nem no `vercel.json`:**

- Server action **não tem rota própria**. O cliente faz `POST` na URL da página
  em que está (header `Next-Action`) e a action roda **dentro da lambda dessa
  página**. `export const maxDuration` em `lib/actions/*.ts` não vale nada —
  route segment config só existe em `layout`, `page` e `route`.
- `attachDriveFile` é invocável de mais de uma página (`/conversas` e qualquer
  uma que abra o compositor de e-mail). Declarar página por página é lista que
  envelhece. **Config de layout se propaga aos segmentos filhos** — provado
  pelo build: `.next/server/functions-config-manifest.json` sai com
  `{"maxDuration": 60}` nas **9 rotas** sob `(app)` a partir de uma declaração.
- `functions` no `vercel.json` **não serve para Next.js App Router**: o glob
  casa com funções que a Vercel empacota direto (`api/`, Build Output API); o
  build do Next é opaco para ele, e o deploy acusa
  "pattern doesn't match any Serverless Functions".
- `/api/*` fica **fora** do `(app)/layout` e não herda. Route handler que
  precisar de mais tempo declara o próprio `maxDuration` no `route.ts`.

**Por que 60:** é o que o Hobby aceita com folga, e ~5× o pior caso medido
(11s). **Não pedir 300**: se o plano não suportar, o deploy falha — e falha
no push para `main`, que é produção.

**Linha de base medida (18/09/2026, máquina local, ver ressalva acima):**
5MB 2,8s · 15MB 5,0s · 29MB 8,8s · 57MB 8,0s · 79MB 9–11s · 129MB 10,8s. Se
algum dia um arquivo dessas faixas passar de 40s pelo Drive, **alguma coisa
mudou** — rede, API do Google, R2 — e o número acima diz o quanto.

**A Z-API NÃO guarda histórico de mensagens recebidas. Webhook perdido é dado
perdido, ponto.** Medido em 14/08/2026, com a instância conectada:

```
GET /chat-messages/{phone}?amount=100
{"error":"Does not work in multi device version"}   HTTP 400
```

O WhatsApp multi-device guarda o histórico **no aparelho**, criptografado; o
provedor só repassa em tempo real. Não existe endpoint de replay, `/queue` é a
fila de **saída** (volta `[]`), e não há histórico de webhooks. Consequências
que mudam decisão de projeto:

- **Backfill de mensagem recebida é impossível.** Não gaste tempo procurando o
  endpoint certo — ele não existe. Foi verificado por três caminhos.
- **Por isso o vigia por ausência não é luxo, é a única defesa.** Uma queda de
  ingestão só é reparável enquanto está acontecendo. Em 12–14/08/2026 o webhook
  ficou 44 h devolvendo 401 (a Z-API trocou o nome do header) e o prejuízo virou
  permanente.
- **O que ainda dá para recuperar é a LISTA de quem escreveu**, não o conteúdo:
  `GET /chats` devolve `lastMessageTime` por conversa. Cruzando com o
  `last_message_at` do banco, sai a relação de leads cuja última mensagem o CRM
  nunca recebeu. Foi assim que os 14 leads da queda foram identificados. A
  detecção só falha para quem voltou a escrever depois — nesse caso o
  `lastMessageTime` já é o novo (na queda de agosto, 1 lead).

### ⚠️ PENDÊNCIA DE PRODUTO: existe caminho em que o cliente recebe e o CRM não registra

**Descoberto em 16/09/2026, e ele existe independente de qualquer feature.** É a
mesma família do incidente de 12–14/08 (webhook 401 por 44 h): mensagem real,
cliente afetado, **nenhum erro em lugar nenhum**. A diferença é que aquele foi
ingestão de entrada, e este é de **saída**.

**O mecanismo.** `api/webhooks/zapi` descarta todo evento com
`fromMe=true, fromApi=true`, partindo do princípio de que "foi o CRM que mandou,
então a server action já gravou". Isso é **suposição, não fato**. Medido: duas
mensagens enviadas à Z-API por um script de diagnóstico chegaram no aparelho do
destinatário e **nunca existiram no `messages`** — o webhook as descartou e
nenhuma action as havia gravado. O CRM mostra a conversa sem elas, para sempre.

**Por que importa mesmo sem script nenhum.** Qualquer caminho que fale com a
Z-API sem gravar cai no mesmo buraco: um workflow novo do n8n, uma automação,
uma retentativa que reenvia sem persistir, um teste feito à mão. E o
`sendMessage` com `iaAtiva` já depende do n8n gravar por conta própria (§1) — se
ele falhar **depois** de enviar, o resultado é exatamente este.

**Dois descartes silenciosos, nenhum com log:**

1. `MESSAGE_EVENT_TYPES` aceita só `ReceivedCallback`, `SentCallback` e
   `ReactionCallback`. Qualquer outro `type` sai em
   `{status:"skipped", reason:"non-message event"}`.
2. O bloco que salva exige `!isFromApi`.

**Não há log cru de payload da Z-API** — `webhook_events` é usada só pelo
webhook do Clerk. Então nem dava para saber **o que** se estava perdendo, nem o
formato de eventos que o handler não reconhece.

**Corrigido pela medição (22/09/2026): o descarte nº 1 nunca comeu a edição.**
A edição **não tem `type` próprio** — é um `ReceivedCallback` comum com
`isEdit: true`. Quem a engolia era o descarte nº 2 (`fromApi`) sozinho, para
edições feitas pelo CRM; edição vinda do celular ou do cliente passava pelo
filtro e virava mensagem NOVA. Uma versão anterior deste documento atribuía o
sumiço ao filtro de `MESSAGE_EVENT_TYPES` — era inferência, e estava errada.

### ⚠️ Edição na Z-API: OS NOMES SÃO INVERTIDOS

Medido em 22/09/2026 com `zapi_eventos_descartados` (probe A → edição B):

```
payload.messageId     = id da mensagem ORIGINAL   (a linha a atualizar)
payload.editMessageId = id NOVO, gerado pela edição
```

O `messageId` que o `POST /send-text` devolve na chamada **de edição** é o que
chega no webhook como `editMessageId`. **Quem assumir o contrário atualiza a
linha errada ou nenhuma.** A reconciliação é um UPDATE, não um detector:

```
isEdit === true  →  UPDATE messages SET content = <texto novo>
                    WHERE metadata->>'messageId' = payload.messageId
```

Implementado em `aplicarEdicao` (route.ts), antes de qualquer insert: aplicou →
responde e não repassa ao n8n; não achou a linha → loga com campos nomeados e
segue o fluxo normal. Vale para os três remetentes (cliente, celular, CRM). A
action `editMessage` faz o mesmo UPDATE antes — o webhook repete, idempotente.
Duplicata de verdade (Z-API ignorando `editMessageId`) chegaria como mensagem
**nova**, `isEdit false`, id inédito — distinguível sem heurística. Ver §8.4.

**O conserto tem duas metades, e a primeira não é código de feature:**
persistir o que hoje é descartado (com PII redigida e retenção curta), para
**parar de ser cego**; e depois decidir a reconciliação. A captura serve ao F3,
mas **o buraco existe sem o F3** e não deve ser tratado como sub-etapa dele.

**Primeira metade FEITA (22/09/2026, D1) — e ela tem prazo.** Os dois descartes
agora gravam em `zapi_eventos_descartados` (payload redigido por
`redigirEstrutura` em `lib/log-redact.ts`, TTL de 7 dias via pg_cron). A gravação
é aguardada dentro do caminho quente do webhook e **não filtra `event_type` de
propósito**: filtrar agora poderia excluir justamente o evento de edição, cujo
formato ninguém conhece. Isso significa que todo `DeliveryCallback`/`ReadCallback`
vira linha e paga um insert.

**Isto é uma janela de captura de 48 h, não estado permanente.** Decisão com prazo
(Gabriel, 22/09/2026): ao fim das 48 h ele lê a tabela pelo conector do Supabase
e escolhe entre (a) apertar o filtro de `event_type` para o que interessa e
(b) remover a captura. **Captura no caminho quente da ingestão não pode virar
esquecimento** — quem encontrar este parágrafo depois de 24/09/2026 com a
captura ainda ampla deve tratar como pendência vencida, não como desenho.
Check da redação: `npx tsx scripts/check-log-redact.ts`.

### O canal *festas* está DESATIVADO, não apagado

Encerrado em agosto/2026. **Os dados continuam inteiros no banco** — e são a
maior parte dele:

| | alegrando | festas |
|---|---|---|
| Leads | 313 (42%) | **424 (58%)** |
| Mensagens | 9.006 (37%) | **15.056 (63%)** |

O que foi feito (tudo reversível): a interface perdeu os seletores de canal
(Conversas, Kanban, Dashboard, novo lead) e os selos "🎉 Festas"; as consultas
passaram a exigir cláusula de canal (`lib/canal.ts`, `canalDaConsulta` — **nunca
devolve nulo**, porque era assim que o filtro "Todos" trazia os 424 de volta);
`api/webhooks/evolution` responde "canal desativado" com **200** (erro faria o
provedor entrar em retentativa exponencial); e as variáveis `EVOLUTION_*` saíram
da Vercel — os valores continuam no `.env.local` do Gabriel.

**O caminho de despacho por provedor continua inteiro e sem uso** em
`lib/actions/messages.ts` e `lib/whatsapp/sender.ts`, e os condicionais
`canal === "festas"` de `cliente-detail-panel.tsx` também. É código morto de
propósito: removê-lo é refatoração, e mantê-lo é o que torna a volta barata.

**Para reativar:** devolver `"festas"` aos seletores, `INGESTAO_DESATIVADA =
false` na rota do Evolution, e repor as `EVOLUTION_*`.

#### Fase 2 — apagar de vez (NÃO executada, exige autorização explícita)

Se um dia for para apagar, nesta ordem e nunca antes:

1. **Exportar** as linhas de festas de `messages`, `"Clientes _WhatsApp"`,
   `kanban_columns` e a única de `passeios_historico`, guardado fora do banco.
2. **Mídia no R2 exige checagem cruzada.** 169 leads de festas têm foto e as
   mensagens têm mídia no bucket. **O dedup é por hash de conteúdo**: o mesmo
   objeto pode ser referenciado por mensagens de festas *e* de alegrando. Apagar
   objeto olhando só as mensagens de festas quebra mídia do canal que fica.
3. **Ordem respeitando dependência**: mensagens antes dos leads.
4. Toda cláusula explicitamente restrita a `canal = 'festas'`. Um `DELETE` ou
   `UPDATE` sem ela atinge o negócio que continua operando.

### Cloudflare R2 — o que o código já assume

`src/lib/whatsapp/r2-client.ts` é o único ponto de contato: upload, dedup por
SHA-256 e URL assinada de PUT. Duas propriedades que mudam decisão de projeto:

- **O bucket é público** (`R2_PUBLIC_URL`, um host `pub-….r2.dev`), então a URL
  gravada no banco é servível direto no `<img src>` — não precisa assinar para
  **ler**.
- **⚠️ O bucket é servido pela Public Development URL do R2 (`pub-….r2.dev`) e
  NÃO há domínio customizado.** Essa URL é **rate-limited pela Cloudflare** — é
  feita para desenvolvimento, não para produção, e é exatamente o que o CRM usa
  para servir mídia hoje. **Quando alguém disser que imagem "às vezes não
  carrega", este é o primeiro suspeito**, antes de olhar código, cache ou rede:
  o sintoma é intermitente por desenho, piora com volume, e não aparece em teste
  de um arquivo só. A saída definitiva é pôr um domínio customizado no bucket.
- **A credencial do R2 lê, escreve e apaga — não é write-only.** Medido em
  16/09/2026 pelo próprio `r2-client.ts`: `presignedPutUrl` assina, o `PUT`
  devolve 200, **`objectExistsInR2` devolve `true`** (HeadObject autorizado),
  o `GET` público devolve os bytes idênticos e `deleteFromR2` remove. Uma versão
  anterior deste documento dizia que a credencial "só é comprovadamente usada
  para escrever" e mandava não construir nada em cima de GET assinado. **Isso
  deixou de valer**: o truque de `response-content-disposition` para forçar
  download é viável. O `403` que `objectExistsInR2` trata como esperado é
  defesa histórica, não o comportamento atual.
- **As `R2_*` PRECISAM estar no `.env.local` para desenvolver anexo.** Ficaram
  ausentes por muito tempo (só na Vercel), e nesse estado quem depende do R2
  falha com "não configurado" — que **não é bug de código**. São cinco:
  `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`. Ao diagnosticar, **separe os dois modos de falha**:
  falta de variável dá "não configurado"; chave errada dá
  `SignatureDoesNotMatch`/`InvalidAccessKeyId` no corpo do `PUT`. São problemas
  diferentes e confundi-los faz procurar no lugar errado.
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
8. **Credencial nunca vai para a saída da sessão — nem em diagnóstico.**
   Vale para terminal, log, transcript de sessão e mensagem de erro. Não há
   exceção de "é só pra depurar": a saída de uma sessão é copiada, colada e
   arquivada em lugares que ninguém controla depois.

   O caso que gerou a regra (16/09/2026): um probe de diagnóstico imprimiu o
   corpo cru de `GET /me` da Z-API, e **esse endpoint devolve o `token` da
   instância em claro** junto da configuração de webhook. Ninguém pediu o token,
   ninguém esperava que ele viesse, e o probe só queria dois campos.

   A regra prática que evita isso: **imprima campos nomeados, nunca o corpo
   inteiro.** `console.log(JSON.stringify(resposta))` num endpoint de terceiro
   é um vazamento esperando o endpoint mudar. Vale também para
   `vercel env pull`, `printenv`, `cat .env.local` e `git show` de arquivo de
   configuração — se o objetivo é saber se a variável existe, imprima o
   **nome e o tamanho**, não o valor.

   Corolário de resposta a incidente: **vazou, a decisão de rotacionar é de quem
   opera**, e depende do raio. Um segredo que já vivia na mesma máquina, exposto
   no log dela, não aumentou exposição — e rotacionar o token da Z-API arrasta
   `.env.local`, Vercel e os nós do n8n que a chamam. Reporte o vazamento, diga
   o raio, e deixe a decisão com o operador.

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

- **O interruptor de desligar autenticação de webhook não existe mais.** O
  branch `WEBHOOK_AUTH_DISABLE === "true"` saiu do `webhook-auth.ts`. O risco
  nunca foi o uso legítimo: era alguém achar a variável, supor que é depuração e
  ligá-la — os webhooks passariam a aceitar qualquer chamada, sem nada na tela.
  **Não reintroduza.** Se um dia for mesmo necessário, o caminho é um deploy,
  que é visível e revertível, e não uma variável de ambiente.

#### `/api/email-replies/anexo-url` — segredo dedicado, em duas fases

A rota conferia o bearer contra a própria `SUPABASE_SERVICE_ROLE_KEY`. Funciona,
mas o raio de estrago é péssimo: para pedir uma URL de upload de anexo, o n8n
guarda a chave que lê, escreve e apaga o banco inteiro. Vazou de um log ou de um
histórico de execução, o prêmio é o banco — não um upload.

A migração é **em duas fases de propósito**. Trocar de uma vez abre uma janela
entre o deploy e a atualização do header no n8n em que o anexo de resposta falha
**calado** — a classe de bug mais cara deste projeto, e justamente nesta rota.

- **Fase A:** a rota aceita `ANEXO_URL_SECRET` **ou** a service key. Nada quebra
  enquanto o n8n ainda manda a antiga.
- **O gatilho da Fase B não é palpite.** A rota loga
  `[anexo-url] autenticado por: segredo-dedicado | service-key`. Enquanto
  aparecer `service-key`, o n8n não migrou e cortar quebraria a ingestão.
- **Fase B:** só depois de um teste com anexo real passando (resposta com PDF →
  `email_replies.attachments` com URL do R2 e `attachments_missing` em 0),
  remover a aceitação da service key e tirá-la do n8n.

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
- **Escrita pela API pública zera `availableInMCP`.** Não é bug: a API v1
  rejeita o PUT se `settings` trouxer `availableInMCP` ou `timeSavedMode`
  (`must NOT have additional properties`), então a flag não pode ser reenviada
  e cai a cada escrita. Religue pela UI ao final, senão o workflow some das
  ferramentas MCP e o próximo diagnóstico fica cego.
- **Antes de religar o toggle, FECHE e REABRA a aba do n8n.** A aba guarda o
  workflow como estava quando foi carregada, e salvar o toggle grava **aquele**
  estado inteiro por cima — desfazendo em silêncio o que a API acabou de
  escrever. Já aconteceu: 22 nós viraram 17 de novo, com o `updatedAt` nove
  minutos à frente da escrita e nenhum erro em lugar nenhum. **Conferir por
  contagem de nós não basta** — releia o conteúdo (o código do dedup, o método
  do nó de gravação), porque uma reversão devolve um workflow que funciona,
  só que o antigo.
- Nos Code nodes, **`$input` é a saída do nó imediatamente anterior** — não
  necessariamente o nó cujo dado você quer. Referencie explicitamente
  (`$('Nome do nó')`) e pareie por **linhagem** (`itemMatching()`), não por
  índice. Pareamento posicional já causou dois bugs.

### Quanto tempo uma resposta demora a aparecer — medido, não estimado

Da hora do Gmail (`received_at`) até a linha existir no banco (`created_at`):
**19 a 31 segundos**. Um "~2 s" que já circulou media outra coisa — a chegada do
push e o disparo da execução, não a gravação — e é um número que faz parar de
investigar cedo demais.

Decomposição do caso `19ffe04bf16a0d16` (2 anexos, 3,3 MB, 31,5 s no total),
execução `90179` do worker `NOAIuHJmIUh6Fdne`, modo **webhook** — foi o push que
gravou, não o schedule:

| trecho | tempo |
|---|---|
| Gmail → o push chegar no n8n | **20,6 s** |
| execução do worker | 11,0 s |

Dentro da execução, os 15 nós: `Preparar arquivo` **6,54 s**, `Subir no R2`
1,37 s, `Pedir URL no CRM` 1,11 s, `Baixar anexo` 0,92 s, e os outros onze
somados 1,03 s — `Listar recebidos` 306 ms, `Buscar mensagem` 300 ms **mesmo com
3,3 MB**, `Envios e respostas conhecidas` 70 ms para 6 itens, `Gravar resposta`
61 ms.

**A soma dos nós fecha com a duração total com 17 ms de diferença.** Isso
descarta com aritmética, e não com opinião: fila da instância, `retryOnFail` com
espera, e qualquer bloco de tempo escondido fora dos nós.

Duas consequências para quem for otimizar: **dois terços do atraso acontecem
antes do n8n** (a entrega do Pub/Sub do Gmail), e o maior nó é um Code node
convertendo base64 — não uma chamada de rede.

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
   **Corolário medido em 16/09/2026: comparar `messageId` NÃO detecta
   duplicata de edição na Z-API — daria falso positivo em TODA edição bem
   sucedida.** No protocolo do WhatsApp a edição **não reescreve** a mensagem
   original: ela viaja como mensagem própria (`protocolMessage` /
   `MESSAGE_EDIT`) carregando a chave da original como referência, e **é o
   aparelho que colapsa as duas na tela**. Medido: `POST /send-text` normal
   devolveu `39F8D7DAFEED5EAECA69`; o mesmo endpoint com `editMessageId`
   devolveu `3EB0DCA3EC4EE21A9C1EC2` — id diferente, formatos diferentes, e no
   aparelho **uma única mensagem**, com o selo "Editada".

   A lição geral, que vale além da Z-API: **id de resposta diferente não prova
   que houve duplicação.** Antes de construir detector em cima de comparação de
   identificador, confirme no destino real o que aconteceu — aqui, o aparelho.
   Um detector desses teria acusado erro em 100% dos casos de sucesso e levado
   a "consertar" o que funcionava.
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
8. **Zero silencioso: filtrar por um valor que não existe.** `sender_type = 'user'`
   não falha, devolve `[]` — e uma lista vazia é lida como "a feature não
   existe", não como "meu filtro está errado". É o §8.2 sem troca de cliente: a
   consulta certa, no banco certo, com um **valor** inventado. Antes de concluir
   qualquer coisa de um resultado vazio, liste os valores distintos da coluna. Um
   `select distinct` de dois segundos evita uma conclusão errada que vira
   decisão de produto.

   **A mesma armadilha sem filtro nenhum: o request chegou como `anon`.** Em
   dev, os leads aparecem e as mensagens **não** — sem erro, sem log, sem nada
   na tela. Medido em 16/09/2026 na consulta exata de `useLeadMessages.ts:259`:
   com a chave `anon`, **0 linhas e `erro: nenhum`**; com a service key, **18**.
   A conversa tinha 18 mensagens e a tela dizia "Nenhuma mensagem ainda".

   A causa **não é** RLS, nem consulta, nem banco errado: é o **emissor do
   Clerk**. O `.env.local` usa a instância de desenvolvimento (`pk_test_`,
   `equipped-lark-92.clerk.accounts.dev`) e o Third-Party Auth do Supabase só
   confiava na de produção (`clerk.alegrando.cloud`). Token recusado → o browser
   cai para `anon` → a policy nega → lista vazia. Os leads seguem aparecendo
   porque vêm de server action, que usa service key e não passa por RLS.
   **Esse contraste — leads sim, mensagens não — é a assinatura do problema**:
   quando ele aparecer, confira o emissor antes de qualquer outra coisa.
   **São DOIS passos, com o mesmo sintoma e causas diferentes — e o segundo é
   invisível para quem para no primeiro.** Medido em 16/09/2026 nos `edge_logs`:

   1. **401 → 200.** Faltava a integração Clerk de dev no Third-Party Auth do
      Supabase. Último 401 às 08:03:32; primeiro 200 às 08:06:51, referer
      `http://localhost:3000/`. Acrescentar a instância de dev resolve **este**.
   2. **200 com zero linhas e nenhum erro.** Faltava a claim
      `"role": "authenticated"` no session token do Clerk de dev. Sem ela o
      PostgREST trata a requisição como `anon`, a policy `realtime_messages`
      (role `authenticated`) não se aplica, e a resposta é **200 vazio**.
      Corrigido no painel do Clerk, personalizando o token da sessão.

   O passo 1 muda o **código de status**; o passo 2 não muda nada que se veja
   sem olhar o corpo. Quem comemora o 200 para exatamente antes do problema que
   restava. **Ao depurar isto, o critério de sucesso é a contagem de linhas, nunca
   o status.**

   **Isto já estava escrito em `src/lib/supabase/client.ts:20-31`**, com todas as
   letras, inclusive a frase "não é banco errado nem credencial errada de
   Supabase: é o emissor do Clerk". Uma sessão inteira foi gasta medindo o banco
   antes de alguém abrir o arquivo. O comentário certo existia; faltou lê-lo.
   Ao investigar qualquer coisa de Supabase no browser, **leia `client.ts`
   primeiro** — são trinta segundos contra horas.

   **E o que isso revela sobre a segurança de `messages`:** a policy é
   `realtime_messages`, role `authenticated`, **`qual: true`** — ela não filtra
   nada. O banco devolve as **12.143** mensagens do canal alegrando para
   qualquer requisição que chegue como `authenticated`. A fronteira inteira da
   tabela é o Clerk, não o Postgres. Consequência direta: **cada emissor
   acrescentado ao Third-Party Auth dá acesso a todas as mensagens**. Somar um
   emissor é decisão de segurança, não conveniência de ambiente — e a instância
   de dev, cujo cadastro é mais frouxo que o de produção, passa a ser uma porta
   com a mesma chave. Ver também §2.2.
9. **Filtro server-side e client-side na mesma barra.** Em Conversas, `search`,
   `canal` e `labelIds` vão à RPC (paginados, com
   `total_count` correto); `grupos`, `IA ativa/manual` e a ordenação são
   aplicados em `sortedLeads` sobre o que **já foi carregado** (50 por página).
   Então "Grupos" mostra os grupos das páginas carregadas, não os 5 do banco, e
   "A-Z" ordena a fatia, não o conjunto. Ao acrescentar filtro, escolha o lado
   consciente e **diga qual é a semântica** — misturar os dois sem avisar produz
   uma tela que parece filtrar e não filtra.

   **A barra de listas ESTÁ em produção desde 14/08/2026**, e são **três**
   pílulas, não quatro: **Não lidas · Favoritos · E-mails**. "Todas" saiu em
   `10292f7` — não era filtro, era a *ausência* de filtro, e gastava um quarto
   da barra para dizer "nada selecionado"; voltar para todas é clicar de novo
   na pílula já ligada. Subiu no merge `9ca4325`, com `7f4d41f`, `e0474a9` e
   `10292f7` por cima. A migration que acrescenta `p_aba` e as contagens à RPC
   **foi aplicada e conferida** (`migration_conversas_abas.sql`), e o branch
   `feat/conversas-abas` é **histórico, não pendência**. A linha antiga daqui
   dizia que a barra esperava a migration: é o anti-padrão nº7 de novo, dentro
   do próprio documento.

   **"E-mails" é resposta RECEBIDA e ainda NÃO LIDA** — não "já trocou e-mail
   alguma vez". O critério antigo (`tem_email` da RPC) prendia na aba um lead a
   quem **nós** escrevemos, que na tela lia como "chegou e-mail deste lead", e
   era falso. A contagem vem de `naoLidasPorLead()`, não da RPC: a RPC não
   conhece `email_replies.read_at`.

   **As contagens descrevem a BASE (canal + busca + tags), não a aba.** Elas
   viajam nas linhas por window function, então uma aba sem resultado não
   devolve linha e zerava as quatro — daí a rechamada com `p_aba => 'todas'` e
   limite 1 (`7f4d41f`). Pelo mesmo motivo a barra **não pode esconder os selos
   enquanto `loading` estiver ligado**: trocar de aba não invalida número
   nenhum, e esconder produzia um pisca a cada clique.

   **Dívida aceita conscientemente, com gatilho.** Combinar uma aba com
   Grupos/IA filtra só dentro da página carregada, então pode mostrar menos do
   que existe. Hoje quase não morde: 57 não lidas cabem em duas páginas, e os 5
   grupos são conversas ativas que ficam no topo da primeira. **Hora de mover
   Grupos/IA/ordenação para o servidor:** quando as não lidas passarem de ~100,
   **ou** quando alguém relatar conversa que "sumiu" ao combinar filtros. É
   rodada própria — a ordenação continuaria torta mesmo consertando só os
   filtros, então o conserto completo não cabe de carona em outra tarefa.
10. **Handler assíncrono de efeito sem guard de instância.** Efeito que cria
    `objectURL`, põe num `<img>` e revoga no cleanup dispara `onerror` da
    **instância antiga** sob StrictMode: em dev o React roda efeito → cleanup →
    efeito de novo, o cleanup do primeiro revoga a URL antes do `<img>` carregar,
    e o Chromium responde `ERR_FILE_NOT_FOUND`. Se o `onerror` escreve estado de
    erro, a tela mostra erro **com a imagem válida já carregada** pelo segundo
    `<img>`. Foi o "Não deu para abrir esta imagem" do editor
    (`image-editor.tsx`, 18/09/2026) — JPEG e PNG válidos, toda vez, só em dev.

    Regra: **guard de instância (`let vivo = true` … `return () => { vivo =
    false }`) em TODO handler assíncrono de efeito** — `onload`, `onerror`,
    `.then`, callback de `fetch`, timer. Cada um checa `vivo` antes de escrever
    estado. Vale além do editor: qualquer efeito com callback que sobrevive ao
    cleanup tem esse buraco, e StrictMode é só quem o expõe primeiro.

    **NÃO desligue o StrictMode** (`reactStrictMode: false` no `next.config.ts`).
    O double-invoke é dev-only e existe **para** expor cleanup mal feito — em
    produção o mesmo callback órfão dispara quando o usuário fecha o editor no
    meio do carregamento, sem StrictMode nenhum. Desligar troca um sintoma
    visível por uma classe de bug silenciosa. O `next.config.ts` não define a
    opção de propósito: App Router liga por padrão
    (`__NEXT_STRICT_MODE_APP`), e é assim que deve ficar.

    Corolário de diagnóstico: mensagem de erro de imagem diz o **tipo real pelos
    bytes** (`lerBytesMagicos`), não só o `file.type` — HEIC de iPhone chega
    como `.jpg` e não decodifica em canvas na maioria dos navegadores; o texto
    genérico não distingue isso de URL revogada nem de CORS.

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
- [ ] Se depende de migration, apliquei **antes** do push — `git push origin
      main` publica sozinho (§1). A linha antiga daqui dizia "commitar não
      publica" e sobreviveu à correção do §1; é o anti-padrão nº7 acontecendo
      dentro do próprio documento.
- [ ] **Sessão longa: rodei `/handoff` como último passo.** A skill é
      invocada **pelo usuário** (`disable-model-invocation: true` no arquivo de
      origem, que é de terceiro e não editamos), então ela não dispara
      sozinha: se ninguém digitar, o contexto da rodada morre com a sessão e a
      próxima começa do zero. Mora em `~/.claude/skills/handoff` (nível de
      usuário, fora deste repositório) e escreve o documento no temp do SO,
      nunca no working tree.
