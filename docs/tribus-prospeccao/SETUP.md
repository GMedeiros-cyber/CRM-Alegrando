# Tribus Labs — Prospecção no n8n (setup)

Dois fluxos já foram **criados via MCP** no n8n (`https://n8n.alegrando.cloud`), ambos **inativos**.
Falta só você plugar as credenciais, preencher o nó **Config** e ligar o webhook. Nada precisa ser
feito no Supabase (as tabelas `leads` / `atendimentos` já existem no projeto `vsqsqybkjzwsggammmts`).

| Fluxo | Nome no n8n | ID |
|---|---|---|
| 1 — Disparo diário | `Tribus \| Prospecção Diária` | `uPt6vY1o0Wz2vwzm` |
| 2 — Qualificação | `Tribus \| Qualificação de Respostas` | `cYbvOegktZrhYBZ6` |

---

## 1. Credenciais no n8n

> n8n → **Credentials** → **Add credential**

### a) Supabase (✅ já feito — credencial **"Prospecção"**)
- Você já criou e atribuiu uma credencial Supabase chamada **"Prospecção"** (`id wnYZlDxjsJ2R5Gbc`) nos nós Supabase da Prospecção Diária.
- Ela deve apontar para o projeto Tribus: host `https://vsqsqybkjzwsggammmts.supabase.co` + a `service_role` key.
- ✅ Essa mesma credencial já está atribuída também nos nós Supabase do fluxo de **Qualificação**.

### b) Evolution apikey  (✅ já criado e atribuído)
- Header Auth `apikey` criado (`id WArjsx2m7NUpKAXD`) e ligado nos nós `Enviar WhatsApp` e `Notificar Gabriel`.
- URL `https://evo.alegrando.cloud` e instância `Tribus` já preenchidas no Config dos dois fluxos.

### c) OpenAI (✅ já ligado — sem Anthropic)
- Os 2 nós de IA agora são **AI Agent** + **OpenAI Chat Model** (`gpt-4.1-mini`), já apontando para sua credencial OpenAI existente (`id FBdKdEEgRERxhJ38`).
- **Não precisa de Anthropic.** Se quiser outra conta OpenAI, troque no sub-nó `OpenAI Chat Model`.

---

## 2. Associar as credenciais aos nós

Abra cada fluxo e selecione a credencial no dropdown de cada nó (ficam marcados como "Select credential"):

**Fluxo 1 — Prospecção Diária**
- Supabase (`Contar Enviadas Hoje`, `Buscar Leads`, `Atualizar Lead`, `Registrar Atendimento`) → **Prospecção** ✅ já feito
- `Gerar Mensagem` (AI Agent) → sub-nó **OpenAI Chat Model** ✅ já ligado
- `Enviar WhatsApp` → **Evolution apikey** ✅ já ligado

**Fluxo 2 — Qualificação**
- Supabase (`Buscar Lead`, `Buscar Histórico`, `Registrar Atendimento`, `Atualizar Status`) → **Prospecção** ✅ já feito
- `Classificar` (AI Agent) → sub-nó **OpenAI Chat Model** ✅ já ligado
- `Notificar Gabriel` → **Evolution apikey** ✅ já ligado

---

## 3. Preencher o nó **Config** (em cada fluxo)

O fluxo não usa `$vars`; a configuração fica num nó **Config** (Set) no início. Edite os valores:

**Fluxo 1 → Config** (✅ preenchido)
- `EVOLUTION_URL` = `https://evo.alegrando.cloud`
- `EVOLUTION_INSTANCE` = `Tribus`
- `LIMITE_DIARIO` = `30`

**Fluxo 2 → Config**
- `EVOLUTION_URL` = `https://evo.alegrando.cloud` ✅
- `EVOLUTION_INSTANCE` = `Tribus` ✅
- `NOTIF_TELEFONE` = ⬅️ **falta:** seu WhatsApp p/ receber alertas de lead quente (ex.: `5511999998888`)

> O envio monta `POST {EVOLUTION_URL}/message/sendText/{EVOLUTION_INSTANCE}` com body `{ number, text }`.

---

## 4. Configurar o webhook da Evolution → n8n

No Fluxo 2 o gatilho é o nó **Webhook Resposta** (path `tribus-resposta`).

- **URL de produção:** `https://n8n.alegrando.cloud/webhook/tribus-resposta`
- **URL de teste:** `https://n8n.alegrando.cloud/webhook-test/tribus-resposta` (só funciona com o fluxo aberto em "Listen for test event")

Aponte o webhook da sua instância Evolution (evento **`messages.upsert`**) para a URL de produção.
Geralmente via `POST {EVOLUTION_URL}/webhook/set/{INSTANCE}`:
```json
{
  "webhook": {
    "enabled": true,
    "url": "https://n8n.alegrando.cloud/webhook/tribus-resposta",
    "events": ["MESSAGES_UPSERT"]
  }
}
```
O nó `Extrair Resposta` já trata o payload da Evolution: ignora `fromMe`, extrai o telefone de
`data.key.remoteJid` (remove `@s.whatsapp.net`) e o texto de `conversation`/`extendedTextMessage.text`.

---

## 5. Teste inicial com 1 lead

1. Insira 1 lead na tabela `leads` (projeto `vsqsqybkjzwsggammmts`) com `status = 'pendente'`,
   um `telefone` válido (formato `5511999998888`) e `nome`/`empresa`/`nicho`/`cidade` preenchidos.
2. Abra o **Fluxo 1** e clique **Execute Workflow** (não precisa ativar ainda).
   - ✅ Você deve receber o WhatsApp gerado pela IA.
   - ✅ O lead vira `status = 'enviado'` e ganha `mensagem_enviada` / `enviado_em`.
   - ✅ Surge 1 registro em `atendimentos` com `direcao = 'saida'`, `classificacao = 'abertura'`.
3. **Responda** pelo WhatsApp do lead → o **Fluxo 2** dispara pelo webhook.
   - ✅ Novo `atendimentos` com `direcao = 'entrada'` + `classificacao`/`confianca_ia`/`notas_ia`.
   - ✅ `leads.status` atualizado conforme a classificação.
   - ✅ Se `interesse_alto` ou `pediu_reuniao`, você recebe a notificação no `NOTIF_TELEFONE`.
4. Deu tudo certo → **ative** os dois fluxos (toggle "Active").

---

## Notas
- **Modelo IA:** OpenAI `gpt-4.1-mini` via **AI Agent** + **OpenAI Chat Model** (sua credencial OpenAI existente). Trocado de Claude→OpenAI porque você tem créditos na OpenAI. Na qualificação, um **Structured Output Parser** garante o JSON de classificação.
- **Limite diário:** o Fluxo 1 conta os `atendimentos` com `direcao='saida'` do dia e só envia o saldo
  restante. Como o disparo é 1×/dia às 09:00 (timezone America/Sao_Paulo), na prática o teto é `LIMITE_DIARIO`.
- **Delay humano:** `Wait 3-8min` espera entre 180 e 480 s aleatórios a cada envio.
- **Mapa de status (Fluxo 2):** interesse_alto/pediu_reuniao → `interesse`; recusa → `sem_interesse`;
  objeções/curiosidade/sem_classificacao → `respondeu`.
- Para versionar: dá pra exportar o JSON de cada fluxo pelo menu do n8n (⋯ → Download) ou via MCP
  (`n8n_get_workflow`), usando os IDs da tabela acima.
