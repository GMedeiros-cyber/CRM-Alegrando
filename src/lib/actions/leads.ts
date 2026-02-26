"use server";

import { db } from "@/lib/db";
import { leads, messages, transportadores, kanbanColumns, leadTags, tags } from "@/lib/db/schema";
import { eq, asc, isNull, desc, ilike, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

// =============================================
// TYPES
// =============================================
export type LeadListItem = {
    id: string;
    nomeEscola: string;
    telefone: string | null;
    temperatura: string;
    kanbanColumnId: string;
    kanbanColumnName: string;
    kanbanColumnColor: string | null;
    iaAtiva: boolean;
    lastMessageAt: Date | null;
    createdAt: Date | null;
};

export type LeadDetail = {
    id: string;
    nomeEscola: string;
    telefone: string | null;
    email: string | null;
    temperatura: string;
    dataEvento: string | null;
    destino: string | null;
    quantidadeAlunos: number | null;
    pacoteEscolhido: string | null;
    transportadoraId: string | null;
    kanbanColumnId: string;
    iaAtiva: boolean;
    whatsappChatId: string | null;
    observacoes: string | null;
    createdAt: Date | null;
    updatedAt: Date | null;
};

export type LeadMessage = {
    id: string;
    senderType: string;
    senderName: string | null;
    content: string;
    createdAt: Date | null;
};

export type TransportadorOption = {
    id: string;
    nome: string;
};

// =============================================
// QUERIES
// =============================================

/**
 * Lista todos os leads com nome da coluna kanban, ordenados por atividade recente.
 */
export async function listLeads(search?: string): Promise<LeadListItem[]> {
    let query = db
        .select({
            id: leads.id,
            nomeEscola: leads.nomeEscola,
            telefone: leads.telefone,
            temperatura: leads.temperatura,
            kanbanColumnId: leads.kanbanColumnId,
            kanbanColumnName: kanbanColumns.name,
            kanbanColumnColor: kanbanColumns.color,
            iaAtiva: leads.iaAtiva,
            createdAt: leads.createdAt,
        })
        .from(leads)
        .innerJoin(kanbanColumns, eq(leads.kanbanColumnId, kanbanColumns.id))
        .where(isNull(leads.deletedAt))
        .orderBy(desc(leads.updatedAt));

    const results = await query;

    // Filtrar por busca no lado do servidor
    let filtered = results;
    if (search && search.trim()) {
        const term = search.toLowerCase();
        filtered = results.filter(
            (r) =>
                r.nomeEscola.toLowerCase().includes(term) ||
                r.telefone?.toLowerCase().includes(term) ||
                r.kanbanColumnName.toLowerCase().includes(term)
        );
    }

    return filtered.map((r) => ({
        ...r,
        lastMessageAt: null, // será preenchido quando houver mensagens
    }));
}

/**
 * Busca um lead pelo ID com todos os detalhes.
 */
export async function getLeadById(id: string): Promise<LeadDetail | null> {
    const [lead] = await db
        .select()
        .from(leads)
        .where(eq(leads.id, id))
        .limit(1);

    if (!lead) return null;

    return {
        id: lead.id,
        nomeEscola: lead.nomeEscola,
        telefone: lead.telefone,
        email: lead.email,
        temperatura: lead.temperatura,
        dataEvento: lead.dataEvento,
        destino: lead.destino,
        quantidadeAlunos: lead.quantidadeAlunos,
        pacoteEscolhido: lead.pacoteEscolhido,
        transportadoraId: lead.transportadoraId,
        kanbanColumnId: lead.kanbanColumnId,
        iaAtiva: lead.iaAtiva,
        whatsappChatId: lead.whatsappChatId,
        observacoes: lead.observacoes,
        createdAt: lead.createdAt,
        updatedAt: lead.updatedAt,
    };
}

/**
 * Busca as mensagens de um lead.
 */
export async function getLeadMessages(leadId: string): Promise<LeadMessage[]> {
    return db
        .select({
            id: messages.id,
            senderType: messages.senderType,
            senderName: messages.senderName,
            content: messages.content,
            createdAt: messages.createdAt,
        })
        .from(messages)
        .where(eq(messages.leadId, leadId))
        .orderBy(asc(messages.createdAt));
}

/**
 * Busca transportadores para o dropdown.
 */
export async function getTransportadores(): Promise<TransportadorOption[]> {
    return db
        .select({ id: transportadores.id, nome: transportadores.nome })
        .from(transportadores)
        .where(isNull(transportadores.deletedAt))
        .orderBy(asc(transportadores.nome));
}

/**
 * Busca colunas do Kanban para o dropdown.
 */
export async function getKanbanColumnsForSelect() {
    return db
        .select({ id: kanbanColumns.id, name: kanbanColumns.name })
        .from(kanbanColumns)
        .where(isNull(kanbanColumns.deletedAt))
        .orderBy(asc(kanbanColumns.position));
}

// =============================================
// MUTATIONS
// =============================================

/**
 * Atualiza os dados de um lead.
 */
export async function updateLead(
    id: string,
    data: {
        nomeEscola?: string;
        telefone?: string | null;
        email?: string | null;
        temperatura?: string;
        dataEvento?: string | null;
        destino?: string | null;
        quantidadeAlunos?: number | null;
        pacoteEscolhido?: string | null;
        transportadoraId?: string | null;
        kanbanColumnId?: string;
        observacoes?: string | null;
    }
) {
    await db
        .update(leads)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(leads.id, id));

    revalidatePath("/conversas");
    revalidatePath("/kanban");
    return { success: true };
}

/**
 * Toggle do campo ia_ativa.
 */
export async function toggleIaAtiva(id: string, iaAtiva: boolean) {
    await db
        .update(leads)
        .set({ iaAtiva, updatedAt: new Date() })
        .where(eq(leads.id, id));

    revalidatePath("/conversas");
    revalidatePath("/kanban");
    return { success: true, iaAtiva };
}

/**
 * Salva uma mensagem e dispara para o n8n.
 */
export async function sendMessage(
    leadId: string,
    content: string,
    senderName?: string
) {
    const [msg] = await db
        .insert(messages)
        .values({
            leadId,
            senderType: "equipe",
            senderName: senderName || "Equipe Alegrando",
            content,
        })
        .returning();

    // Buscar dados do lead para o n8n
    const [lead] = await db
        .select({
            telefone: leads.telefone,
            nomeEscola: leads.nomeEscola,
            whatsappChatId: leads.whatsappChatId,
        })
        .from(leads)
        .where(eq(leads.id, leadId))
        .limit(1);

    // POST para n8n (fire and forget)
    const n8nUrl = process.env.N8N_WEBHOOK_URL;
    if (n8nUrl && lead) {
        try {
            await fetch(n8nUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "send_message",
                    leadId,
                    telefone: lead.telefone,
                    nomeEscola: lead.nomeEscola,
                    whatsappChatId: lead.whatsappChatId,
                    message: content,
                    senderName: senderName || "Equipe Alegrando",
                    timestamp: new Date().toISOString(),
                }),
            });
        } catch (err) {
            console.error("⚠️ Erro ao enviar para n8n:", err);
        }
    }

    return msg;
}
