"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";

// =============================================
// DASHBOARD STATS — RPC agregada (substitui 3 fetches)
// =============================================

export type DashboardStats = {
    leadsTotal: number;
    leadsAlegrando: number;
    leadsFestas: number;
    iaAtiva: number;
    iaManual: number;
    followupsCount: number;
};

export async function getDashboardStats(): Promise<DashboardStats> {
    await requireAuth();
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase.rpc("get_dashboard_stats");

    if (error || !data) {
        console.error("[dashboard] Erro em get_dashboard_stats:", error?.message);
        return {
            leadsTotal: 0,
            leadsAlegrando: 0,
            leadsFestas: 0,
            iaAtiva: 0,
            iaManual: 0,
            followupsCount: 0,
        };
    }

    const row = data as Record<string, number>;
    return {
        leadsTotal:     row.leads_total     ?? 0,
        leadsAlegrando: row.leads_alegrando ?? 0,
        leadsFestas:    row.leads_festas    ?? 0,
        iaAtiva:        row.ia_ativa        ?? 0,
        iaManual:       row.ia_manual       ?? 0,
        followupsCount: row.followups_count ?? 0,
    };
}

// =============================================
// LEADS POR MÊS — chart-specific
// =============================================

export async function getLeadsPorMes(
    canal?: "alegrando" | "festas"
): Promise<{ mes: string; leads: number }[]> {
    await requireAuth();
    const supabase = createServerSupabaseClient();

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    let query = supabase
        .from("Clientes _WhatsApp")
        .select("created_at")
        .gte("created_at", sixMonthsAgo.toISOString())
        .order("created_at", { ascending: true });

    if (canal) {
        query = query.eq("canal", canal);
    }

    const { data: leads, error } = await query;

    if (error || !leads) {
        return [];
    }

    const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    const groups: Record<string, number> = {};

    for (const lead of leads) {
        if (!lead.created_at) continue;
        const d = new Date(lead.created_at);
        const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
        groups[key] = (groups[key] || 0) + 1;
    }

    return Object.entries(groups)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, count]) => {
            const [, monthStr] = key.split("-");
            return { mes: meses[parseInt(monthStr)], leads: count };
        });
}

// =============================================
// FOLLOW-UPS ATIVOS — lista detalhada para o card
// =============================================

export async function getFollowupsAtivos(): Promise<{
    telefone: string;
    nome: string;
    ultimoPasseio: string | null;
    followupDias: number;
    followupHora: string;
    followupEnviado: boolean;
}[]> {
    await requireAuth();
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
        .from("Clientes _WhatsApp")
        .select("telefone, nome, ultimo_passeio, followup_dias, followup_hora, followup_enviado")
        .eq("followup_ativo", true)
        .order("ultimo_passeio", { ascending: false });

    if (error || !data) return [];

    return data.map(d => ({
        telefone: String(d.telefone),
        nome: d.nome || "Sem nome",
        ultimoPasseio: d.ultimo_passeio || null,
        followupDias: d.followup_dias ?? 45,
        followupHora: d.followup_hora || "09:00",
        followupEnviado: d.followup_enviado ?? false,
    }));
}
