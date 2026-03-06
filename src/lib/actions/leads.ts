"use server";

import { db } from "@/lib/db";
import { clientesWhatsapp, documents } from "@/lib/db/schema";
import { asc, desc, sql, ilike, or } from "drizzle-orm";

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
    iaAtiva: boolean;
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
    let query = db
        .select({
            telefone: clientesWhatsapp.telefone,
            nome: clientesWhatsapp.nome,
            email: clientesWhatsapp.email,
            status: clientesWhatsapp.status,
            statusAtendimento: clientesWhatsapp.statusAtendimento,
            iaAtiva: clientesWhatsapp.iaAtiva,
            createdAt: clientesWhatsapp.createdAt,
        })
        .from(clientesWhatsapp)
        .orderBy(desc(clientesWhatsapp.createdAt));

    const results = await query;

    // Filtrar por busca
    let filtered = results;
    if (search && search.trim()) {
        const term = search.toLowerCase();
        filtered = results.filter(
            (r) =>
                r.nome?.toLowerCase().includes(term) ||
                r.telefone?.includes(term)
        );
    }

    return filtered;
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
        iaAtiva: cliente.iaAtiva,
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
