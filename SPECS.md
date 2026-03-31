# SPECS - Alegrando CRM

## STACK TECNOLÓGICA

### Frontend
- **Framework:** Next.js 14+ (App Router)
- **Linguagem:** TypeScript 5+
- **UI Library:** shadcn/ui + Radix UI
- **Styling:** Tailwind CSS 3.4+
- **State Management:**
  - Zustand (client state — estado do Kanban, modais, filtros)
  - TanStack Query v5 (server state — cache e sincronização de dados)
- **Forms:** React Hook Form + Zod
- **Drag & Drop:** @dnd-kit/core + @dnd-kit/sortable (Kanban)
- **Calendário:** @fullcalendar/react (Agenda)
- **Gráficos:** Recharts (Dashboard)

### Backend & Database
- **Database:** Supabase (PostgreSQL 15+)
- **ORM:** Drizzle ORM
- **API:** Next.js Server Actions
- **Realtime:** Supabase Realtime (Kanban, Chat, Dashboard)
- **Storage:** Supabase Storage (anexos futuros)

### Autenticação
- **Provider:** Clerk
- **Features:** Email/Password, Session Management
- **Sync:** Webhook Clerk → Supabase (tabela `users`)

### Comunicação / Automações
- **Orquestrador:** n8n
- **Protocolo:** Webhooks HTTP (POST)
- **Funcionalidades:**
  - Recepção e cadastro automático de leads via WhatsApp
  - Envio de mensagens WhatsApp pelo CRM (via webhook)
  - Consulta da flag `ai_paused` antes de responder automaticamente
  - Avisos de véspera de evento
  - Envio de materiais para escolas

### Infraestrutura
- **Hosting:** VPS gerenciada com Coolify (PaaS)
- **Repository:** GitHub
- **CI/CD:** Deploy automático via integração Coolify ↔ GitHub

---

## TENANT CONTEXT FLOW

```
Request → Clerk Auth (middleware) → Extract userId → Supabase Query com RLS
```

**Implementação:**

Como o sistema é **single-tenant** (4 usuários Admin compartilhando a mesma base), o RLS garante apenas que o usuário esteja **autenticado** — sem filtro por `userId` nas tabelas de negócio. A verificação é:

```sql
-- Policy padrão em todas as tabelas
CREATE POLICY "Authenticated users full access" ON [tabela]
  FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
```

A sincronização Clerk → Supabase é feita via webhook para manter a tabela `users` atualizada com os dados do Clerk e gerar um JWT customizado para o Supabase.

---

## SCHEMA DO BANCO DE DADOS (SUPABASE)

### Convenções
- RLS policies habilitadas em **TODAS** as tabelas
- Soft deletes: `deleted_at TIMESTAMPTZ DEFAULT NULL`
- Audit trail: `created_at TIMESTAMPTZ DEFAULT now()`, `updated_at TIMESTAMPTZ DEFAULT now()`
- UUIDs para IDs: `gen_random_uuid()`
- Nomenclatura: snake_case para tabelas e colunas

---

### Tabela: `users`

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE UNIQUE INDEX idx_users_clerk_id ON users(clerk_id);

-- RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read all users"
  ON users FOR SELECT
  USING (auth.uid() IS NOT NULL);
```

---

### Tabela: `kanban_columns`

```sql
CREATE TABLE kanban_columns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  color TEXT DEFAULT '#6366f1',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ DEFAULT NULL
);

-- Indexes
CREATE INDEX idx_kanban_columns_position ON kanban_columns(position);

-- RLS
ALTER TABLE kanban_columns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access"
  ON kanban_columns FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Colunas padrão (seed)
INSERT INTO kanban_columns (name, position, color) VALUES
  ('Novos Leads', 0, '#8b5cf6'),
  ('Em Contato', 1, '#3b82f6'),
  ('Proposta Enviada', 2, '#f59e0b'),
  ('Negociando', 3, '#f97316'),
  ('Concluído', 4, '#22c55e');
```

---

### Tabela: `tags`

```sql
CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ DEFAULT NULL
);

