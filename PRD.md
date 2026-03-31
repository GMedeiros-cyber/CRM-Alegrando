# PRD - Alegrando CRM

## 1. VISÃO DO PRODUTO

O Alegrando CRM é uma plataforma de gestão comercial desenvolvida sob medida para a **Alegrando Eventos**, empresa com mais de 17 anos de mercado em turismo pedagógico e excursões escolares. O sistema centraliza a jornada do lead — desde a captação automatizada via WhatsApp (orquestrada pelo n8n) até a conclusão do agendamento — oferecendo à equipe uma interface visual rápida com Kanban de vendas, chat ativo integrado ao WhatsApp e controle de transbordo humano/IA.

## 2. OBJETIVOS DE NEGÓCIO

- Centralizar toda a operação comercial em uma única plataforma, eliminando planilhas e processos fragmentados.
- Aumentar a taxa de conversão de leads através de visibilidade em tempo real do funil de vendas e follow-up ágil.
- Garantir zero conflito entre atendimento automatizado (IA/n8n) e atendimento humano com o sistema de transbordo (Pausar IA).
- Reduzir o tempo médio de resposta ao lead, mantendo o histórico completo de conversas acessível no CRM.

## 3. PERSONAS

### Silvana (Gestora Comercial)
- Responsável por supervisionar o desempenho geral da equipe no funil de vendas.
- Precisa de métricas e visão macro do pipeline (Dashboard).
- Necessidade principal: enxergar gargalos no Kanban e intervir rapidamente em leads quentes.

### Jéssica / Márcia (Consultoras de Vendas)
- Responsáveis pelo contato direto com escolas e fechamento de excursões.
- Trabalham diretamente no Kanban arrastando cards e conversando via chat integrado.
- Necessidade principal: interface ágil para gerenciar múltiplos leads simultaneamente, enviar mensagens pelo WhatsApp e pausar a IA quando necessário.

### Aniversário (Setor de Eventos Especiais)
- Responsável por leads de festas de aniversário e eventos temáticos oferecidos pela Alegrando.
- Necessidade principal: visualizar apenas leads relevantes ao seu setor usando filtros e tags.

## 4. FUNCIONALIDADES CORE

### 4.1 Autenticação (Clerk)
- Login com e-mail/senha para os 4 usuários da equipe (Silvana, Jéssica, Márcia, Aniversário).
- Single-tenant: todos compartilham a mesma base de dados e o mesmo Kanban.
- Clerk gerencia apenas autenticação e sessão; não há controle de roles/permissões (todas são Admin).
- Proteção de rotas via middleware do Clerk.

### 4.2 Dashboard
**Descrição:**
Tela inicial com métricas gerais do funil de vendas e desempenho operacional.

**Requisitos:**
- Total de leads por temperatura (Frio, Morno, Quente).
- Total de leads por coluna do Kanban.
- Agendamentos da semana (próximos 7 dias).
- Leads criados no mês atual vs. mês anterior.
- Gráfico de funil ou barras para visualização rápida.

**Fluxo do usuário:**
1. Usuário faz login e é direcionado ao Dashboard.
2. Visualiza os cards de métricas e gráficos atualizados em tempo real (via Supabase Realtime ou refetch).
3. Pode clicar em uma métrica para navegar à seção correspondente (ex: clicar em "Leads Quentes" abre a aba Leads com filtro aplicado).

### 4.3 Kanban Personalizável
**Descrição:**
Quadro visual de vendas onde a equipe organiza leads em colunas que representam estágios do funil. As colunas são totalmente customizáveis.

**Requisitos:**
- Colunas padrão iniciais: "Novos Leads", "Em Contato", "Proposta Enviada", "Negociando", "Concluído".
- A equipe pode criar, renomear, reordenar e excluir colunas livremente.
- Cards de lead exibem: Nome da Escola, Temperatura (badge colorido), Data do Evento, Tags.
- Drag-and-drop para mover cards entre colunas (movimento 100% manual).
- Ao clicar em um card, abre o **Modal de Detalhes do Lead**.

