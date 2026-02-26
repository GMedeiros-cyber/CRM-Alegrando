"use server";

import { db } from "@/lib/db";
import { kanbanColumns, leads, leadTags, tags } from "@/lib/db/schema";
import { eq, asc, isNull, and, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

// =============================================
// TYPES
// =============================================
export type KanbanColumn = {
    id: string;
    name: string;
    position: number;
    color: string | null;
};

export type KanbanLead = {
    id: string;
    nomeEscola: string;
    temperatura: string;
    dataEvento: string | null;
    destino: string | null;
    quantidadeAlunos: number | null;
    kanbanColumnId: string;
    kanbanPosition: number;
    iaAtiva: boolean;
    createdAt: Date | null;
    tags: { id: string; name: string; color: string }[];
};

export type KanbanData = {
    columns: KanbanColumn[];
    leads: KanbanLead[];
};

// =============================================
// QUERIES
// =============================================

/**
 * Busca todas as colunas do Kanban + leads com suas tags.
 */
export async function getKanbanData(): Promise<KanbanData> {
    const columnsData = await db
        .select({
            id: kanbanColumns.id,
            name: kanbanColumns.name,
            position: kanbanColumns.position,
            color: kanbanColumns.color,
        })
        .from(kanbanColumns)
        .where(isNull(kanbanColumns.deletedAt))
        .orderBy(asc(kanbanColumns.position));

    const leadsData = await db
        .select()
        .from(leads)
        .where(isNull(leads.deletedAt))
        .orderBy(asc(leads.kanbanPosition));

    // Buscar tags dos leads
    const leadsWithTags: KanbanLead[] = await Promise.all(
        leadsData.map(async (lead) => {
            const leadTagsData = await db
                .select({
                    id: tags.id,
                    name: tags.name,
                    color: tags.color,
                })
                .from(leadTags)
                .innerJoin(tags, eq(leadTags.tagId, tags.id))
                .where(eq(leadTags.leadId, lead.id));

            return {
                id: lead.id,
                nomeEscola: lead.nomeEscola,
                temperatura: lead.temperatura,
                dataEvento: lead.dataEvento,
                destino: lead.destino,
                quantidadeAlunos: lead.quantidadeAlunos,
                kanbanColumnId: lead.kanbanColumnId,
                kanbanPosition: lead.kanbanPosition,
                iaAtiva: lead.iaAtiva,
                createdAt: lead.createdAt,
                tags: leadTagsData,
            };
        })
    );

    return { columns: columnsData, leads: leadsWithTags };
}

/**
 * Retorna todas as colunas do Kanban ordenadas por posição.
 */
export async function getKanbanColumns() {
    return db
        .select()
        .from(kanbanColumns)
        .where(isNull(kanbanColumns.deletedAt))
        .orderBy(asc(kanbanColumns.position));
}

/**
 * Move um lead para outra coluna e/ou posição.
 */
export async function moveLeadInKanban(
    leadId: string,
    targetColumnId: string,
    newPosition: number
) {
    await db
        .update(leads)
        .set({
            kanbanColumnId: targetColumnId,
            kanbanPosition: newPosition,
            updatedAt: new Date(),
        })
        .where(eq(leads.id, leadId));

    revalidatePath("/kanban");
    return { success: true };
}

/**
 * Cria uma nova coluna no Kanban.
 */
export async function createKanbanColumn(name: string, color?: string) {
    const existing = await db
        .select({ position: kanbanColumns.position })
        .from(kanbanColumns)
        .where(isNull(kanbanColumns.deletedAt))
        .orderBy(asc(kanbanColumns.position));

    const nextPosition =
        existing.length > 0
            ? Math.max(...existing.map((c) => c.position)) + 1
            : 0;

    const [created] = await db
        .insert(kanbanColumns)
        .values({
            name,
            position: nextPosition,
            color: color ?? "#6366f1",
        })
        .returning();

    revalidatePath("/kanban");
    return created;
}

/**
 * Renomeia uma coluna do Kanban.
 */
export async function renameKanbanColumn(id: string, name: string) {
    await db
        .update(kanbanColumns)
        .set({ name, updatedAt: new Date() })
        .where(eq(kanbanColumns.id, id));

    revalidatePath("/kanban");
    return { success: true };
}

/**
 * Remove uma coluna do Kanban (soft delete).
 * Só permite se não houver leads na coluna.
 */
export async function deleteKanbanColumn(id: string) {
    const leadsInColumn = await db
        .select({ id: leads.id })
        .from(leads)
        .where(and(eq(leads.kanbanColumnId, id), isNull(leads.deletedAt)))
        .limit(1);

    if (leadsInColumn.length > 0) {
        return { success: false, error: "Mova os leads antes de deletar a coluna." };
    }

    await db
        .update(kanbanColumns)
        .set({ deletedAt: new Date() })
        .where(eq(kanbanColumns.id, id));

    revalidatePath("/kanban");
    return { success: true };
}

/**
 * Reordena colunas do Kanban.
 */
export async function reorderKanbanColumns(columnIds: string[]) {
    await Promise.all(
        columnIds.map((id, index) =>
            db
                .update(kanbanColumns)
                .set({ position: index, updatedAt: new Date() })
                .where(eq(kanbanColumns.id, id))
        )
    );

    revalidatePath("/kanban");
    return { success: true };
}

/**
 * Cria as colunas padrão iniciais se não existir nenhuma.
 */
export async function seedDefaultColumns() {
    const existing = await db
        .select({ id: kanbanColumns.id })
        .from(kanbanColumns)
        .where(isNull(kanbanColumns.deletedAt))
        .limit(1);

    if (existing.length > 0) {
        return { message: "Colunas já existem, seed ignorado.", seeded: false };
    }

    const defaults = [
        { name: "Novo Lead", position: 0, color: "#8b5cf6" },
        { name: "Qualificação", position: 1, color: "#3b82f6" },
        { name: "Proposta Enviada", position: 2, color: "#f59e0b" },
        { name: "Agendado", position: 3, color: "#f97316" },
        { name: "Concluído", position: 4, color: "#22c55e" },
    ];

    const created = await db
        .insert(kanbanColumns)
        .values(defaults)
        .returning();

    revalidatePath("/kanban");
    return {
        message: `${created.length} colunas padrão criadas com sucesso!`,
        seeded: true,
        columns: created,
    };
}

/**
 * Cria um lead de teste para demo do Kanban.
 */
export async function createDemoLead(
    nomeEscola: string,
    kanbanColumnId: string,
    temperatura: string = "frio"
) {
    // Buscar maior posição na coluna
    const maxPos = await db
        .select({ maxPos: sql<number>`COALESCE(MAX(${leads.kanbanPosition}), -1)` })
        .from(leads)
        .where(
            and(eq(leads.kanbanColumnId, kanbanColumnId), isNull(leads.deletedAt))
        );

    const nextPos = (maxPos[0]?.maxPos ?? -1) + 1;

    const [created] = await db
        .insert(leads)
        .values({
            nomeEscola,
            kanbanColumnId,
            kanbanPosition: nextPos,
            temperatura,
        })
        .returning();

    revalidatePath("/kanban");
    return created;
}