-- RLS
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access"
  ON tags FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
```

---

### Tabela: `transportadores`

```sql
CREATE TABLE transportadores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  telefone TEXT,
  email TEXT,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ DEFAULT NULL
);

-- Indexes
CREATE INDEX idx_transportadores_nome ON transportadores(nome);

-- RLS
ALTER TABLE transportadores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access"
  ON transportadores FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
```

---

### Tabela: `leads`

```sql
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_escola TEXT NOT NULL,
  telefone TEXT,
  email TEXT,
  temperatura TEXT NOT NULL DEFAULT 'frio'
    CHECK (temperatura IN ('frio', 'morno', 'quente')),
  data_evento DATE,
  destino TEXT,
  qtd_alunos INTEGER,
  pacote_escolhido TEXT,
  transportador_id UUID REFERENCES transportadores(id) ON DELETE SET NULL,
  kanban_column_id UUID NOT NULL REFERENCES kanban_columns(id) ON DELETE RESTRICT,
  kanban_position INTEGER NOT NULL DEFAULT 0,
  ai_paused BOOLEAN NOT NULL DEFAULT false,
  ai_paused_by TEXT,
  ai_paused_at TIMESTAMPTZ,
  whatsapp_chat_id TEXT,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ DEFAULT NULL
);

-- Indexes
CREATE INDEX idx_leads_temperatura ON leads(temperatura);
CREATE INDEX idx_leads_kanban_column ON leads(kanban_column_id);
CREATE INDEX idx_leads_kanban_position ON leads(kanban_column_id, kanban_position);
CREATE INDEX idx_leads_data_evento ON leads(data_evento);
CREATE INDEX idx_leads_nome_escola ON leads(nome_escola);
CREATE INDEX idx_leads_deleted_at ON leads(deleted_at);

-- RLS
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access"
  ON leads FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
```

---

### Tabela: `lead_tags`

```sql
CREATE TABLE lead_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(lead_id, tag_id)
);

-- Indexes
CREATE INDEX idx_lead_tags_lead ON lead_tags(lead_id);
CREATE INDEX idx_lead_tags_tag ON lead_tags(tag_id);

-- RLS
ALTER TABLE lead_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access"
  ON lead_tags FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
```

---

### Tabela: `messages`

```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('lead', 'equipe', 'ia')),
  sender_name TEXT,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_messages_lead ON messages(lead_id);
CREATE INDEX idx_messages_created_at ON messages(lead_id, created_at);

-- RLS
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access"
  ON messages FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
```

---

### Tabela: `agendamentos`

```sql
CREATE TABLE agendamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  data_inicio TIMESTAMPTZ NOT NULL,
  data_fim TIMESTAMPTZ NOT NULL,
  titulo TEXT NOT NULL,
  descricao TEXT,
  status TEXT NOT NULL DEFAULT 'confirmado'
    CHECK (status IN ('confirmado', 'pendente', 'cancelado')),
  cor TEXT DEFAULT '#3b82f6',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ DEFAULT NULL
);

-- Indexes
CREATE INDEX idx_agendamentos_lead ON agendamentos(lead_id);
CREATE INDEX idx_agendamentos_datas ON agendamentos(data_inicio, data_fim);
CREATE INDEX idx_agendamentos_status ON agendamentos(status);

-- RLS
ALTER TABLE agendamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access"
  ON agendamentos FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
```

---

### Trigger: Auto-update `updated_at`

```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar em todas as tabelas com updated_at
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_leads_updated_at BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_kanban_columns_updated_at BEFORE UPDATE ON kanban_columns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_tags_updated_at BEFORE UPDATE ON tags
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_transportadores_updated_at BEFORE UPDATE ON transportadores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_agendamentos_updated_at BEFORE UPDATE ON agendamentos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

---

## DRIZZLE ORM SCHEMA

