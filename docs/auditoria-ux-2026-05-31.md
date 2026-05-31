# Auditoria de UX/UI, Responsividade e Funcionalidade — 2026-05-31

> Método: build de produção (`next build`), ESLint (escopo `src/`), probes HTTP em
> todas as rotas no dev server, e auditoria estática de código contra os componentes
> reais. Os fluxos que disparam ações externas (Z-API/WhatsApp) **não** foram
> exercitados de ponta a ponta para não enviar mensagens reais.

## Resumo executivo

| Área | Status |
|------|--------|
| Build / TypeScript | ✅ Verde (compila + tipos OK) |
| Rotas (HTTP) | ✅ Todas 200 |
| Responsividade | ✅ com 1 ❌ corrigido (header do Kanban no mobile) |
| Dark mode / FOUC | ✅ (1 edge case ⚠️) |
| Acessibilidade (Esc/teclado) | ✅ majoritário (1 ⚠️ combobox da agenda) |
| Console / React warnings | ⚠️ 6 erros + 16 warnings de lint (não quebram build) |

---

## 1. Smoke test de runtime

- ✅ `next build`: **compila com sucesso** (~21s) e **TypeScript limpo**. Nenhum erro.
- ✅ Todas as rotas responderam **HTTP 200** no dev server:
  `/`, `/dashboard`, `/conversas`, `/agenda`, `/kanban`, `/tarefas`,
  `/configuracoes`, `/leads` (redireciona p/ conversas), `/transportadores`, `/sign-in`.
- ⚠️ **ESLint**: 6 erros + 16 warnings em `src/` — **nenhum quebra o build**
  (Next 16 não roda ESLint no build por padrão, e não há `eslint` no pipeline de CI
  obrigatório). Detalhe na seção 4.

---

## 2. Responsividade (mobile 375 / tablet 768 / desktop 1440)

Auditado por código (classes Tailwind / breakpoints):

- ✅ **Sidebar**: rail fixo de 64px; expande no hover (desktop) e via botão toggle
  (mobile, overlay `w-[200px]` sem empurrar conteúdo). Fecha ao navegar no mobile.
- ✅ **Conversas**: layout de 3 painéis com swap mobile (`mobileView` list↔chat) e
  painel de detalhes em `Sheet`. Sem quebra.
- ✅ **Dashboard**: KPIs `grid-cols-1 sm:grid-cols-2 xl:grid-cols-3`, gráficos
  `grid-cols-1 lg:grid-cols-2` — empilham em coluna no mobile.
- ✅ **Kanban (board)**: colunas `w-[300px]` com `overflow-x-auto` — scroll horizontal
  no mobile sem quebra.
- ✅ **Passeios**: header `flex-col sm:flex-row`, grid de cards
  `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`, filtros de categoria `overflow-x-auto`,
  modal `max-w-lg max-h-[90vh] overflow-y-auto` dentro de `p-4` — cabe no mobile.
- ✅ **Modais** (Novo Lead `max-w-md p-6`, Novo Passeio, Evento da Agenda): todos
  cabem em 375px com padding externo.
- ❌→✅ **CORRIGIDO — Header do Kanban estourava no mobile**: o cabeçalho era
  `flex items-center justify-between` com um card de título `min-w-[320px]` + toolbar
  numa única linha sem wrap → em 375px (≈327px úteis) o título sozinho já ocupava a
  largura e a toolbar transbordava horizontalmente.
  **Fix** ([kanban/page.tsx](../src/app/(app)/kanban/page.tsx)): cabeçalho agora
  `flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between` e o card de
  título `w-full sm:w-fit sm:min-w-[320px]` (empilha no mobile, toolbar abaixo).

---

## 3. Funcionalidade (auditoria de código)

**Conversas** — optimistic update de texto e vídeo presentes; envio de imagem/doc via
Realtime; guard contra duplo-clique no envio de arquivos; reply/react/pin implementados;
troca de canal (alegrando/festas) com cache SWR; busca e filtro por labels/IA presentes.
Sem `❌` aparentes na lógica. (Não exercitado contra Z-API real.)

**Agenda** — combobox de cliente com busca, fecha ao clicar fora, dropdown com
`max-h-48 overflow-y-auto overscroll-contain` (scroll por trackpad OK); lista só clientes
do canal `alegrando` (`CANAL_AGENDA`); calendário FullCalendar com tema claro/escuro
unificado e `fc-event-title` com ellipsis. ⚠️ combobox **não fecha com Esc** (só
click-outside) — ver seção 5.

