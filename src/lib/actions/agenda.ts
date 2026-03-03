"use server";

// =============================================
// AGENDA ACTIONS (STUB)
// A tabela agendamentos foi removida do banco.
// Este arquivo é mantido como stub para evitar erros de build.
// TODO: Reimplementar agenda se necessário com nova estrutura.
// =============================================

export type AgendamentoEvent = {
    id: string;
    leadId: string;
    title: string;
    start: string;
    end: string;
    backgroundColor: string;
    borderColor: string;
    nomeEscola: string;
    destino: string | null;
    quantidadeAlunos: number | null;
    status: string;
};

export async function getAgendamentos(): Promise<AgendamentoEvent[]> {
    return [];
}
