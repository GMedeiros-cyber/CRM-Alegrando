import {
    pgTable,
    text,
    timestamp,
    uuid,
    boolean,
    jsonb,
    bigint,
    numeric,
    integer,
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
// KANBAN (Listas e Cartões)
// =============================================
export const taskLists = pgTable("task_lists", {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const taskCards = pgTable("task_cards", {
    id: uuid("id").primaryKey().defaultRandom(),
    listId: uuid("list_id").notNull().references(() => taskLists.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    position: integer("position").notNull().default(0),
    assignedUserId: uuid("assigned_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// =============================================
// CLIENTES WHATSAPP (fonte da verdade principal)
// O nome real da tabela no banco é "Clientes _WhatsApp"
// =============================================
export const clientesWhatsapp = pgTable("Clientes _WhatsApp", {
    id: uuid("id").defaultRandom(),
    telefone: numeric("telefone").primaryKey(),
    nome: text("nome"),
    status: text("status"),
    cpf: text("cpf"),
    email: text("email"),
    statusAtendimento: text("status_atendimento"),
    linkedin: text("linkedin"),
    facebook: text("facebook"),
    instagram: text("instagram"),
    iaAtiva: boolean("ia_ativa").notNull().default(true),
    kanbanColumnId: uuid("kanban_column_id"),
    kanbanPosition: integer("kanban_position").notNull().default(0),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// =============================================
// MESSAGES (histórico de chat — vinculado por telefone)
// =============================================
export const messages = pgTable("messages", {
    id: uuid("id").primaryKey().defaultRandom(),
    telefone: numeric("telefone").notNull(),
    senderType: text("sender_type").notNull(), // 'cliente' | 'equipe' | 'ia'
    senderName: text("sender_name"),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// =============================================
// RELATIONS
// =============================================
export const clientesWhatsappRelations = relations(clientesWhatsapp, ({ many }) => ({
    messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
    cliente: one(clientesWhatsapp, {
        fields: [messages.telefone],
        references: [clientesWhatsapp.telefone],
    }),
}));

export const taskListsRelations = relations(taskLists, ({ many }) => ({
    cards: many(taskCards),
}));

export const taskCardsRelations = relations(taskCards, ({ one }) => ({
    list: one(taskLists, {
        fields: [taskCards.listId],
        references: [taskLists.id],
    }),
    assignedUser: one(users, {
        fields: [taskCards.assignedUserId],
        references: [users.id],
    }),
}));

export const usersRelations = relations(users, ({ many }) => ({
    assignedCards: many(taskCards),
}));

// =============================================
// DOCUMENTS (Tabela gerenciada pelo n8n - READ ONLY)
// =============================================
export const documents = pgTable("documents", {
    id: bigint("id", { mode: "number" }).primaryKey(),
    content: text("content"),
    metadata: jsonb("metadata"),
    tipoPasseio: text("tipo_passeio"),
    categoria: text("categoria"),
    destaque: boolean("destaque"),
});