```typescript
// lib/db/schema.ts
import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  boolean,
  date,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// =============================================
// USERS
// =============================================
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerkId: text('clerk_id').notNull().unique(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// =============================================
// KANBAN COLUMNS
// =============================================
export const kanbanColumns = pgTable('kanban_columns', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  position: integer('position').notNull().default(0),
  color: text('color').default('#6366f1'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// =============================================
// TAGS
// =============================================
export const tags = pgTable('tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  color: text('color').notNull().default('#6366f1'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// =============================================
// TRANSPORTADORES
// =============================================
export const transportadores = pgTable('transportadores', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').notNull(),
  telefone: text('telefone'),
  email: text('email'),
  observacoes: text('observacoes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// =============================================
// LEADS
// =============================================
export const leads = pgTable('leads', {
  id: uuid('id').primaryKey().defaultRandom(),
  nomeEscola: text('nome_escola').notNull(),
  telefone: text('telefone'),
  email: text('email'),
  temperatura: text('temperatura').notNull().default('frio'),
  dataEvento: date('data_evento'),
  destino: text('destino'),
  qtdAlunos: integer('qtd_alunos'),
  pacoteEscolhido: text('pacote_escolhido'),
  transportadorId: uuid('transportador_id').references(() => transportadores.id),
  kanbanColumnId: uuid('kanban_column_id')
    .notNull()
    .references(() => kanbanColumns.id),
  kanbanPosition: integer('kanban_position').notNull().default(0),
  aiPaused: boolean('ai_paused').notNull().default(false),
  aiPausedBy: text('ai_paused_by'),
  aiPausedAt: timestamp('ai_paused_at', { withTimezone: true }),
  whatsappChatId: text('whatsapp_chat_id'),
  observacoes: text('observacoes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// =============================================
// LEAD TAGS (junction)
// =============================================
export const leadTags = pgTable('lead_tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  leadId: uuid('lead_id')
    .notNull()
    .references(() => leads.id, { onDelete: 'cascade' }),
  tagId: uuid('tag_id')
    .notNull()
    .references(() => tags.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// =============================================
// MESSAGES
// =============================================
export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  leadId: uuid('lead_id')
    .notNull()
    .references(() => leads.id, { onDelete: 'cascade' }),
  senderType: text('sender_type').notNull(), // 'lead' | 'equipe' | 'ia'
  senderName: text('sender_name'),
  content: text('content').notNull(),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// =============================================
// AGENDAMENTOS
// =============================================
export const agendamentos = pgTable('agendamentos', {
  id: uuid('id').primaryKey().defaultRandom(),
  leadId: uuid('lead_id')
    .notNull()
    .references(() => leads.id, { onDelete: 'cascade' }),
  dataInicio: timestamp('data_inicio', { withTimezone: true }).notNull(),
  dataFim: timestamp('data_fim', { withTimezone: true }).notNull(),
  titulo: text('titulo').notNull(),
  descricao: text('descricao'),
  status: text('status').notNull().default('confirmado'),
  cor: text('cor').default('#3b82f6'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// =============================================
// RELATIONS
// =============================================
export const leadsRelations = relations(leads, ({ one, many }) => ({
  kanbanColumn: one(kanbanColumns, {
    fields: [leads.kanbanColumnId],
    references: [kanbanColumns.id],
  }),
  transportador: one(transportadores, {
    fields: [leads.transportadorId],
    references: [transportadores.id],
  }),
  tags: many(leadTags),
  messages: many(messages),
  agendamentos: many(agendamentos),
}));

export const kanbanColumnsRelations = relations(kanbanColumns, ({ many }) => ({
  leads: many(leads),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  leadTags: many(leadTags),
}));

export const leadTagsRelations = relations(leadTags, ({ one }) => ({
  lead: one(leads, {
    fields: [leadTags.leadId],
    references: [leads.id],
  }),
  tag: one(tags, {
    fields: [leadTags.tagId],
    references: [tags.id],
  }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  lead: one(leads, {
    fields: [messages.leadId],
    references: [leads.id],
  }),
}));

export const agendamentosRelations = relations(agendamentos, ({ one }) => ({
  lead: one(leads, {
    fields: [agendamentos.leadId],
    references: [leads.id],
  }),
}));
```

