"use server";

import { db } from "@/lib/db";
import { agendamentos, leads } from "@/lib/db/schema";
import { eq, isNull, asc } from "drizzle-orm";

// =============================================
// TYPES
// =============================================
export type AgendamentoEvent = {
    id: string;
    leadId: string;
    title: string;
    start: string; // ISO string
    end: string;   // ISO string
    backgroundColor: string;
    borderColor: string;
    nomeEscola: string;
    destino: string | null;
    quantidadeAlunos: number | null;
    status: string;
};

// =============================================
// QUERIES
// =============================================

/**
 * Busca todos os agendamentos com dados do lead (JOIN).
 * Retorna no formato esperado pelo FullCalendar.
 */
export async function getAgendamentos(): Promise<AgendamentoEvent[]> {
    const results = await db
        .select({
            id: agendamentos.id,
            leadId: agendamentos.leadId,
            titulo: agendamentos.titulo,
            descricao: agendamentos.descricao,
            dataInicio: agendamentos.dataInicio,
            dataFim: agendamentos.dataFim,
            status: agendamentos.status,
            cor: agendamentos.cor,
            nomeEscola: leads.nomeEscola,
            destino: leads.destino,
            quantidadeAlunos: leads.quantidadeAlunos,
        })
        .from(agendamentos)
        .innerJoin(leads, eq(agendamentos.leadId, leads.id))
        .where(isNull(agendamentos.deletedAt))
        .orderBy(asc(agendamentos.dataInicio));

    return results.map((r) => ({
        id: r.id,
        leadId: r.leadId,
        title: r.titulo || r.nomeEscola,
        start: r.dataInicio.toISOString(),
        end: r.dataFim.toISOString(),
        backgroundColor: r.cor || "#3b82f6",
        borderColor: r.cor || "#3b82f6",
        nomeEscola: r.nomeEscola,
        destino: r.destino,
        quantidadeAlunos: r.quantidadeAlunos,
        status: r.status,
    }));
}
