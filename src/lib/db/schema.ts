import {
    pgTable,
    text,
    timestamp,
    uuid,
    boolean,
    jsonb,
    bigint,
    numeric,
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
