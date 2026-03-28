"use server";

import { getCalendarClient } from "@/lib/google/calendar";
import { requireAuth } from "@/lib/auth";

// =============================================
// TYPES
// =============================================
export type AgendamentoEvent = {
    id: string;
    title: string;
    start: string;
    end: string;
    backgroundColor: string;
    borderColor: string;
    textColor: string;
    extendedProps: {
        leadId: string;
        nomeEscola: string;
        destino: string | null;
        quantidadeAlunos: number | null;
        status: string;
        googleEventId: string;
        description: string;
    };
};

// Mapa de colorId do Google → cor hex
const GOOGLE_COLOR_MAP: Record<string, string> = {
    "1": "#7986cb", // Lavanda
    "2": "#33b679", // Salvia
    "3": "#8e24aa", // Uva
    "4": "#e67c73", // Flamingo
    "5": "#f6bf26", // Banana
    "6": "#f4511e", // Tangerina
    "7": "#039be5", // Pavão
    "8": "#616161", // Grafite
    "9": "#3f51b5", // Mirtilo
    "10": "#0b8043", // Manjericão
    "11": "#d50000", // Tomate
};

const DEFAULT_COLOR = "#ef5544";

function eventToAgendamento(event: {
    id?: string | null;
    summary?: string | null;
    description?: string | null;
    start?: { dateTime?: string | null; date?: string | null } | null;
    end?: { dateTime?: string | null; date?: string | null } | null;
    colorId?: string | null;
    extendedProperties?: {
        private?: Record<string, string> | null;
    } | null;
}): AgendamentoEvent {
    const color = event.colorId
        ? GOOGLE_COLOR_MAP[event.colorId] || DEFAULT_COLOR
        : DEFAULT_COLOR;

    const priv = event.extendedProperties?.private || {};

    return {
        id: event.id || "",
        title: event.summary || "Sem título",
        start: event.start?.dateTime || event.start?.date || "",
        end: event.end?.dateTime || event.end?.date || "",
        backgroundColor: color,
        borderColor: color,
        textColor: "#ffffff",
        extendedProps: {
            leadId: priv.leadId || "",
            nomeEscola: priv.nomeEscola || event.summary || "",
            destino: priv.destino || null,
            quantidadeAlunos: priv.quantidadeAlunos
                ? parseInt(priv.quantidadeAlunos, 10)
                : null,
            status: priv.status || "confirmado",
            googleEventId: event.id || "",
            description: event.description || "",
        },
    };
}

// =============================================
// SERVER ACTIONS
// =============================================

/**
 * Busca eventos do Google Calendar dos próximos 90 dias.
 */
export async function getAgendamentos(): Promise<AgendamentoEvent[]> {
    await requireAuth();
    try {
        const calendar = getCalendarClient();
        const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";

        const now = new Date();
        const future = new Date();
        future.setDate(future.getDate() + 90);

        const response = await calendar.events.list({
            calendarId,
            timeMin: now.toISOString(),
            timeMax: future.toISOString(),
            singleEvents: true,
            orderBy: "startTime",
            maxResults: 250,
        });

        const events = response.data.items || [];
        return events.map(eventToAgendamento);
    } catch (err) {
        console.error("[agenda] Erro ao buscar eventos:", err);
        return [];
    }
}

/**
 * Cria um novo evento no Google Calendar.
 */
