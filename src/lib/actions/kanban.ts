"use server";

// =============================================
// KANBAN ACTIONS (STUB)
// As tabelas kanban_columns e leads foram removidas do banco.
// Este arquivo é mantido como stub para evitar erros de build
// em páginas que ainda importam dele.
// TODO: Reimplementar kanban se necessário com nova estrutura.
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

export async function getKanbanData(): Promise<KanbanData> {
    return { columns: [], leads: [] };
}

export async function getKanbanColumns() {
    return [];
}

export async function moveLeadInKanban(leadId: string, targetColumnId: string, newPosition: number) {
    return { success: false, error: "Kanban desativado — tabelas removidas." };
}

export async function createKanbanColumn(name: string, color?: string): Promise<KanbanColumn | null> {
    return null;
}

export async function renameKanbanColumn(id: string, name: string) {
    return { success: false };
}

export async function deleteKanbanColumn(id: string) {
    return { success: false };
}

export async function reorderKanbanColumns(columnIds: string[]) {
    return { success: false };
}

export async function seedDefaultColumns() {
    return { message: "Kanban desativado.", seeded: false };
}

export async function createDemoLead(nomeEscola: string, kanbanColumnId: string, temperatura?: string) {
    return null;
}