---

## CLERK INTEGRATION

### Middleware

```typescript
// middleware.ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/webhooks(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
```

### Webhook: Sincronizar Clerk → Supabase

```typescript
// app/api/webhooks/clerk/route.ts
import { headers } from 'next/headers';
import { Webhook } from 'svix';
import { WebhookEvent } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    throw new Error('CLERK_WEBHOOK_SECRET não configurado');
  }

  const headerPayload = await headers();
  const svixId = headerPayload.get('svix-id');
  const svixTimestamp = headerPayload.get('svix-timestamp');
  const svixSignature = headerPayload.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response('Headers svix ausentes', { status: 400 });
  }

  const payload = await req.json();
  const body = JSON.stringify(payload);

  const wh = new Webhook(WEBHOOK_SECRET);
  let evt: WebhookEvent;

  try {
    evt = wh.verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as WebhookEvent;
  } catch {
    return new Response('Assinatura inválida', { status: 400 });
  }

  if (evt.type === 'user.created' || evt.type === 'user.updated') {
    const { id, email_addresses, first_name, last_name, image_url } = evt.data;

    await db
      .insert(users)
      .values({
        clerkId: id,
        name: `${first_name || ''} ${last_name || ''}`.trim(),
        email: email_addresses[0]?.email_address || '',
        avatarUrl: image_url,
      })
      .onConflictDoUpdate({
        target: users.clerkId,
        set: {
          name: `${first_name || ''} ${last_name || ''}`.trim(),
          email: email_addresses[0]?.email_address || '',
          avatarUrl: image_url,
        },
      });
  }

  if (evt.type === 'user.deleted') {
    await db.delete(users).where(eq(users.clerkId, evt.data.id!));
  }

  return new Response('OK', { status: 200 });
}
```

---

## SUPABASE INTEGRATION

### Client Setup

```typescript
// lib/supabase/client.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

### Server Client (com Service Role para Server Actions)

```typescript
// lib/supabase/server.ts
import { createClient } from '@supabase/supabase-js';

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);
```

### Realtime — Exemplo de Subscription (Kanban)

```typescript
// hooks/use-realtime-leads.ts
'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