**Fluxo do usuário:**
1. Equipe acessa o Kanban e visualiza todos os leads distribuídos nas colunas.
2. Arrasta um card de "Novos Leads" para "Em Contato" após o primeiro contato.
3. Clica no card para abrir o modal com dados e chat.
4. Move progressivamente até "Concluído".

### 4.4 Lista de Leads
**Descrição:**
Visualização alternativa dos leads em formato de tabela/lista com filtros avançados.

**Requisitos:**
- Tabela com colunas: Nome da Escola, Temperatura, Data do Evento, Destino, Coluna do Kanban, Tags, Criado em.
- Filtros por: Temperatura, Coluna do Kanban, Tags, Intervalo de datas.
- Busca textual por nome da escola ou destino.
- Ordenação por qualquer coluna.
- Ao clicar em uma linha, abre o mesmo Modal de Detalhes do Lead.

**Fluxo do usuário:**
1. Equipe navega à seção "Leads".
2. Aplica filtros (ex: "Temperatura = Quente" + "Tag = Formatura").
3. Visualiza os resultados filtrados na tabela.
4. Clica em um lead para abrir o modal completo.

### 4.5 Modal de Detalhes do Lead (com Chat Ativo)
**Descrição:**
Modal dividido em duas partes que aparece ao clicar em um card/lead. Lado esquerdo com formulário de dados, lado direito com chat integrado ao WhatsApp.

**Requisitos do Formulário:**
- Campos: Nome da Escola, Data do Evento, Destino, Quantidade de Alunos, Pacote Escolhido, Transportadora (dropdown alimentado pela tabela `transportadores`), Temperatura (seletor), Tags (multi-select).
- Campos preenchidos automaticamente pelo Supabase (vindos do n8n). Transportadora é preenchida manualmente.
- Botão "Salvar" para persistir alterações.

**Requisitos do Chat:**
- Exibe o histórico de mensagens do lead (lido do Supabase).
- Campo de input para a equipe digitar e enviar mensagens.
- Ao enviar, o CRM faz um POST para um webhook do n8n, que executa o envio via WhatsApp.
- As mensagens enviadas pela equipe aparecem no histórico com identificação de remetente.

**⚠️ Transbordo (Pausar IA):**
- Botão/toggle visível no topo do chat: "Pausar IA" / "Assumir Atendimento".
- Ao ativar, atualiza o campo `ai_paused` (boolean) do lead no Supabase.
- O n8n consulta essa flag antes de responder automaticamente; se `true`, não responde.
- Indicador visual claro de que a IA está pausada (badge, cor, ícone).
- A equipe pode reativar a IA a qualquer momento clicando no toggle.

**Fluxo do usuário:**
1. Equipe clica em um card no Kanban ou linha na lista.
2. Modal abre com dados do lead à esquerda e chat à direita.
3. Se necessário, ativa "Pausar IA" para assumir a conversa.
4. Digita e envia mensagem pelo input do chat.
5. Atualiza campos do formulário conforme o planejamento avança.
6. Salva alterações e fecha o modal.

### 4.6 Agenda
**Descrição:**
Calendário visual que exibe agendamentos de excursões, alimentado diretamente pelo banco de dados.

**Requisitos:**
- Visualização mensal, semanal e diária.
- Cada evento exibe: Nome da Escola, Destino, Quantidade de Alunos.
- Cores diferenciadas por status ou tipo de evento.
- Ao clicar em um evento, abre o Modal de Detalhes do Lead correspondente.
- Dados são derivados da tabela `agendamentos` vinculada a `leads`.

**Fluxo do usuário:**
1. Equipe navega à Agenda.
2. Visualiza o mês atual com excursões agendadas.
3. Clica em um evento para ver detalhes completos do lead.

