"use server";

import { db } from "@/lib/db";
import { clientesWhatsapp, documents, messages } from "@/lib/db/schema";
import { asc, desc, sql, ilike, or, eq, and, gt } from "drizzle-orm";

// =============================================
// TYPES
// =============================================

/** Item da lista lateral de conversas */
export type ClienteListItem = {
    telefone: string;
    nome: string | null;
    email: string | null;
    status: string | null;
    statusAtendimento: string | null;
    iaAtiva: boolean;
    unreadCount: number;
    lastMessageAt: Date | null;
    createdAt: Date | null;
};

/** Detalhe completo do cliente selecionado */
export type ClienteDetail = {
    telefone: string;
    nome: string | null;
    status: string | null;
    cpf: string | null;
    email: string | null;
    statusAtendimento: string | null;
    linkedin: string | null;
    facebook: string | null;
    instagram: string | null;
    iaAtiva: boolean;
    kanbanColumnId: string | null;
    kanbanPosition: number | null;
    lastSeenAt: Date | null;
    createdAt: Date | null;
};

/** Mensagem individual do chat */
export type LeadMessage = {
    id: string;
    senderType: string;
    senderName: string | null;
    content: string;
    mediaType: "text" | "audio" | "image" | null;
    createdAt: Date | null;
};

// =============================================
// QUERIES
// =============================================

/**
 * Lista todos os clientes da tabela Clientes _WhatsApp.
 * Ordenados por created_at DESC (mais recentes primeiro).
 */
export async function listClientes(search?: string): Promise<ClienteListItem[]> {
    // 1. Subquery para buscar a data da última mensagem de cada lead
    const lastMessageSubquery = db
        .select({
            telefone: messages.telefone,
            lastMessageAt: sql<Date>`max(${messages.createdAt})`.as("last_message_at"),
        })
        .from(messages)
        .groupBy(messages.telefone)
        .as("lm");

    // 2. Subquery para contar mensagens não lidas
    // Mensagens do cliente (senderType = 'cliente') enviadas após lastSeenAt do lead
    const unreadCountSubquery = db
        .select({
            telefone: messages.telefone,
            unreadCount: sql<number>`count(*)`.as("unread_count"),
        })
        .from(messages)
        .leftJoin(clientesWhatsapp, eq(messages.telefone, clientesWhatsapp.telefone))
        .where(
            and(
                eq(messages.senderType, "cliente"),
                sql`${messages.createdAt} > COALESCE(${clientesWhatsapp.lastSeenAt}, '1970-01-01'::timestamp)`
            )
        )
        .groupBy(messages.telefone)
        .as("uc");

    let query = db
        .select({
            telefone: clientesWhatsapp.telefone,
            nome: clientesWhatsapp.nome,
            email: clientesWhatsapp.email,
            status: clientesWhatsapp.status,
            statusAtendimento: clientesWhatsapp.statusAtendimento,
            iaAtiva: clientesWhatsapp.iaAtiva,
            createdAt: clientesWhatsapp.createdAt,
            lastMessageAt: lastMessageSubquery.lastMessageAt,
            unreadCount: sql<number>`COALESCE(${unreadCountSubquery.unreadCount}, 0)`.as("unread_count_calculated"),
        })
        .from(clientesWhatsapp)
        .leftJoin(lastMessageSubquery, eq(clientesWhatsapp.telefone, lastMessageSubquery.telefone))
        .leftJoin(unreadCountSubquery, eq(clientesWhatsapp.telefone, unreadCountSubquery.telefone))
        .orderBy(desc(clientesWhatsapp.createdAt));

    const results = await query;

    // Filtrar por busca e mapear para o tipo correto
    let mapped: ClienteListItem[] = results.map(r => ({
        ...r,
        unreadCount: Number(r.unreadCount) || 0,
    }));

    if (search && search.trim()) {
        const term = search.toLowerCase();
        mapped = mapped.filter(
            (r) =>
                r.nome?.toLowerCase().includes(term) ||
                r.telefone?.includes(term)
        );
    }

    return mapped;
}

/**
 * Marca as mensagens de um cliente como lidas (atualiza lastSeenAt).
 */
export async function markAsRead(telefone: string): Promise<void> {
    await db
        .update(clientesWhatsapp)
        .set({ lastSeenAt: new Date() })
        .where(sql`${clientesWhatsapp.telefone}::text = ${telefone}`);
}

/**
 * Busca um cliente pelo telefone.
 */
export async function getClienteByTelefone(telefone: string): Promise<ClienteDetail | null> {
    const results = await db
        .select()
        .from(clientesWhatsapp)
        .where(sql`${clientesWhatsapp.telefone}::text = ${telefone}`)
        .limit(1);

    const cliente = results[0];
    if (!cliente) return null;

    return {
        telefone: cliente.telefone,
        nome: cliente.nome,
        status: cliente.status,
        cpf: cliente.cpf,
        email: cliente.email,
        statusAtendimento: cliente.statusAtendimento,
        linkedin: cliente.linkedin,
        facebook: cliente.facebook,
        instagram: cliente.instagram,
        iaAtiva: cliente.iaAtiva,
        kanbanColumnId: cliente.kanbanColumnId,
        kanbanPosition: cliente.kanbanPosition,
        lastSeenAt: cliente.lastSeenAt,
        createdAt: cliente.createdAt,
    };
}

/**
 * Atualiza ia_ativa do cliente.
 */
export async function toggleIaAtiva(telefone: string, iaAtiva: boolean) {
    await db
        .update(clientesWhatsapp)
        .set({ iaAtiva })
        .where(sql`${clientesWhatsapp.telefone}::text = ${telefone}`);

    return { success: true, iaAtiva };
}

/**
 * Atualiza dados do cliente.
 */
export async function updateCliente(
    telefone: string,
    data: {
        nome?: string | null;
        status?: string | null;
        cpf?: string | null;
        email?: string | null;
        statusAtendimento?: string | null;
        linkedin?: string | null;
        facebook?: string | null;
        instagram?: string | null;
        kanbanColumnId?: string | null;
        kanbanPosition?: number;
    }
) {
    await db
        .update(clientesWhatsapp)
        .set(data)
        .where(sql`${clientesWhatsapp.telefone}::text = ${telefone}`);

    return { success: true };
}

/**
 * Busca os destinos únicos disponíveis na tabela documents.
 */
export async function getAvailableDestinations(): Promise<string[]> {
    const results = await db
        .selectDistinct({
            tipoPasseio: documents.tipoPasseio,
        })
        .from(documents)
        .where(sql`${documents.tipoPasseio} IS NOT NULL AND TRIM(${documents.tipoPasseio}) != ''`)
        .orderBy(asc(documents.tipoPasseio));

    return results.map(r => r.tipoPasseio as string);
}
