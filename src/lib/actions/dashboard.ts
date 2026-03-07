"use server";

import { supabase } from "@/lib/supabase/client";
import { getCalendarClient } from "@/lib/google/calendar";

// =============================================
// DASHBOARD SERVER ACTIONS
// =============================================

/**
 * Conta total de leads (clientes) na tabela Clientes _WhatsApp.
 */
export async function getTotalLeads(): Promise<number> {
    const { count, error } = await supabase
        .from("Clientes _WhatsApp")
        .select("*", { count: "exact", head: true });

    if (error) {
        console.error("Erro ao contar leads:", error);
        return 0;
    }
    return count || 0;
}

/**
 * Leads agrupados por mês (últimos 6 meses).
 */
export async function getLeadsPorMes(): Promise<{ mes: string; leads: number }[]> {
    const { data, error } = await supabase.rpc("get_leads_por_mes");

    // Se a RPC não existir, fallback via query raw
    if (error) {
        console.error("Erro na RPC get_leads_por_mes, tentando fallback:", error);

        // Fallback: buscar todos os leads dos últimos 6 meses e agrupar no JS
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const { data: leads, error: fallbackError } = await supabase
            .from("Clientes _WhatsApp")
            .select("created_at")
            .gte("created_at", sixMonthsAgo.toISOString())
            .order("created_at", { ascending: true });

        if (fallbackError || !leads) {
            console.error("Erro no fallback:", fallbackError);
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
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

    const { data, error } = await supabase
        .from("destinos_interesse")
        .select("destino")
        .gte("created_at", firstDay)
        .lte("created_at", lastDay);

    if (error) {
        console.error("Erro ao buscar destinos:", error);
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
 * Conta eventos do Google Calendar no mês atual.
 */
export async function getEventosDoMes(): Promise<number> {
    try {
        const calendar = getCalendarClient();
        const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";

        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        const response = await calendar.events.list({
            calendarId,
            timeMin: firstDay.toISOString(),
            timeMax: lastDay.toISOString(),
            singleEvents: true,
            maxResults: 250,
        });

        return response.data.items?.length || 0;
    } catch (err) {
        console.error("Erro ao contar eventos do mês:", err);
        return 0;
    }
}