**Passeios** — listagem com busca, filtro por categoria, grid responsivo, modal de
criar/editar, criação de categoria. Sem `❌` na estrutura.

**Kanban / Tarefas / Dashboard** — drag-and-drop via @dnd-kit (sensor com
`activationConstraint.distance: 8`), reorder de colunas e cards com persistência;
dashboard carrega stats/eventos/follow-ups em `Promise.all` com loading states.

---

## 4. Console / React warnings (ESLint)

Nada quebra o build, mas a meta de "zero warnings de React" não está atendida.
Todos vêm do conjunto **mais estrito do `react-hooks` plugin** que veio com
`eslint-config-next@16`. Recomendação: tratar como dívida técnica, corrigir com calma
(refatorar os efeitos) — **não** force-fix em lote, pois são efeitos que funcionam e
mexer às pressas arrisca regressão.

**6 erros:**
1. `reaction-picker.tsx:30` — `set-state-in-effect` (`setPos` em `useLayoutEffect`).
2. `dashboard/charts.tsx:53` — `set-state-in-effect` (`setLoading(true)` no efeito de fetch).
3. `hooks/useTheme.ts:23` — `set-state-in-effect` (`setIsMounted(true)` — guard de hidratação, padrão correto).
4. `chat-window.tsx:758` — `immutability` (`lastDateKey` reatribuído durante o render no `messages.map`; funciona, mas é anti-padrão — ideal: `useMemo` pré-computando separadores de data).
5. `cliente-detail-panel.tsx:255` — `set-state-in-effect` (`setParticipants([])`).
6. `message-context-menu.tsx:68` — `set-state-in-effect` (`setMenuPos`).

**16 warnings** (amostra): vários `<img>` em vez de `next/image`
(attachment-preview, chat-window, novo-lead-modal — intencional p/ blobs/URLs externas);
variáveis não usadas (`createCliente`, `statusStyles`, `editing`, `sortedTasks`,
`allTasksDone`, `onRemove`, `startSendingMessage`); deps de `useEffect`
(`loadData` no kanban — com `eslint-disable` intencional).

> Não consegui validar o console do navegador em runtime (sem browser automatizado e
> app gated por Clerk). A lista acima é a melhor aproximação estática de "React warnings".

---

## 5. UX — qualidade

- ✅ **Loading states**: spinners/skeletons em conversas (lista + skeleton de filtro),
  kanban, dashboard, charts (lazy), envio de áudio/arquivo/mensagem.
- ⚠️ **Toasts inconsistentes**: coexistem (a) `<Toaster>` global do **sonner** no root
  layout e (b) toasts inline custom (divs) em conversas e kanban. Funciona, mas são
  dois sistemas visuais. **Decisão**: padronizar tudo em `sonner`?
- ✅ **Dark mode**: amplo uso de `dark:` + variáveis CSS + FullCalendar tematizado.
- ✅ **FOUC**: script inline no `<html>` lê `localStorage('crm-theme')` antes da pintura.
  ⚠️ **edge case**: o tema "fonte da verdade" é a coluna `users.theme` no Supabase, mas
  o script inline só conhece o `localStorage`. No **primeiro acesso em um dispositivo
  novo** com tema do banco = dark, pode haver 1 flash claro→escuro até o `useTheme`
  hidratar. Mitigação possível: persistir preferência num cookie lido no server.
- ✅ **Esc/teclado**: dropdown de ordenação (conversas), busca do kanban, menu de
  contexto e Dialogs (Radix) fecham com Esc. ⚠️ **combobox da agenda** fecha só por
  click-outside, **sem Esc** — melhoria de a11y sugerida (baixo risco).
- ✅ **Scroll**: `overscroll-contain` no combobox; listas com `overflow-y-auto`.

---

## Itens ❌ corrigidos (com commit)

1. **Header do Kanban estourava horizontalmente no mobile** → empilha agora. ✅

## Itens ⚠️ para decisão (não corrigidos)

1. ESLint: 6 erros + 16 warnings de `react-hooks`/`next` (não quebram build).
2. Toasts: dois sistemas (sonner global + inline custom) — padronizar?
3. FOUC: edge case de 1º acesso em device novo quando tema vem do banco.
4. Combobox da agenda sem fechar no Esc.
5. Vários `<img>` em vez de `next/image` (provavelmente intencional p/ blobs/URLs WhatsApp).

## Não verificado (limitação do ambiente)

- Console do navegador em runtime / hydration warnings reais.
- Fluxos que disparam Z-API (enviar imagem/vídeo/doc, apagar "para todos") ponta a ponta.
- Screenshots nos 3 viewports via Playwright — requer credenciais de teste do Clerk.
