"use server";

import { supabase } from "@/lib/supabase/client";

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
    passeioConfirmado: boolean;
    dataPasseio: string | null;
    ultimoPasseio: { data: string; destino: string | null } | null;
    totalPasseios: number;
    tags: { id: string; name: string; color: string }[];
};

export type PasseioRealizado = {
    id: string;
    telefone: number;
    dataPasseio: string;
    destino: string | null;
    createdAt: string;
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
    // 1. Buscar colunas e leads separadamente
    const [columnsRes, leadsRes] = await Promise.all([
        supabase
            .from("kanban_columns")
            .select("id, name, slug, position, color")
            .order("position", { ascending: true }),
        supabase
            .from("Clientes _WhatsApp")
            .select("*")
            .not("kanban_column_id", "is", null)
            .order("kanban_position", { ascending: true }),
    ]);

    if (columnsRes.error) {
        console.error("Erro ao buscar colunas:", columnsRes.error);
        return { columns: [], leads: [] };
    }
    if (leadsRes.error) {
        console.error("Erro ao buscar leads:", leadsRes.error);
        return { columns: columnsRes.data.map(mapColumn), leads: [] };
    }

    const columns = columnsRes.data.map(mapColumn);
    const rawLeads = leadsRes.data || [];

    // 2. Buscar passeios para os leads do board
    const telefones = rawLeads.map((l: Record<string, unknown>) => l.telefone).filter(Boolean);
    const { data: passeios } = telefones.length > 0
        ? await supabase
            .from("passeios_realizados")
            .select("*")
            .in("telefone", telefones)
            .order("created_at", { ascending: false })
        : { data: [] };

    // 3. Montar leads com passeios
    const leads: KanbanLead[] = rawLeads.map((row: Record<string, unknown>) => {
        const tel = row.telefone;
        const passeiosDoLead = (passeios || []).filter((p: Record<string, unknown>) => p.telefone === tel);
        const ultimoPasseio = passeiosDoLead[0] || null;

        return {
            id: row.id as string,
            nomeEscola: (row.nome as string) || "Lead sem nome",
            telefone: String(row.telefone || ""),
            temperatura: (row.status as string) || "frio",
            dataEvento: null,
            destino: (row.destino as string) || null,
            quantidadeAlunos: null,
            kanbanColumnId: row.kanban_column_id as string,
            kanbanPosition: (row.kanban_position as number) || 0,
            iaAtiva: (row.ia_ativa as boolean) ?? true,
            createdAt: row.created_at ? new Date(row.created_at as string) : null,
            passeioConfirmado: passeiosDoLead.length > 0,
            dataPasseio: row.data_passeio ? String(row.data_passeio) : null,
            ultimoPasseio: ultimoPasseio ? {
                data: ultimoPasseio.data_passeio as string,
                destino: (ultimoPasseio.destino as string) || null,
            } : null,
            totalPasseios: passeiosDoLead.length,
            tags: [],
        };
    });

    return { columns, leads };
}

/**
 * Retorna as colunas kanban ordenadas por posição.
 */
export async function getKanbanColumns(): Promise<KanbanColumn[]> {
    const { data, error } = await supabase
        .from("kanban_columns")
        .select("id, name, slug, position, color")
        .order("position", { ascending: true });

    if (error) {
        console.error("Erro ao buscar colunas:", error);
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
    const { error } = await supabase
        .from("Clientes _WhatsApp")
        .update({
            kanban_column_id: targetColumnId,
            kanban_position: newPosition,
        })
        .eq("id", leadId);

    if (error) {
        console.error("Erro ao mover lead:", error);
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
    // Pegar a maior position atual
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
        console.error("Erro ao criar coluna:", error);
        return null;
    }
    return mapColumn(data);
}

/**
 * Renomeia uma coluna. Não altera slug.
 */
export async function renameKanbanColumn(id: string, name: string) {
    const { error } = await supabase
        .from("kanban_columns")
        .update({ name })
        .eq("id", id);

    if (error) {
        console.error("Erro ao renomear coluna:", error);
        return { success: false };
    }
    return { success: true };
}

/**
 * Deleta uma coluna (não protegida). Move leads para null antes.
 */
export async function deleteKanbanColumn(id: string) {
    // Verificar se é protegida (tem slug)
    const { data: col } = await supabase
        .from("kanban_columns")
        .select("slug")
        .eq("id", id)
        .single();

    if (col?.slug) {
        return { success: false, error: "Coluna protegida não pode ser deletada." };
    }

    // Mover leads da coluna para null
    await supabase
        .from("Clientes _WhatsApp")
        .update({ kanban_column_id: null, kanban_position: 0 })
        .eq("kanban_column_id", id);

    // Deletar coluna
    const { error } = await supabase
        .from("kanban_columns")
        .delete()
        .eq("id", id);

    if (error) {
        console.error("Erro ao deletar coluna:", error);
        return { success: false, error: error.message };
    }
    return { success: true };
}

/**
 * Confirma passeio realizado por telefone.
 * Data = agora. Recebe telefone diretamente.
 */
export async function confirmPasseioRealizado(
    telefone: string,
    destino?: string | null
) {
    const now = new Date();
    const dataPasseio = now.toISOString().split("T")[0];

    // 1. INSERT em passeios_realizados
    const { error: insertErr } = await supabase
        .from("passeios_realizados")
        .insert({
            telefone: Number(telefone),
            data_passeio: dataPasseio,
            destino: destino || null,
        });

    if (insertErr) {
        console.error("Erro ao inserir passeio:", insertErr);
        return { success: false, error: insertErr.message };
    }

    // 2. UPDATE data_passeio no lead
    await supabase
        .from("Clientes _WhatsApp")
        .update({ data_passeio: dataPasseio })
        .eq("telefone", Number(telefone));

    return { success: true, dataPasseio };
}

/**
 * Seed colunas padrão se não existirem.
 */
export async function seedDefaultColumns() {
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
        console.error("Erro no seed:", error);
        return { message: `Erro: ${error.message}`, seeded: false };
    }

    return { message: "Colunas criadas com sucesso!", seeded: true };
}