export async function createAgendamento(data: {
    titulo: string;
    descricao?: string;
    dataInicio: string;
    horaInicio: string;
    dataFim: string;
    horaFim: string;
    leadId?: string;
    nomeEscola?: string;
    destino?: string;
    quantidadeAlunos?: number;
    status?: string;
    emailConvidado?: string;
    nomeConvidado?: string;
}): Promise<AgendamentoEvent> {
    await requireAuth();
    try {
        const calendar = getCalendarClient();
        const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";

        const hasTime = data.horaInicio && data.horaInicio !== "00:00";
        const timeZone = "America/Sao_Paulo";

        const start = hasTime
            ? { dateTime: `${data.dataInicio}T${data.horaInicio}:00`, timeZone }
            : { date: data.dataInicio };

        const end = hasTime
            ? { dateTime: `${data.dataFim || data.dataInicio}T${data.horaFim}:00`, timeZone }
            : { date: data.dataFim || data.dataInicio };

        const response = await calendar.events.insert({
            calendarId,
            requestBody: {
                summary: data.nomeEscola && data.nomeEscola !== data.titulo
                    ? `Alegrando x ${data.nomeEscola}`
                    : data.titulo,
                description: data.descricao || "",
                start,
                end,
                attendees: data.emailConvidado
                    ? [{ email: data.emailConvidado, displayName: data.nomeConvidado || "" }]
                    : undefined,
                extendedProperties: {
                    private: {
                        leadId: data.leadId || "",
                        nomeEscola: data.nomeEscola || data.titulo,
                        destino: data.destino || "",
                        quantidadeAlunos: String(data.quantidadeAlunos || 0),
                        status: data.status || "confirmado",
                        emailConvidado: data.emailConvidado || "",
                    },
                },
            },
        });

        return eventToAgendamento(response.data);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Erro ao criar agendamento: ${msg}`);
    }
}

/**
 * Atualiza um evento existente no Google Calendar (PATCH).
 */
export async function updateAgendamento(
    googleEventId: string,
    data: {
        titulo?: string;
        descricao?: string;
        dataInicio?: string;
        horaInicio?: string;
        dataFim?: string;
        horaFim?: string;
        leadId?: string;
        nomeEscola?: string;
        destino?: string;
        quantidadeAlunos?: number;
        status?: string;
    }
): Promise<AgendamentoEvent> {
    await requireAuth();
    try {
        const calendar = getCalendarClient();
        const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";
        const timeZone = "America/Sao_Paulo";

        interface CalendarEventPatch {
            summary?: string;
            description?: string;
            start?: { dateTime?: string; date?: string; timeZone?: string };
            end?: { dateTime?: string; date?: string; timeZone?: string };
            extendedProperties?: { private: Record<string, string> };
        }
        const patch: CalendarEventPatch = {};

        if (data.titulo) {
            const clienteNome = data.nomeEscola;
            patch.summary = clienteNome && clienteNome !== data.titulo
                ? `Alegrando x ${clienteNome}`
                : data.titulo;
        }

        if (data.descricao !== undefined) {
            patch.description = data.descricao;
        }

        if (data.dataInicio) {
            const hasTime = data.horaInicio && data.horaInicio !== "00:00";
            patch.start = hasTime
                ? { dateTime: `${data.dataInicio}T${data.horaInicio}:00`, timeZone }
                : { date: data.dataInicio };
        }

        if (data.dataFim) {
            const hasTime = data.horaFim && data.horaFim !== "00:00";
            patch.end = hasTime
                ? { dateTime: `${data.dataFim}T${data.horaFim}:00`, timeZone }
                : { date: data.dataFim };
        }

        // Extended properties
        const priv: Record<string, string> = {};
        if (data.leadId !== undefined) priv.leadId = data.leadId;
        if (data.nomeEscola !== undefined) priv.nomeEscola = data.nomeEscola;
        if (data.destino !== undefined) priv.destino = data.destino;
        if (data.quantidadeAlunos !== undefined) priv.quantidadeAlunos = String(data.quantidadeAlunos);
        if (data.status !== undefined) priv.status = data.status;

        if (Object.keys(priv).length > 0) {
            patch.extendedProperties = { private: priv };
        }

        const response = await calendar.events.patch({
            calendarId,
            eventId: googleEventId,
            requestBody: patch,
        });

        return eventToAgendamento(response.data);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Erro ao atualizar agendamento: ${msg}`);
    }
}

/**
 * Exclui um evento do Google Calendar.
 */
export async function deleteAgendamento(googleEventId: string) {
    await requireAuth();
    try {
        const calendar = getCalendarClient();
        const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";

        await calendar.events.delete({
            calendarId,
            eventId: googleEventId,
        });

        return { success: true };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Erro ao excluir agendamento: ${msg}`);
    }
}
