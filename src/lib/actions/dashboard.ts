"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { getCalendarClient } from "@/lib/google/calendar";

// =============================================
// DASHBOARD SERVER ACTIONS
// =============================================

/**
 * Conta total de leads (clientes) na tabela Clientes _WhatsApp.
 */
export async function getTotalLeads(): Promise<number> {
    await requireAuth();
    const supabase = createServerSupabaseClient();
    const { count, error } = await supabase
        .from("Clientes _WhatsApp")
        .select("*", { count: "exact", head: true });

    if (error) {
        return 0;
    }
    return count || 0;
}

export async function getTotalLeadsByCanal(): Promise<{
    total: number;
    alegrando: number;
    festas: number;
}> {
    await requireAuth();
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
        .from("Clientes _WhatsApp")
        .select("canal");

    if (error || !data) return { total: 0, alegrando: 0, festas: 0 };

    const alegrando = data.filter((r) => r.canal === "alegrando" || !r.canal).length;
    const festas = data.filter((r) => r.canal === "festas").length;
    return { total: data.length, alegrando, festas };
}

/**
 * Estatísticas de IA: quantos contatos com IA ativa vs. modo manual.
 */
export async function getIaAtivaStats(): Promise<{
    iaAtiva: number;
    manual: number;
    total: number;
}> {
    await requireAuth();
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
        .from("Clientes _WhatsApp")
        .select("ia_ativa");

    if (error || !data) return { iaAtiva: 0, manual: 0, total: 0 };

    const iaAtiva = data.filter((r) => r.ia_ativa === true).length;
    const manual = data.length - iaAtiva;
    return { iaAtiva, manual, total: data.length };
}

/**
 * Leads agrupados por mês (últimos 6 meses). Opcionalmente filtra por canal
 * ("alegrando" | "festas") — útil pra UI que alterna entre os dois canais.
 */
export async function getLeadsPorMes(
    canal?: "alegrando" | "festas"
): Promise<{ mes: string; leads: number }[]> {
    await requireAuth();
    const supabase = createServerSupabaseClient();

    // Fallback: buscar todos os leads dos últimos 6 meses e agrupar no JS.
    // A RPC `get_leads_por_mes` não existe no banco, então sempre caímos aqui;
    // aproveito pra suportar filtro por canal direto na query.
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

/**
 * Conta eventos do Google Calendar a partir de hoje.
 */
export async function getEventosDoMes(): Promise<number> {
    await requireAuth();
    try {
        const calendar = getCalendarClient();
        const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";

        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const now = new Date();
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        const response = await calendar.events.list({
            calendarId,
            timeMin: startOfToday.toISOString(),
            timeMax: lastDay.toISOString(),
            singleEvents: true,
            maxResults: 250,
        });

        return response.data.items?.length || 0;
    } catch (err) {
        console.error("[dashboard] Erro ao buscar eventos Google:", err);
        return 0;
    }
}

/**
 * Conta passeios do mês atual via campo ultimo_passeio da Clientes _WhatsApp.
 */
/**
 * Lista leads que fizeram passeio no mês atual (para expandir no card).
 */
export async function getPasseiosDoMes(): Promise<{ nome: string; telefone: string; destino: string | null; data: string }[]> {
    await requireAuth();
    const supabase = createServerSupabaseClient();
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];

    const { data, error } = await supabase
        .from("Clientes _WhatsApp")
        .select("Nome, Telefone, destino, ultimo_passeio")
        .gte("ultimo_passeio", firstDay)
        .lte("ultimo_passeio", lastDay)
        .order("ultimo_passeio", { ascending: false });

    if (error || !data) return [];

    return data.map((row: { Nome?: string; Telefone?: number; destino?: string; ultimo_passeio?: string }) => ({
        nome: row.Nome || "Sem nome",
        telefone: String(row.Telefone || ""),
        destino: row.destino || null,
        data: row.ultimo_passeio || "",
    }));
}

/**
 * Conta passeios do mês atual via campo ultimo_passeio da Clientes _WhatsApp.
 */
export async function getTotalPasseiosDoMes(): Promise<number> {
    await requireAuth();
    const supabase = createServerSupabaseClient();
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];

    const { count, error } = await supabase
        .from("Clientes _WhatsApp")
        .select("*", { count: "exact", head: true })
        .gte("ultimo_passeio", firstDay)
        .lte("ultimo_passeio", lastDay);

    if (error) {
        return 0;
    }
    return count || 0;
}

/**
 * Lista leads com follow-up ativo.
 */
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
