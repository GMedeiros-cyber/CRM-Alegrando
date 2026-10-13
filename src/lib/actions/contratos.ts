"use server";

import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { STATUS_CONTRATO, type StatusContrato } from "@/lib/contratos-status";

/**
 * Contratos do lead — um por passeio.
 *
 * Toda escrita passa por aqui, pelo servidor. A policy de `public.contratos`
 * dá SELECT a `authenticated` e nada mais; INSERT/UPDATE/DELETE são do
 * `service_role`. Tentar gravar pelo cliente toma erro de RLS.
 */


export type Contrato = {
    id: string;
    leadId: string;
    dataPasseio: string | null;
    destino: string | null;
    qtdAlunos: number | null;
    qtdProfessores: number | null;
    valorPorAluno: number | null;
    valorTotal: number | null;
    formaPagamento: string | null;
    observacoes: string | null;
    status: StatusContrato;
};

const COLUNAS =
    "id, lead_id, data_passeio, destino, qtd_alunos, qtd_professores, valor_por_aluno, valor_total, forma_pagamento, observacoes, status";

type LinhaContrato = {
    id: string;
    lead_id: string;
    data_passeio: string | null;
    destino: string | null;
    qtd_alunos: number | null;
    qtd_professores: number | null;
    valor_por_aluno: string | number | null;
    valor_total: string | number | null;
    forma_pagamento: string | null;
    observacoes: string | null;
    status: string;
};

/** `numeric` do Postgres chega como string no supabase-js: converte sem perder null. */
function numero(v: string | number | null): number | null {
    if (v === null || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
}

function paraContrato(r: LinhaContrato): Contrato {
    return {
        id: r.id,
        leadId: r.lead_id,
        dataPasseio: r.data_passeio,
        destino: r.destino,
        qtdAlunos: r.qtd_alunos,
        qtdProfessores: r.qtd_professores,
        valorPorAluno: numero(r.valor_por_aluno),
        valorTotal: numero(r.valor_total),
        formaPagamento: r.forma_pagamento,
        observacoes: r.observacoes,
        status: (STATUS_CONTRATO as readonly string[]).includes(r.status)
            ? (r.status as StatusContrato)
            : "rascunho",
    };
}

// Espelha os CHECKs da migration: erro legível aqui, erro cru no banco não.
const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida").nullable().optional();
const inteiroPositivo = z.number().int().min(0).max(100000).nullable().optional();
const valor = z.number().min(0).max(99999999.99).nullable().optional();

const camposSchema = z.object({
    dataPasseio: dataIso,
    destino: z.string().trim().max(200).nullable().optional(),
    qtdAlunos: inteiroPositivo,
    qtdProfessores: inteiroPositivo,
    valorPorAluno: valor,
    valorTotal: valor,
    formaPagamento: z.string().trim().max(120).nullable().optional(),
    observacoes: z.string().trim().max(4000).nullable().optional(),
    status: z.enum(STATUS_CONTRATO).optional(),
});

export type CamposContrato = z.infer<typeof camposSchema>;

type Resultado = { ok: true; contrato: Contrato } | { ok: false; error: string };

/** Nomes de coluna a partir dos campos validados. Só o que veio é escrito. */
function paraLinha(c: CamposContrato): Record<string, unknown> {
    const l: Record<string, unknown> = {};
    if (c.dataPasseio !== undefined) l.data_passeio = c.dataPasseio;
    if (c.destino !== undefined) l.destino = c.destino || null;
    if (c.qtdAlunos !== undefined) l.qtd_alunos = c.qtdAlunos;
    if (c.qtdProfessores !== undefined) l.qtd_professores = c.qtdProfessores;
    if (c.valorPorAluno !== undefined) l.valor_por_aluno = c.valorPorAluno;
    if (c.valorTotal !== undefined) l.valor_total = c.valorTotal;
    if (c.formaPagamento !== undefined) l.forma_pagamento = c.formaPagamento || null;
    if (c.observacoes !== undefined) l.observacoes = c.observacoes || null;
    if (c.status !== undefined) l.status = c.status;
    return l;
}

/**
 * Contratos do lead, do passeio mais recente para o mais antigo — a mesma
 * ordem do índice `contratos_lead_data_idx`.
 */
export async function listContratos(leadId: string): Promise<Contrato[]> {
    await requireAuth();
    if (!z.string().uuid().safeParse(leadId).success) return [];
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
        .from("contratos")
        .select(COLUNAS)
        .eq("lead_id", leadId)
        .order("data_passeio", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
    if (error) {
        console.error("[listContratos]", error.message);
        return [];
    }
    return ((data ?? []) as unknown as LinhaContrato[]).map(paraContrato);
}

export async function createContrato(leadId: string, campos: CamposContrato): Promise<Resultado> {
    await requireAuth();
    if (!z.string().uuid().safeParse(leadId).success) return { ok: false, error: "Lead inválido." };
    const parsed = camposSchema.safeParse(campos);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
        .from("contratos")
        .insert({ lead_id: leadId, ...paraLinha(parsed.data) })
        .select(COLUNAS)
        .single();
    if (error) {
        console.error("[createContrato]", error.message);
        // 23503 = FK: o lead não existe (ou foi apagado entre abrir e salvar).
        return { ok: false, error: error.code === "23503" ? "Lead não encontrado." : error.message };
    }
    return { ok: true, contrato: paraContrato(data as unknown as LinhaContrato) };
}

export async function updateContrato(id: string, campos: CamposContrato): Promise<Resultado> {
    await requireAuth();
    if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Contrato inválido." };
    const parsed = camposSchema.safeParse(campos);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

    const linha = paraLinha(parsed.data);
    if (Object.keys(linha).length === 0) return { ok: false, error: "Nada para salvar." };

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
        .from("contratos")
        .update(linha)
        .eq("id", id)
        .select(COLUNAS)
        .single();
    if (error) {
        console.error("[updateContrato]", error.message);
        return { ok: false, error: error.message };
    }
    return { ok: true, contrato: paraContrato(data as unknown as LinhaContrato) };
}

export async function deleteContrato(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
    await requireAuth();
    if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Contrato inválido." };
    const supabase = createServerSupabaseClient();
    const { error } = await supabase.from("contratos").delete().eq("id", id);
    if (error) {
        console.error("[deleteContrato]", error.message);
        return { ok: false, error: error.message };
    }
    return { ok: true };
}
