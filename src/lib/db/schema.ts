import {
    pgTable,
    text,
    timestamp,
    uuid,
    integer,
    boolean,
    date,
    jsonb,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// =============================================
// USERS (sync com Clerk via webhook)
// =============================================
export const users = pgTable("users", {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkId: text("clerk_id").notNull().unique(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    avatarUrl: text("avatar_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// =============================================
// KANBAN COLUMNS
// =============================================
export const kanbanColumns = pgTable("kanban_columns", {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
    color: text("color").default("#6366f1"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// =============================================
// TAGS
// =============================================
export const tags = pgTable("tags", {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(),
    color: text("color").notNull().default("#6366f1"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// =============================================
// TRANSPORTADORES
// =============================================
export const transportadores = pgTable("transportadores", {
    id: uuid("id").primaryKey().defaultRandom(),
    nome: text("nome").notNull(),
    telefone: text("telefone"),
    email: text("email"),
    observacoes: text("observacoes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// =============================================
// LEADS
// Campos exatos conforme PRD.md
// =============================================
export const leads = pgTable("leads", {
    id: uuid("id").primaryKey().defaultRandom(),

    // Dados da escola
    nomeEscola: text("nome_escola").notNull(),
    telefone: text("telefone"),
    email: text("email"),
    temperatura: text("temperatura").notNull().default("frio"), // 'frio' | 'morno' | 'quente'

    // Dados do evento
    dataEvento: date("data_evento"),
    destino: text("destino"),
    quantidadeAlunos: integer("quantidade_alunos"),
    pacoteEscolhido: text("pacote_escolhido"),

    // Relações
    transportadoraId: uuid("transportadora_id").references(
        () => transportadores.id
    ),
    kanbanColumnId: uuid("kanban_column_id")
        .notNull()
        .references(() => kanbanColumns.id),
    kanbanPosition: integer("kanban_position").notNull().default(0),

    // Controle de IA / Transbordo
    // ia_ativa = true → n8n responde automaticamente
    // ia_ativa = false → equipe assumiu, n8n não responde
    iaAtiva: boolean("ia_ativa").notNull().default(true),

    // WhatsApp
    whatsappChatId: text("whatsapp_chat_id"),

    // Observações livres
    observacoes: text("observacoes"),

    // Audit
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// =============================================
// LEAD TAGS (junction N:N)
// =============================================
export const leadTags = pgTable("lead_tags", {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
        .notNull()
        .references(() => leads.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
        .notNull()
        .references(() => tags.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// =============================================
// MESSAGES (histórico de chat do lead)
// =============================================
export const messages = pgTable("messages", {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
        .notNull()
        .references(() => leads.id, { onDelete: "cascade" }),
    senderType: text("sender_type").notNull(), // 'lead' | 'equipe' | 'ia'
    senderName: text("sender_name"),
    content: text("content").notNull(),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// =============================================
// AGENDAMENTOS
// =============================================
export const agendamentos = pgTable("agendamentos", {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
        .notNull()
        .references(() => leads.id, { onDelete: "cascade" }),
    dataInicio: timestamp("data_inicio", { withTimezone: true }).notNull(),
    dataFim: timestamp("data_fim", { withTimezone: true }).notNull(),
    titulo: text("titulo").notNull(),
    descricao: text("descricao"),
    status: text("status").notNull().default("confirmado"), // 'confirmado' | 'pendente' | 'cancelado'
    cor: text("cor").default("#3b82f6"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// =============================================
// RELATIONS
// =============================================
export const leadsRelations = relations(leads, ({ one, many }) => ({
    kanbanColumn: one(kanbanColumns, {
        fields: [leads.kanbanColumnId],
        references: [kanbanColumns.id],
    }),
    transportadora: one(transportadores, {
        fields: [leads.transportadoraId],
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

// =============================================
// TASK LISTS (colunas do quadro de tarefas)
// =============================================
export const taskLists = pgTable("task_lists", {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// =============================================
// TASKS (cartões dentro das listas)
// =============================================
export const tasks = pgTable("tasks", {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    description: text("description"),
    taskListId: uuid("task_list_id")
        .notNull()
        .references(() => taskLists.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    priority: text("priority").notNull().default("medium"), // 'low' | 'medium' | 'high'
    assignedTo: uuid("assigned_to").references(() => users.id),
    leadId: uuid("lead_id").references(() => leads.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// Relations
export const taskListsRelations = relations(taskLists, ({ many }) => ({
    tasks: many(tasks),
}));

export const tasksRelations = relations(tasks, ({ one }) => ({
    taskList: one(taskLists, {
        fields: [tasks.taskListId],
        references: [taskLists.id],
    }),
    assignee: one(users, {
        fields: [tasks.assignedTo],
        references: [users.id],
    }),
    lead: one(leads, {
        fields: [tasks.leadId],
        references: [leads.id],
    }),
}));
