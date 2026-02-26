"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Plus, MapPin, Users, MessageSquare, ArrowRight } from "lucide-react";
import { AgendaCalendar } from "@/components/agenda/agenda-calendar";
import Link from "next/link";

type MockEvent = {
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
    };
};

export default function AgendaPage() {
    const [events, setEvents] = useState<MockEvent[]>([]);

    // Upcoming events: only future ones, sorted by date
    const upcomingEvents = useMemo(() => {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        return events
            .filter((e) => new Date(e.start) >= now)
            .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    }, [events]);

    function formatEventDate(dateStr: string): string {
        const d = new Date(dateStr);
        const hasTime = dateStr.includes("T");
        if (hasTime) {
            return d.toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "short",
                weekday: "short",
            }) + " · " + d.toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
            });
        }
        return d.toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "short",
            weekday: "short",
        });
    }

    function daysUntil(dateStr: string): string {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const target = new Date(dateStr);
        target.setHours(0, 0, 0, 0);
        const diff = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (diff === 0) return "Hoje";
        if (diff === 1) return "Amanhã";
        return `Em ${diff} dias`;
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="font-display text-3xl font-bold text-white tracking-tight">
                        Agenda
                    </h1>
                    <p className="text-slate-400 mt-1">
                        Calendário de excursões e eventos — clique em um dia para agendar
                    </p>
                </div>

                <button
                    onClick={() => {
                        window.dispatchEvent(new CustomEvent("agenda:create"));
                    }}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500 text-white font-medium text-sm hover:bg-brand-600 transition-colors shadow-lg shadow-brand-500/25"
                >
                    <Plus className="w-4 h-4" />
                    Novo Agendamento
                </button>
            </div>

            {/* Calendar */}
            <div className="bento-card p-4">
                <AgendaCalendar onEventsChange={setEvents} />
            </div>

            {/* Upcoming Events List */}
            {upcomingEvents.length > 0 && (
                <div className="bento-card p-6">
                    <div className="mb-4">
                        <h3 className="font-display text-lg font-semibold text-white flex items-center gap-2">
                            <CalendarDays className="w-5 h-5 text-brand-400" />
                            Próximos Eventos
                        </h3>
                        <p className="text-sm text-slate-400 mt-0.5">
                            {upcomingEvents.length} evento{upcomingEvents.length !== 1 ? "s" : ""} agendado{upcomingEvents.length !== 1 ? "s" : ""}
                        </p>
                    </div>

                    <div className="space-y-2">
                        {upcomingEvents.map((evt) => (
                            <div
                                key={evt.id}
                                className="flex items-center gap-4 p-3.5 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-slate-700/50 transition-colors duration-200 group"
                            >
                                {/* Color bar + date */}
                                <div className="flex items-center gap-3 shrink-0">
                                    <div
                                        className="w-1.5 h-12 rounded-full shrink-0"
                                        style={{ backgroundColor: evt.backgroundColor }}
                                    />
                                    <div className="flex flex-col items-center justify-center w-14">
                                        <span className="text-lg font-bold text-white leading-tight">
                                            {new Date(evt.start).getDate()}
                                        </span>
                                        <span className="text-[10px] font-semibold text-slate-400 uppercase">
                                            {new Date(evt.start).toLocaleDateString("pt-BR", { month: "short" })}
                                        </span>
                                    </div>
                                </div>

                                {/* Event info */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-slate-200 truncate group-hover:text-brand-400 transition-colors">
                                        {evt.title}
                                    </p>
                                    <div className="flex items-center gap-3 mt-0.5">
                                        <span className="text-xs text-slate-500">
                                            {formatEventDate(evt.start)}
                                        </span>
                                        {evt.extendedProps.destino && (
                                            <span className="text-xs text-slate-500 flex items-center gap-1">
                                                <MapPin className="w-3 h-3" />
                                                {evt.extendedProps.destino}
                                            </span>
                                        )}
                                        {(evt.extendedProps.quantidadeAlunos ?? 0) > 0 && (
                                            <span className="text-xs text-slate-500 flex items-center gap-1">
                                                <Users className="w-3 h-3" />
                                                {evt.extendedProps.quantidadeAlunos}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Days until badge */}
                                <span className="text-[10px] font-bold uppercase px-2.5 py-1 rounded-full bg-slate-700 text-slate-300 shrink-0">
                                    {daysUntil(evt.start)}
                                </span>

                                {/* Link to conversas */}
                                <Link
                                    href={`/conversas?leadId=${evt.extendedProps.leadId}`}
                                    className="flex items-center gap-1 px-3 py-2 rounded-lg bg-brand-500/15 text-brand-400 text-xs font-semibold hover:bg-brand-500/25 transition-colors shrink-0"
                                >
                                    <MessageSquare className="w-3.5 h-3.5" />
                                    Conversa
                                    <ArrowRight className="w-3 h-3" />
                                </Link>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