/**
 * Reordena colunas kanban.
 */
export async function reorderKanbanColumns(columnIds: string[]) {
    const updates = columnIds.map((id, index) =>
        supabase.from("kanban_columns").update({ position: index }).eq("id", id)
    );

    await Promise.all(updates);
    return { success: true };
}

/**
 * Leads sem coluna + dados de passeios realizados.
 */
export async function getLeadsSemColuna(): Promise<KanbanLead[]> {
    // 1. Buscar leads sem coluna
    const { data: leads, error } = await supabase
        .from("Clientes _WhatsApp")
        .select("*")
        .is("kanban_column_id", null)
        .order("created_at", { ascending: false });

    if (error || !leads) {
        console.error("Erro ao buscar leads sem coluna:", error);
        return [];
    }
    if (leads.length === 0) return [];

    // 2. Para cada lead, buscar passeios
    const telefones = leads.map((l: Record<string, unknown>) => l.telefone).filter(Boolean);

    const { data: passeios } = await supabase
        .from("passeios_realizados")
        .select("*")
        .in("telefone", telefones)
        .order("created_at", { ascending: false });

    // 3. Montar o objeto KanbanLead com ultimo passeio
    return leads.map((lead: Record<string, unknown>) => {
        const passeiosDoLead = (passeios || []).filter(
            (p: Record<string, unknown>) => p.telefone === lead.telefone
        );
        const ultimoPasseio = passeiosDoLead[0] || null;

        return {
            id: lead.id as string,
            telefone: String(lead.telefone || ""),
            nomeEscola: (lead.nome as string) || "Sem nome",
            temperatura: (lead.status as string) || "frio",
            dataEvento: null,
            destino: null,
            quantidadeAlunos: null,
            kanbanColumnId: "",
            kanbanPosition: 0,
            iaAtiva: (lead.ia_ativa as boolean) ?? true,
            createdAt: lead.created_at ? new Date(lead.created_at as string) : null,
            passeioConfirmado: passeiosDoLead.length > 0,
            dataPasseio: lead.data_passeio ? String(lead.data_passeio) : null,
            ultimoPasseio: ultimoPasseio
                ? {
                    data: ultimoPasseio.data_passeio as string,
                    destino: (ultimoPasseio.destino as string) || null,
                }
                : null,
            totalPasseios: passeiosDoLead.length,
            tags: [],
        };
    });
}

/**
 * Busca todos os passeios de um lead pelo telefone.
 */
export async function getPasseiosDoLead(telefone: number): Promise<PasseioRealizado[]> {
    const { data, error } = await supabase
        .from("passeios_realizados")
        .select("id, telefone, data_passeio, destino, created_at")
        .eq("telefone", telefone)
        .order("data_passeio", { ascending: false });

    if (error) {
        console.error("Erro ao buscar passeios do lead:", error);
        return [];
    }

    return (data || []).map((row: Record<string, unknown>) => ({
        id: row.id as string,
        telefone: row.telefone as number,
        dataPasseio: row.data_passeio as string,
        destino: (row.destino as string) || null,
        createdAt: row.created_at as string,
    }));
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