export function useRealtimeLeads() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel('leads-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leads' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['leads'] });
          queryClient.invalidateQueries({ queryKey: ['kanban'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
```

---

## COMPONENTES PRINCIPAIS

### Estrutura de Pastas

```
/app
  /(auth)
    /sign-in/[[...sign-in]]/page.tsx
    /sign-up/[[...sign-up]]/page.tsx
  /(app)
    /layout.tsx                    ← Sidebar + Auth guard
    /dashboard/page.tsx
    /kanban/page.tsx
    /leads/page.tsx
    /agenda/page.tsx
    /transportadores/page.tsx
  /api
    /webhooks
      /clerk/route.ts
      /n8n/route.ts               ← Receber updates do n8n
/components
  /dashboard
    /metric-card.tsx
    /leads-chart.tsx
    /funnel-chart.tsx
  /kanban
    /kanban-board.tsx
    /kanban-column.tsx
    /kanban-card.tsx
    /column-header.tsx
  /leads
    /leads-table.tsx
    /leads-filters.tsx
    /lead-detail-modal.tsx
    /lead-form.tsx
    /lead-chat.tsx
    /ai-pause-toggle.tsx
  /agenda
    /calendar-view.tsx
    /event-card.tsx
  /transportadores
    /transportadores-table.tsx
    /transportador-form.tsx
  /tags
    /tag-manager.tsx
    /tag-badge.tsx
  /layout
    /sidebar.tsx
    /header.tsx
  /ui (shadcn)
/lib
  /db
    /index.ts                     ← Drizzle client
    /schema.ts                    ← Schema completo
  /supabase
    /client.ts
    /server.ts
  /hooks
    /use-realtime-leads.ts
    /use-realtime-messages.ts
  /actions
    /leads.ts
    /kanban.ts
    /tags.ts
    /transportadores.ts
    /agendamentos.ts
    /messages.ts
  /validations
    /lead.ts
    /tag.ts
    /transportador.ts
    /agendamento.ts
  /utils
    /n8n-webhook.ts               ← Helper para chamadas ao n8n
```

### Componentes Críticos

#### 1. KanbanBoard

```tsx
// components/kanban/kanban-board.tsx
'use client';

import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { KanbanColumn } from './kanban-column';
import { KanbanCard } from './kanban-card';
import { useKanbanStore } from '@/lib/stores/kanban-store';

export function KanbanBoard() {
  const { columns, leads, activeCard, handleDragStart, handleDragEnd, handleDragOver } =
    useKanbanStore();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto p-4 h-full">
        <SortableContext items={columns.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
          {columns.map((column) => (
            <KanbanColumn
              key={column.id}
              column={column}
              leads={leads.filter((l) => l.kanbanColumnId === column.id)}
            />
          ))}
        </SortableContext>
      </div>

      <DragOverlay>
        {activeCard ? <KanbanCard lead={activeCard} isOverlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}
```

#### 2. AiPauseToggle (Transbordo)

```tsx
// components/leads/ai-pause-toggle.tsx
'use client';

import { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Bot, UserRound } from 'lucide-react';
import { toggleAiPause } from '@/lib/actions/leads';

interface AiPauseToggleProps {
  leadId: string;
  initialPaused: boolean;
}

export function AiPauseToggle({ leadId, initialPaused }: AiPauseToggleProps) {
  const [paused, setPaused] = useState(initialPaused);
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    setLoading(true);
    try {
      await toggleAiPause(leadId, !paused);
      setPaused(!paused);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border">
      <Switch
        checked={paused}
        onCheckedChange={handleToggle}
        disabled={loading}
      />
      {paused ? (
        <Badge variant="destructive" className="flex items-center gap-1">
          <UserRound className="w-3 h-3" />
          Atendimento Humano
        </Badge>
      ) : (
        <Badge variant="secondary" className="flex items-center gap-1">
          <Bot className="w-3 h-3" />
          IA Ativa
        </Badge>
      )}
    </div>
  );
}
```

#### 3. N8N Webhook Helper

```typescript
// lib/utils/n8n-webhook.ts
const N8N_BASE_URL = process.env.N8N_WEBHOOK_URL;

interface SendMessagePayload {
  leadId: string;
  phone: string;
  message: string;
  senderName: string;
}

export async function sendWhatsAppMessage(payload: SendMessagePayload) {
  const response = await fetch(`${N8N_BASE_URL}/webhook/send-whatsapp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Erro ao enviar mensagem: ${response.statusText}`);
  }

  return response.json();
}

export async function notifyN8N(event: string, data: Record<string, unknown>) {
  const response = await fetch(`${N8N_BASE_URL}/webhook/${event}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  return response.json();
}
```

---

## DESIGN SYSTEM

### Cores (Tailwind Config)

```javascript
// tailwind.config.ts (extend)
colors: {
  brand: {
    50:  '#fef3f2',
    100: '#fee4e2',
    200: '#fececa',
    300: '#fcaaa4',
    400: '#f87a70',
    500: '#ef5544',   // Primary — vermelho vibrante Alegrando
    600: '#dc3626',
    700: '#b9291c',
    800: '#99261b',
    900: '#7f261d',
  },
  surface: {
    DEFAULT: '#ffffff',
    muted:   '#f8fafc',
    subtle:  '#f1f5f9',
  },
  sidebar: {
    bg:      '#0f172a',
    hover:   '#1e293b',
    active:  '#334155',
    text:    '#cbd5e1',
  },
  temperatura: {
    frio:    '#3b82f6',  // Azul
    morno:   '#f59e0b',  // Âmbar
    quente:  '#ef4444',  // Vermelho
  },
}
```

### Typography
- **Headings:** Inter (700, 600) — clean e profissional
- **Body:** Inter (400, 500) — legibilidade em tabelas e formulários
- **Small/Labels:** Inter (500, 12px) — badges e metadados

### Componentes Base (shadcn/ui)
Button, Card, Dialog, Sheet, Badge, Input, Select, Switch, Tabs, Table, Calendar, DropdownMenu, Tooltip, Toast, Popover, Command, Avatar, Separator, ScrollArea, Skeleton

---

## SERVER ACTIONS

### Padrão de Implementação

```typescript
// lib/actions/leads.ts
'use server';

import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { leads } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const updateLeadSchema = z.object({
  id: z.string().uuid(),
  nomeEscola: z.string().min(1),
  temperatura: z.enum(['frio', 'morno', 'quente']),
  dataEvento: z.string().optional(),
  destino: z.string().optional(),
  qtdAlunos: z.number().int().positive().optional(),
  pacoteEscolhido: z.string().optional(),
  transportadorId: z.string().uuid().optional().nullable(),
  observacoes: z.string().optional(),
});

export async function updateLead(data: z.infer<typeof updateLeadSchema>) {
  const { userId } = await auth();
  if (!userId) throw new Error('Não autorizado');

  const validated = updateLeadSchema.parse(data);

  await db
    .update(leads)
    .set({
      nomeEscola: validated.nomeEscola,
      temperatura: validated.temperatura,
      dataEvento: validated.dataEvento,
      destino: validated.destino,
      qtdAlunos: validated.qtdAlunos,
      pacoteEscolhido: validated.pacoteEscolhido,
      transportadorId: validated.transportadorId,
      observacoes: validated.observacoes,
    })
    .where(eq(leads.id, validated.id));

  revalidatePath('/kanban');
  revalidatePath('/leads');
  return { success: true };
}

export async function toggleAiPause(leadId: string, paused: boolean) {
  const { userId } = await auth();
  if (!userId) throw new Error('Não autorizado');

  await db
    .update(leads)
    .set({
      aiPaused: paused,
      aiPausedBy: paused ? userId : null,
      aiPausedAt: paused ? new Date() : null,
    })
    .where(eq(leads.id, leadId));

  revalidatePath('/kanban');
  return { success: true };
}

export async function moveLeadInKanban(
  leadId: string,
  targetColumnId: string,
  newPosition: number
) {
  const { userId } = await auth();
  if (!userId) throw new Error('Não autorizado');

  await db
    .update(leads)
    .set({
      kanbanColumnId: targetColumnId,
      kanbanPosition: newPosition,
    })
    .where(eq(leads.id, leadId));

  revalidatePath('/kanban');
  return { success: true };
}
```

### Server Action: Enviar Mensagem

```typescript
// lib/actions/messages.ts
'use server';

import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { messages, leads } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { sendWhatsAppMessage } from '@/lib/utils/n8n-webhook';
import { revalidatePath } from 'next/cache';

export async function sendMessage(leadId: string, content: string) {
  const { userId } = await auth();
  if (!userId) throw new Error('Não autorizado');

  // Buscar dados do lead
  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, leadId),
  });

  if (!lead) throw new Error('Lead não encontrado');

  // Salvar mensagem no banco
  await db.insert(messages).values({
    leadId,
    senderType: 'equipe',
    senderName: userId,
    content,
  });

  // Enviar via n8n webhook
  await sendWhatsAppMessage({
    leadId,
    phone: lead.telefone || '',
    message: content,
    senderName: userId,
  });

  revalidatePath('/kanban');
  return { success: true };
}
```

---

## SEGURANÇA

### Checklist
✅ RLS habilitado em todas as tabelas (policy: `auth.uid() IS NOT NULL`)
✅ Server Actions validam `auth()` do Clerk antes de qualquer operação
✅ Zod validation em todos os formulários e Server Actions
✅ Variáveis de ambiente sensíveis nunca expostas no client (prefixo `NEXT_PUBLIC_` apenas para URLs públicas)
✅ Webhook do Clerk validado com Svix signature
✅ CORS configurado para aceitar apenas origens autorizadas
✅ Soft deletes para manter histórico (sem perda de dados)

### Exemplo de Query Segura

```typescript
// ✅ CORRETO — Server Action com auth guard
export async function getLeads() {
  const { userId } = await auth();
  if (!userId) throw new Error('Não autorizado');

  return db.query.leads.findMany({
    where: (table, { isNull }) => isNull(table.deletedAt),
    with: { kanbanColumn: true, tags: { with: { tag: true } } },
    orderBy: (table, { asc }) => asc(table.kanbanPosition),
  });
}

// ❌ ERRADO — Sem verificação de auth
export async function getLeadsUnsafe() {
  return db.query.leads.findMany();
}
```

---

## PERFORMANCE

### Otimizações
- React Server Components para Dashboard, Agenda e listas estáticas.
- Streaming SSR com `loading.tsx` em cada rota para feedback instantâneo.
- `@dnd-kit` com virtualização para Kanban com muitos cards.
- TanStack Query com `staleTime` e `gcTime` otimizados para reduzir re-fetches.
- Supabase Realtime com debounce para evitar invalidações excessivas.
- `next/image` para avatares e ícones.
- Paginação na lista de leads (20 por página) e no histórico de mensagens.

### Metas
- First Contentful Paint: < 1.5s
- Time to Interactive: < 3s
- Lighthouse Score: > 90
- Drag-and-drop latência: < 200ms
- Carregamento do chat: < 500ms

---

## GITHUB WORKFLOW

### Branch Strategy

```
main (produção)
  └── develop (staging)
       └── feature/* (desenvolvimento)
```

### CI/CD Pipeline

```yaml
# .github/workflows/main.yml
name: CI/CD

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run build

  deploy:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - name: Trigger Coolify Deploy
        run: |
          curl -X POST "${{ secrets.COOLIFY_WEBHOOK_URL }}" \
            -H "Authorization: Bearer ${{ secrets.COOLIFY_TOKEN }}"
```

---

## DEPLOY CHECKLIST

### Variáveis de Ambiente

```bash
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SECRET=

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# n8n
N8N_WEBHOOK_URL=

# App
NEXT_PUBLIC_URL=
```

### Passos

1. Criar projeto no Supabase e anotar URL + chaves.
2. Criar aplicação no Clerk e anotar chaves.
3. Configurar webhook no Clerk apontando para `/api/webhooks/clerk` (eventos: `user.created`, `user.updated`, `user.deleted`).
4. Executar migrations com Drizzle: `npx drizzle-kit push`.
5. Executar seed para colunas padrão do Kanban.
6. Criar os 4 usuários no Clerk (Silvana, Jéssica, Márcia, Aniversário).
7. Configurar variáveis de ambiente no Coolify.
8. Conectar repositório GitHub ao Coolify e fazer deploy.
9. Configurar webhooks do n8n para recepção de leads e envio de mensagens.
10. Testar fluxo completo: login → dashboard → kanban → chat → transbordo.

---

## ROADMAP TÉCNICO

**Fase 1 — MVP (Semana 1-2):**
- Setup do projeto (Next.js + Clerk + Supabase + Drizzle).
- Schema do banco + migrations.
- Autenticação e proteção de rotas.
- Webhook Clerk → Supabase.
- Kanban funcional com drag-and-drop.
- Modal de detalhes do lead (formulário + chat básico).
- Toggle de transbordo (Pausar IA).

**Fase 2 — Funcionalidades Completas (Semana 3-4):**
- Dashboard com métricas e gráficos.
- Lista de leads com filtros avançados.
- Sistema de tags completo.
- CRUD de transportadores.
- Agenda/Calendário.
- Supabase Realtime integrado.

**Fase 3 — Polish e Lançamento (Semana 5+):**
- Testes E2E das funcionalidades críticas.
- Otimizações de performance.
- CI/CD com GitHub + Coolify.
- Documentação de uso para a equipe.
- Monitoramento e alertas.
- Deploy em produção.
