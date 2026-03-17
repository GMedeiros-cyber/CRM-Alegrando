"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCalendarClient } from "@/lib/google/calendar";

// =============================================
// DASHBOARD SERVER ACTIONS
// =============================================

/**
 * Conta total de leads (clientes) na tabela Clientes _WhatsApp.
 */
export async function getTotalLeads(): Promise<number> {
    const supabase = createServerSupabaseClient();
    const { count, error } = await supabase
        .from("Clientes _WhatsApp")
        .select("*", { count: "exact", head: true });

    if (error) {
        return 0;
    }
    return count || 0;
}

/**
 * Leads agrupados por mês (últimos 6 meses).
 */
export async function getLeadsPorMes(): Promise<{ mes: string; leads: number }[]> {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase.rpc("get_leads_por_mes");

    // Se a RPC não existir, fallback via query raw
    if (error) {

        // Fallback: buscar todos os leads dos últimos 6 meses e agrupar no JS
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const { data: leads, error: fallbackError } = await supabase
            .from("Clientes _WhatsApp")
            .select("created_at")
            .gte("created_at", sixMonthsAgo.toISOString())
            .order("created_at", { ascending: true });

        if (fallbackError || !leads) {
            return [];
        }

        // Agrupar por mês no JS
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

    return (data || []).map((row: { mes: string; leads: number }) => ({
        mes: row.mes,
        leads: Number(row.leads),
    }));
}

/**
 * Top 5 destinos do mês atual, da tabela destinos_interesse.
 */
export async function getTopDestinos(): Promise<{ destino: string; total: number }[]> {
    const supabase = createServerSupabaseClient();
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

    const { data, error } = await supabase
        .from("destinos_interesse")
        .select("destino")
        .gte("created_at", firstDay)
        .lte("created_at", lastDay);

    if (error) {
        return [];
    }

    if (!data || data.length === 0) return [];

    // Agrupar no JS e pegar top 5
    const groups: Record<string, number> = {};
    for (const row of data) {
        if (!row.destino) continue;
        groups[row.destino] = (groups[row.destino] || 0) + 1;
    }

    return Object.entries(groups)
        .map(([destino, total]) => ({ destino, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);
}

/**
 * Conta eventos do Google Calendar a partir de hoje.
 */
export async function getEventosDoMes(): Promise<number> {
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
    } catch {
        return 0;
    }
}

/**
 * Conta passeios confirmados no mês atual via passeios_realizados.
 */
export async function getTotalPasseiosDoMes(): Promise<number> {
    const supabase = createServerSupabaseClient();
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];

    const { count, error } = await supabase
        .from("passeios_realizados")
        .select("*", { count: "exact", head: true })
        .gte("data_passeio", firstDay)
        .lte("data_passeio", lastDay);

    if (error) {
        return 0;
    }
    return count || 0;
}
