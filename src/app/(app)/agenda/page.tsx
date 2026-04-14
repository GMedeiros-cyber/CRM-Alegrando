"use client";

import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarDays, Plus, MapPin, Users, MessageSquare, ArrowRight, Trash2 } from "lucide-react";
import dynamic from "next/dynamic";

const AgendaCalendar = dynamic(
    () => import("@/components/agenda/agenda-calendar").then(m => ({ default: m.AgendaCalendar })),
    {
        ssr: false,
        loading: () => (
            <div className="flex items-center justify-center h-96">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 rounded-full border-2 border-brand-500/30 border-t-brand-500 animate-spin" />
                    <p className="text-sm text-muted-foreground">Carregando agenda...</p>
                </div>
            </div>
        ),
    }
);
import { deleteAgendamento } from "@/lib/actions/agenda";
import type { AgendamentoEvent } from "@/lib/actions/agenda";
import Link from "next/link";

export default function AgendaPage() {
    const searchParams = useSearchParams();
    const [events, setEvents] = useState<AgendamentoEvent[]>([]);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    // Auto-open event from URL param (deep link from Conversas/Dashboard)
    useEffect(() => {
        const eventId = searchParams.get("eventId");
        if (eventId && events.length > 0) {
            window.dispatchEvent(new CustomEvent("agenda:open-event", { detail: { eventId } }));
        }
    }, [searchParams, events]);

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

    function handleEventCardClick(eventId: string) {
        window.dispatchEvent(new CustomEvent("agenda:open-event", { detail: { eventId } }));
    }

    function handleDeleteEventConfirm(eventId: string, googleEventId: string) {
        setDeletingId(null);
        deleteAgendamento(googleEventId)
            .then(() => setEvents(prev => prev.filter(e => e.id !== eventId)))
            .catch(err => alert("Erro ao excluir: " + String(err)));
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between bento-enter pl-4 pr-4 lg:px-0">
                <div className="px-6 py-4 rounded-xl bg-[#EEF2FF] dark:bg-[#1e2536] border-2 border-[#818CF8] dark:border-[#4a5568] shadow-sm flex flex-col gap-1 w-fit min-w-[320px]">
                    <h1 className="text-2xl font-bold text-[#191918] dark:text-white tracking-tight">
                        Agenda
                    </h1>
                    <p className="text-sm font-medium text-[#6366F1] dark:text-[#94a3b8]">
                        Calendário de excursões e eventos — clique em um dia para agendar
                    </p>
                </div>

                <button
                    onClick={() => {
                        window.dispatchEvent(new CustomEvent("agenda:create"));
                    }}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500 text-[#191918] dark:text-white font-medium text-sm hover:bg-brand-600 transition-colors shadow-lg shadow-brand-500/25"
                >
                    <Plus className="w-4 h-4" />
                    Novo Agendamento
                </button>
            </div>

            {/* Calendar */}
            <div className="bento-card p-4 bento-enter [animation-delay:150ms] mx-4 lg:mx-0">
                <AgendaCalendar onEventsChange={setEvents} />
            </div>

            {/* Upcoming Events List */}
            {upcomingEvents.length > 0 && (
                <div className="bento-card p-6 bento-enter [animation-delay:300ms] mx-4 lg:mx-0">
                    <div className="mb-4">
                        <h3 className="font-display text-lg font-semibold text-[#191918] dark:text-white flex items-center gap-2">
                            <CalendarDays className="w-5 h-5 text-brand-400" />
                            Próximos Eventos
                        </h3>
                        <p className="text-sm text-[#6366F1] dark:text-[#94a3b8] mt-0.5">
                            {upcomingEvents.length} evento{upcomingEvents.length !== 1 ? "s" : ""} agendado{upcomingEvents.length !== 1 ? "s" : ""}
                        </p>
                    </div>

                    <div className="space-y-2">
                        {upcomingEvents.map((evt) => (
                            <div
                                key={evt.id}
                                onClick={() => handleEventCardClick(evt.id)}
                                className="flex items-center gap-4 p-3.5 rounded-xl bg-[#F7F7F5] dark:bg-[#0f1829]/60 hover:bg-[#F7F7F5] dark:hover:bg-[#0f1829] border border-[#C7D2FE] dark:border-[#3d4a60]/50 transition-colors duration-200 group cursor-pointer"
                            >
                                {/* Color bar + date */}
                                <div className="flex items-center gap-3 shrink-0">
                                    <div
                                        className="w-1.5 h-12 rounded-full shrink-0"
                                        style={{ backgroundColor: evt.backgroundColor }}
                                    />
                                    <div className="flex flex-col items-center justify-center w-14">
                                        <span className="text-lg font-bold text-[#191918] dark:text-white leading-tight">
                                            {new Date(evt.start).getDate()}
                                        </span>
                                        <span className="text-[10px] font-semibold text-[#6366F1] dark:text-[#94a3b8] uppercase">
                                            {new Date(evt.start).toLocaleDateString("pt-BR", { month: "short" })}
                                        </span>
                                    </div>
                                </div>

                                {/* Event info */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-[#191918] dark:text-white truncate group-hover:text-brand-400 transition-colors">
                                        {evt.title}
                                        {evt.extendedProps.leadId && (
                                            <span className="ml-1.5 text-[9px] font-bold text-brand-400 bg-brand-500/15 px-1 py-0.5 rounded">
                                                LEAD
                                            </span>
                                        )}
                                    </p>
                                    <div className="flex items-center gap-3 mt-0.5">
                                        <span className="text-xs text-[#6366F1] dark:text-[#94a3b8]">
                                            {formatEventDate(evt.start)}
                                        </span>
                                        {evt.extendedProps.destino && (
                                            <span className="text-xs text-[#6366F1] dark:text-[#94a3b8] flex items-center gap-1">
                                                <MapPin className="w-3 h-3" />
                                                {evt.extendedProps.destino}
                                            </span>
                                        )}
                                        {(evt.extendedProps.quantidadeAlunos ?? 0) > 0 && (
                                            <span className="text-xs text-[#6366F1] dark:text-[#94a3b8] flex items-center gap-1">
                                                <Users className="w-3 h-3" />
                                                {evt.extendedProps.quantidadeAlunos}
                                            </span>
                                        )}
                                    </div>
                                    {evt.extendedProps.description && (
                                        <p className="text-xs text-[#6366F1] dark:text-[#94a3b8] mt-1 truncate max-w-[300px]" title={evt.extendedProps.description}>
                                            {evt.extendedProps.description}
                                        </p>
                                    )}
                                </div>

                                {/* Days until badge */}
                                <span className="text-[10px] font-bold uppercase px-2.5 py-1 rounded-full bg-[#E0E7FF] dark:bg-[#2d3347] text-[#37352F] dark:text-[#cbd5e1] shrink-0">
                                    {daysUntil(evt.start)}
                                </span>

                                {/* Badge de lead vinculado */}
                                {evt.extendedProps.leadId && (
                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-400 border border-brand-500/30 shrink-0">
                                        {evt.extendedProps.nomeEscola}
                                    </span>
                                )}

                                {/* Ações: Excluir ou Confirmar */}
                                {deletingId === evt.id ? (
                                    <div className="flex items-center gap-2 shrink-0 bg-red-500/10 rounded-lg p-1 pr-2 border border-red-500/20">
                                        <span className="text-[10px] uppercase font-bold text-red-400 px-1">Excluir?</span>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setDeletingId(null); }}
                                            className="px-2 py-1 bg-[#E0E7FF] dark:bg-[#2d3347] text-[#37352F] dark:text-[#cbd5e1] text-xs rounded hover:bg-[#C7D2FE] dark:hover:bg-[#3d4a60] transition-colors"
                                        >
                                            Não
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDeleteEventConfirm(evt.id, evt.extendedProps.googleEventId); }}
                                            className="px-2 py-1 bg-red-500 text-[#191918] dark:text-white text-xs rounded hover:bg-red-600 transition-colors font-medium"
                                        >
                                            Sim
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setDeletingId(evt.id);
                                        }}
                                        className="flex items-center justify-center w-8 h-8 rounded-lg bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/30 transition-colors shrink-0"
                                        title="Excluir evento"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                )}

                                {/* Link to conversas */}
                                <Link
                                    href={`/conversas?telefone=${evt.extendedProps.leadId}`}
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
