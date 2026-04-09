"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";

// =============================================
// TYPES
// =============================================

export type KanbanColumn = {
    id: string;
    name: string;
    slug: string | null;
    position: number;
    color: string | null;
};

export type KanbanLead = {
    id: string;
    nomeEscola: string;
    telefone: string;
    temperatura: string;
    dataEvento: string | null;
    destino: string | null;
    quantidadeAlunos: number | null;
    kanbanColumnId: string;
    kanbanPosition: number;
    iaAtiva: boolean;
    createdAt: Date | null;
    tasks: { id: string; text: string; done: boolean }[];
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
 * Busca todas as colunas e leads com kanban_column_id.
 */
export async function getKanbanData(): Promise<KanbanData> {
    await requireAuth();
    const supabase = createServerSupabaseClient();
    const [columnsRes, leadsRes] = await Promise.all([
        supabase
            .from("kanban_columns")
            .select("id, name, slug, position, color")
            .order("position", { ascending: true }),
        supabase
            .from("Clientes _WhatsApp")
            .select("*")
            .order("kanban_position", { ascending: true }),
    ]);

    if (columnsRes.error) {
        return { columns: [], leads: [] };
    }
    if (leadsRes.error) {
        return { columns: columnsRes.data.map(mapColumn), leads: [] };
    }

    const columns = columnsRes.data.map(mapColumn);
    const rawLeads = leadsRes.data || [];

    // Buscar tasks dos leads
    const telefones = rawLeads.map((l: Record<string, unknown>) => l.telefone).filter(Boolean);
    const tasksRes = telefones.length > 0
        ? await supabase
            .from("lead_tasks")
            .select("*")
            .in("telefone", telefones)
            .order("created_at", { ascending: true })
        : { data: [] };
    const allTasks = tasksRes.data;

    const leads: KanbanLead[] = rawLeads.map((row: Record<string, unknown>) => {
        const tel = row.telefone;
        let colId = row.kanban_column_id as string;
        
        // Se o lead não tem coluna, manda para a coluna "novo_lead"
        if (!colId) {
            const novoLeadCol = columns.find(c =>
                c.slug === "novo_lead" ||
                c.name?.toLowerCase() === "novo lead" ||
                c.name?.toLowerCase().includes("novo lead") ||
                c.position === 0
            );
            if (novoLeadCol) {
                colId = novoLeadCol.id;
            }
        }

        return {
            id: row.id as string,
            nomeEscola: (row.nome as string) || "Lead sem nome",
            telefone: String(row.telefone || ""),
            temperatura: (row.status as string) || "frio",
            dataEvento: null,
            destino: (row.destino as string) || null,
            quantidadeAlunos: null,
            kanbanColumnId: colId,
            kanbanPosition: (row.kanban_position as number) || 0,
            iaAtiva: (row.ia_ativa as boolean) ?? true,
            createdAt: row.created_at ? new Date(row.created_at as string) : null,
            tasks: (allTasks || []).filter((t: Record<string, unknown>) => t.telefone === tel).map((t: Record<string, unknown>) => ({
                id: t.id as string,
                text: t.text as string,
                done: t.done as boolean,
            })),
            tags: [],
        };
    });

    return { columns, leads };
}

/**
 * Retorna as colunas kanban ordenadas por posição.
 */
export async function getKanbanColumns(): Promise<KanbanColumn[]> {
    await requireAuth();
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
        .from("kanban_columns")
        .select("id, name, slug, position, color")
        .order("position", { ascending: true });

    if (error) {
        return [];
    }
    return (data || []).map(mapColumn);
}

// =============================================
// MUTATIONS
// =============================================

/**
 * Move um lead para uma coluna e posição.
 */
export async function moveLeadInKanban(
    leadId: string,
    targetColumnId: string | null,
    newPosition: number
) {
    await requireAuth();
    const supabase = createServerSupabaseClient();
    const { error } = await supabase
        .from("Clientes _WhatsApp")
        .update({
            kanban_column_id: targetColumnId,
            kanban_position: newPosition,
        })
        .eq("id", leadId);

    if (error) {
        return { success: false, error: error.message };
    }
    return { success: true };
}

/**
 * Cria uma nova coluna. slug fica null.
 */
export async function createKanbanColumn(
    name: string,
    color?: string
): Promise<KanbanColumn | null> {
    await requireAuth();
    const supabase = createServerSupabaseClient();
    const { data: existing } = await supabase
        .from("kanban_columns")
        .select("position")
        .order("position", { ascending: false })
        .limit(1);

    const nextPosition = existing && existing.length > 0
        ? (existing[0].position as number) + 1
        : 0;

    const { data, error } = await supabase
        .from("kanban_columns")
        .insert({
            name,
            color: color || "#6366f1",
            position: nextPosition,
        })
        .select("id, name, slug, position, color")
        .single();

    if (error) {
        return null;
    }
    return mapColumn(data);
}

/**
 * Renomeia uma coluna. Não altera slug.
 */
export async function renameKanbanColumn(id: string, name: string) {
    await requireAuth();
    const supabase = createServerSupabaseClient();
    const { error } = await supabase
        .from("kanban_columns")
        .update({ name })
        .eq("id", id);

    if (error) {
        return { success: false };
    }
    return { success: true };
}

/**
 * Deleta uma coluna (não protegida). Move leads para novo_lead antes.
 */
export async function deleteKanbanColumn(id: string) {
    await requireAuth();
    const supabase = createServerSupabaseClient();
    // Verificar se é protegida (tem slug)
    const { data: col } = await supabase
        .from("kanban_columns")
        .select("slug")
        .eq("id", id)
        .single();

    if (col?.slug === "novo_lead") {
        return { success: false, error: "Coluna protegida não pode ser deletada." };
    }

    // Buscar ID da coluna novo_lead
    const { data: novoLeadCol } = await supabase
        .from("kanban_columns")
        .select("id")
        .eq("slug", "novo_lead")
        .single();

    // Mover leads para novo_lead
    await supabase
        .from("Clientes _WhatsApp")
        .update({
            kanban_column_id: novoLeadCol?.id || null,
            kanban_position: 0,
        })
        .eq("kanban_column_id", id);

    // Deletar coluna
    const { error } = await supabase
        .from("kanban_columns")
        .delete()
        .eq("id", id);

    if (error) {
        return { success: false, error: error.message };
    }
    return { success: true };
}

/**
 * Seed colunas padrão se não existirem.
 */
export async function seedDefaultColumns() {
    await requireAuth();
    const supabase = createServerSupabaseClient();
    const { data: existing } = await supabase
        .from("kanban_columns")
        .select("id")
        .limit(1);

    if (existing && existing.length > 0) {
        return { message: "Colunas já existem.", seeded: false };
    }

    const defaultCols = [
        { name: "Novo Lead", color: "#3b82f6", position: 0 },
        { name: "Em Contato", color: "#f59e0b", position: 1 },
        { name: "Reunião Marcada", color: "#8b5cf6", position: 2 },
        { name: "Passeio Realizado", slug: "passeio_realizado", color: "#22c55e", position: 3 },
    ];

    const { error } = await supabase
        .from("kanban_columns")
        .insert(defaultCols);

    if (error) {
        return { message: `Erro: ${error.message}`, seeded: false };
    }

    return { message: "Colunas criadas com sucesso!", seeded: true };
}

/**
 * Reordena colunas kanban.
 */
export async function reorderKanbanColumns(columnIds: string[]) {
    await requireAuth();
    const supabase = createServerSupabaseClient();
    const newPositions = columnIds.map((_, index) => index);
    const { error } = await supabase.rpc("reorder_kanban_columns", {
        column_ids: columnIds,
        new_positions: newPositions,
    });

    if (error) {
        return { success: false, error: error.message };
    }
    return { success: true };
}

// =============================================
// LEAD TASKS CRUD
// =============================================

export async function getLeadTasks(telefone: number) {
    await requireAuth();
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
        .from("lead_tasks")
        .select("*")
        .eq("telefone", telefone)
        .order("created_at", { ascending: true });

    if (error) {
        return [];
    }

    return (data || []).map((t: Record<string, unknown>) => ({
        id: t.id as string,
        text: t.text as string,
        done: t.done as boolean,
    }));
}

export async function addLeadTask(telefone: number, text: string) {
    await requireAuth();
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
        .from("lead_tasks")
        .insert({ telefone, text })
        .select("*")
        .single();

    if (error) {
        return null;
    }

    return {
        id: data.id as string,
        text: data.text as string,
        done: data.done as boolean,
    };
}

export async function toggleLeadTask(id: string, done: boolean) {
    await requireAuth();
    const supabase = createServerSupabaseClient();
    const { error } = await supabase
        .from("lead_tasks")
        .update({ done })
        .eq("id", id);

    if (error) {
        return { success: false };
    }
    return { success: true };
}

export async function deleteLeadTask(id: string) {
    await requireAuth();
    const supabase = createServerSupabaseClient();
    const { error } = await supabase
        .from("lead_tasks")
        .delete()
        .eq("id", id);

    if (error) {
        return { success: false };
    }
    return { success: true };
}

// =============================================
// HELPERS
// =============================================

function mapColumn(row: Record<string, unknown>): KanbanColumn {
    return {
        id: row.id as string,
        name: row.name as string,
        slug: (row.slug as string) || null,
        position: (row.position as number) || 0,
        color: (row.color as string) || "#6366f1",
    };
}
