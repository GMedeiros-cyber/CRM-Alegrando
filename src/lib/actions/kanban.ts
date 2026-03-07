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
    telefone?: string;
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
    const [columnsRes, leadsRes] = await Promise.all([
        supabase
            .from("kanban_columns")
            .select("id, name, slug, position, color")
            .order("position", { ascending: true }),
        supabase
            .from("Clientes _WhatsApp")
            .select("id, nome, status, status_atendimento, ia_ativa, created_at, kanban_column_id, kanban_position, passeio_confirmado, data_passeio")
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
    const leads: KanbanLead[] = (leadsRes.data || []).map((row: Record<string, unknown>) => ({
        id: row.id as string,
        nomeEscola: (row.nome as string) || "Lead sem nome",
        temperatura: (row.status as string) || "frio",
        dataEvento: null,
        destino: null,
        quantidadeAlunos: null,
        kanbanColumnId: row.kanban_column_id as string,
        kanbanPosition: (row.kanban_position as number) || 0,
        iaAtiva: (row.ia_ativa as boolean) ?? true,
        createdAt: row.created_at ? new Date(row.created_at as string) : null,
        passeioConfirmado: (row.passeio_confirmado as boolean) ?? false,
        dataPasseio: row.data_passeio ? String(row.data_passeio) : null,
        ultimoPasseio: null,
        totalPasseios: 0,
        tags: [],
    }));

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
 * Confirma passeio realizado.
 * 1) Busca lead para pegar telefone e destino
 * 2) INSERT em passeios_realizados
 * 3) UPDATE data_passeio em Clientes_WhatsApp
 */
export async function confirmPasseioRealizado(
    leadId: string,
    dataPasseio: string
) {
    // 1. Buscar lead
    const { data: lead, error: leadErr } = await supabase
        .from("Clientes _WhatsApp")
        .select("telefone, destino")
        .eq("id", leadId)
        .single();

    if (leadErr || !lead) {
        console.error("Erro ao buscar lead:", leadErr);
        return { success: false, error: "Lead não encontrado." };
    }

    // 2. INSERT em passeios_realizados
    const { error: insertErr } = await supabase
        .from("passeios_realizados")
        .insert({
            telefone: lead.telefone,
            data_passeio: dataPasseio,
            destino: lead.destino || null,
        });

    if (insertErr) {
        console.error("Erro ao inserir passeio:", insertErr);
        return { success: false, error: insertErr.message };
    }

    // 3. UPDATE data_passeio no lead
    await supabase
        .from("Clientes _WhatsApp")
        .update({ data_passeio: dataPasseio })
        .eq("id", leadId);

    return { success: true };
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
    const { data, error } = await supabase
        .from("Clientes _WhatsApp")
        .select("id, nome, telefone, status, ia_ativa, created_at, passeio_confirmado, data_passeio")
        .is("kanban_column_id", null)
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Erro ao buscar leads sem coluna:", error);
        return [];
    }

    const leads = data || [];
    if (leads.length === 0) return [];

    // Buscar telefones para fazer join com passeios_realizados
    const telefones = leads.map((l: Record<string, unknown>) => l.telefone).filter(Boolean);
    const { data: passeios } = await supabase
        .from("passeios_realizados")
        .select("telefone, data_passeio, destino")
        .in("telefone", telefones)
        .order("data_passeio", { ascending: false });

    // Agrupar passeios por telefone
    const passeiosPorTel: Record<string, { data: string; destino: string | null }[]> = {};
    for (const p of (passeios || [])) {
        const tel = String(p.telefone);
        if (!passeiosPorTel[tel]) passeiosPorTel[tel] = [];
        passeiosPorTel[tel].push({ data: p.data_passeio, destino: p.destino || null });
    }

    return leads.map((row: Record<string, unknown>) => {
        const tel = String(row.telefone || "");
        const meus = passeiosPorTel[tel] || [];
        return {
            id: row.id as string,
            nomeEscola: (row.nome as string) || "Lead sem nome",
            telefone: tel,
            temperatura: (row.status as string) || "frio",
            dataEvento: null,
            destino: null,
            quantidadeAlunos: null,
            kanbanColumnId: "",
            kanbanPosition: 0,
            iaAtiva: (row.ia_ativa as boolean) ?? true,
            createdAt: row.created_at ? new Date(row.created_at as string) : null,
            passeioConfirmado: (row.passeio_confirmado as boolean) ?? false,
            dataPasseio: row.data_passeio ? String(row.data_passeio) : null,
            ultimoPasseio: meus.length > 0 ? meus[0] : null,
            totalPasseios: meus.length,
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