### 4.7 Transportadores
**Descrição:**
Diretório para gerenciar empresas parceiras de transporte.

**Requisitos:**
- CRUD completo: Criar, Listar, Editar e Excluir transportadores.
- Campos: Nome da Empresa, Contato (telefone), E-mail, Observações.
- A lista de transportadores alimenta o dropdown do campo "Transportadora" no modal do lead.
- Busca por nome.

**Fluxo do usuário:**
1. Equipe acessa "Transportadores".
2. Cadastra uma nova empresa de transporte com os dados.
3. A transportadora fica disponível para seleção nos leads.

### 4.8 Sistema de Tags (Etiquetas)
**Descrição:**
Etiquetas customizáveis para categorizar e organizar leads.

**Requisitos:**
- CRUD de tags: criar, editar e excluir etiquetas.
- Cada tag tem: nome e cor.
- Um lead pode ter múltiplas tags (relação N:N via `lead_tags`).
- Tags exibidas como badges coloridos nos cards do Kanban e na lista de leads.
- Filtro por tags nas telas de Kanban e Lista.

## 5. REQUISITOS NÃO-FUNCIONAIS

- **Performance:** Kanban com drag-and-drop deve ter latência < 200ms. Dashboard deve carregar em < 2s.
- **Segurança:** RLS em todas as tabelas do Supabase. Autenticação obrigatória em todas as rotas exceto `/`. Validação com Zod em todos os formulários. Variáveis de ambiente nunca expostas no client.
- **Escalabilidade:** Suportar até 5.000 leads sem degradação de performance.
- **Responsividade:** Desktop-first (uso principal em computadores de escritório). Responsivo para tablets como bônus, sem obrigatoriedade de mobile.
- **Tempo Real:** Atualizações no Kanban e chat devem refletir para todos os usuários via Supabase Realtime.

## 6. FORA DO ESCOPO V1

❌ App mobile nativo (iOS/Android).
❌ Controle de permissões granulares (roles/scopes) — todos são Admin.
❌ Integrações diretas com APIs de terceiros no frontend (toda integração passa pelo n8n).
❌ Relatórios avançados / exportação para PDF ou Excel.
❌ Multi-tenant / multi-empresa.
❌ Módulo financeiro (cobrança, pagamento, NF).
❌ Disparo de campanhas de marketing em massa.

## 7. ONBOARDING

**Fluxo:**
1. Administrador cria as 4 contas no painel do Clerk (Silvana, Jéssica, Márcia, Aniversário).
2. Cada usuário acessa a URL do CRM e faz login com suas credenciais.
3. Webhook do Clerk sincroniza o `user_id` com a tabela `users` no Supabase.
4. Usuário é redirecionado ao Dashboard.
5. Kanban já vem com colunas padrão pré-configuradas.

**Checklist de Primeiros Passos:**
- [ ] Criar contas dos 4 usuários no Clerk.
- [ ] Configurar variáveis de ambiente (Clerk + Supabase).
- [ ] Executar migrations (Drizzle) para criar as tabelas.
- [ ] Cadastrar transportadores iniciais.
- [ ] Configurar webhooks do n8n para recepção de leads e envio de mensagens.
- [ ] Criar tags iniciais (ex: "Formatura", "Excursão", "Aniversário").

## 8. MÉTRICAS DE SUCESSO

- **Tempo médio de resposta ao lead:** < 5 minutos após entrada no CRM (meta de atendimento ágil).
- **Taxa de conversão do funil:** > 25% dos leads que entram na coluna inicial chegam a "Concluído".
- **Adoção da equipe:** 100% dos 4 usuários usando o CRM como ferramenta principal em 2 semanas.
- **Zero conflito IA/humano:** Nenhum caso de IA respondendo enquanto equipe atende manualmente (eficácia do transbordo).
- **Uptime:** 99.5% de disponibilidade mensal.
