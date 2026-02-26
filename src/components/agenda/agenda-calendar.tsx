"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventClickArg } from "@fullcalendar/core";
import type { DateClickArg } from "@fullcalendar/interaction";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import {
    CalendarDays,
    MapPin,
    Users,
    School,
    Save,
    Trash2,
} from "lucide-react";

// =============================================
// MOCK DATA — será substituído por dados reais
// =============================================
const MOCK_LEADS = [
    { id: "lead-1", nomeEscola: "Colégio Lumiar" },
    { id: "lead-2", nomeEscola: "Escola XYZ" },
    { id: "lead-3", nomeEscola: "Instituto ABC" },
    { id: "lead-4", nomeEscola: "Colégio Santo Agostinho" },
    { id: "lead-5", nomeEscola: "Escola Maria Clara" },
];

function getNextWeekday(dayOffset: number): string {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    return d.toISOString().split("T")[0];
}

const MOCK_EVENTS = [
    {
        id: "evt-1",
        title: "Excursão Sítio — Colégio Lumiar",
        start: getNextWeekday(2),
        end: getNextWeekday(3),
        backgroundColor: "#ef5544",
        borderColor: "#ef5544",
        textColor: "#ffffff",
        extendedProps: {
            leadId: "lead-1",
            nomeEscola: "Colégio Lumiar",
            destino: "Sítio Recanto Verde",
            quantidadeAlunos: 45,
            status: "confirmado",
        },
    },
    {
        id: "evt-2",
        title: "Visita Técnica — Escola XYZ",
        start: `${getNextWeekday(4)}T14:00:00`,
        end: `${getNextWeekday(4)}T16:00:00`,
        backgroundColor: "#8b5cf6",
        borderColor: "#8b5cf6",
        textColor: "#ffffff",
        extendedProps: {
            leadId: "lead-2",
            nomeEscola: "Escola XYZ",
            destino: "Museu do Amanhã",
            quantidadeAlunos: 32,
            status: "confirmado",
        },
    },
    {
        id: "evt-3",
        title: "💰 Pagamento Pendente — Instituto ABC",
        start: getNextWeekday(1),
        end: getNextWeekday(1),
        backgroundColor: "#f59e0b",
        borderColor: "#f59e0b",
        textColor: "#000000",
        extendedProps: {
            leadId: "lead-3",
            nomeEscola: "Instituto ABC",
            destino: null,
            quantidadeAlunos: 60,
            status: "pendente",
        },
    },
    {
        id: "evt-4",
        title: "Excursão Petrópolis — Colégio Agostinho",
        start: getNextWeekday(6),
        end: getNextWeekday(7),
        backgroundColor: "#3b82f6",
        borderColor: "#3b82f6",
        textColor: "#ffffff",
        extendedProps: {
            leadId: "lead-4",
            nomeEscola: "Colégio Santo Agostinho",
            destino: "Petrópolis — Museu Imperial",
            quantidadeAlunos: 55,
            status: "confirmado",
        },
    },
    {
        id: "evt-5",
        title: "Reunião de Briefing — Escola Maria Clara",
        start: `${getNextWeekday(3)}T10:00:00`,
        end: `${getNextWeekday(3)}T11:30:00`,
        backgroundColor: "#22c55e",
        borderColor: "#22c55e",
        textColor: "#ffffff",
        extendedProps: {
            leadId: "lead-5",
            nomeEscola: "Escola Maria Clara",
            destino: "Parque Nacional da Tijuca",
            quantidadeAlunos: 28,
            status: "confirmado",
        },
    },
];

// =============================================
// STATUS STYLES
// =============================================
const statusStyles: Record<string, string> = {
    confirmado: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    pendente: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    cancelado: "bg-red-500/20 text-red-400 border-red-500/30",
};

// =============================================
// COMPONENT
// =============================================
const EVENT_COLORS = ["#ef5544", "#3b82f6", "#8b5cf6", "#22c55e", "#f59e0b", "#ec4899"];

interface AgendaCalendarProps {
    onEventsChange?: (events: typeof MOCK_EVENTS) => void;
}

export function AgendaCalendar({ onEventsChange }: AgendaCalendarProps) {
    const router = useRouter();

    // Events state (starts with mock, user can add more)
    const [allEvents, setAllEvents] = useState(MOCK_EVENTS);

    // Modal state
    const [modalOpen, setModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState<"create" | "view">("create");
    const [selectedEvent, setSelectedEvent] = useState<(typeof MOCK_EVENTS)[0] | null>(null);

    // Form state
    const [form, setForm] = useState({
        titulo: "",
        dataInicio: "",
        horaInicio: "09:00",
        dataFim: "",
        horaFim: "17:00",
        leadId: "",
    });

    // Open create modal from header button
    function openCreateModal() {
        const today = new Date().toISOString().split("T")[0];
        setModalMode("create");
        setSelectedEvent(null);
        setForm({
            titulo: "",
            dataInicio: today,
            horaInicio: "09:00",
            dataFim: today,
            horaFim: "17:00",
            leadId: "",
        });
        setModalOpen(true);
    }

    // Listen for header button event
    useEffect(() => {
        function handler() {
            openCreateModal();
        }
        window.addEventListener("agenda:create", handler);
        return () => window.removeEventListener("agenda:create", handler);
    }, []);

    // Click on empty day → open create modal with date
    function handleDateClick(info: DateClickArg) {
        setModalMode("create");
        setSelectedEvent(null);
        setForm({
            titulo: "",
            dataInicio: info.dateStr.split("T")[0],
            horaInicio: "09:00",
            dataFim: info.dateStr.split("T")[0],
            horaFim: "17:00",
            leadId: "",
        });
        setModalOpen(true);
    }

    // Click on event → show details
    function handleEventClick(info: EventClickArg) {
        const evt = allEvents.find((e) => e.id === info.event.id);
        if (evt) {
            setModalMode("view");
            setSelectedEvent(evt);
            setModalOpen(true);
        }
    }

    // Save new event to local state
    function handleSaveEvent() {
        if (!form.titulo || !form.dataInicio) return;

        const leadName = MOCK_LEADS.find((l) => l.id === form.leadId)?.nomeEscola || "";
        const color = EVENT_COLORS[allEvents.length % EVENT_COLORS.length];
        const hasTime = form.horaInicio !== "00:00";
        const start = hasTime ? `${form.dataInicio}T${form.horaInicio}:00` : form.dataInicio;
        const end = hasTime ? `${form.dataFim || form.dataInicio}T${form.horaFim}:00` : (form.dataFim || form.dataInicio);

        const newEvt: (typeof MOCK_EVENTS)[number] = {
            id: `evt-user-${Date.now()}`,
            title: form.titulo,
            start,
            end,
            backgroundColor: color,
            borderColor: color,
            textColor: "#ffffff",
            extendedProps: {
                leadId: form.leadId || "lead-1",
                nomeEscola: leadName || form.titulo,
                destino: null,
                quantidadeAlunos: 0,
                status: "confirmado",
            },
        };

        setAllEvents((prev) => {
            const next = [...prev, newEvt];
            onEventsChange?.(next);
            return next;
        });
        setModalOpen(false);
    }

    // Delete event
    function handleDeleteEvent(eventId: string) {
        setAllEvents((prev) => {
            const next = prev.filter((e) => e.id !== eventId);
            onEventsChange?.(next);
            return next;
        });
        setSelectedEvent(null);
        setModalOpen(false);
    }

    // Notify parent on mount
    useEffect(() => {
        onEventsChange?.(allEvents);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps


    // Navigate to conversas
    function goToConversas(leadId: string) {
        setModalOpen(false);
        router.push(`/conversas?leadId=${leadId}`);
    }

    return (
        <>
            {/* =================== CALENDAR =================== */}
            <div className="agenda-dark-calendar">
                <FullCalendar
                    plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                    initialView="dayGridMonth"
                    locale="pt-br"
                    headerToolbar={{
                        left: "prev,next today",
                        center: "title",
                        right: "dayGridMonth,timeGridWeek,timeGridDay",
                    }}
                    buttonText={{
                        today: "Hoje",
                        month: "Mês",
                        week: "Semana",
                        day: "Dia",
                    }}
                    events={allEvents}
                    dateClick={handleDateClick}
                    eventClick={handleEventClick}
                    height="auto"
                    contentHeight="auto"
                    dayMaxEvents={3}
                    editable={false}
                    selectable={false}
                    eventDisplay="block"
                    eventClassNames="cursor-pointer"
                    nowIndicator={true}
                    fixedWeekCount={false}
                />
            </div>

            {/* =================== MODAL =================== */}
            <Dialog open={modalOpen} onOpenChange={setModalOpen}>
                <DialogContent className="bg-slate-800 border-2 border-slate-700 text-white max-w-md">
                    {modalMode === "create" ? (
                        <>
                            <DialogHeader>
                                <DialogTitle className="font-display text-lg text-white flex items-center gap-2">
                                    <CalendarDays className="w-5 h-5 text-brand-400" />
                                    Novo Agendamento
                                </DialogTitle>
                                <DialogDescription className="text-slate-400">
                                    Crie um novo evento no calendário de excursões.
                                </DialogDescription>
                            </DialogHeader>

                            <div className="space-y-4 mt-4">
                                {/* Título */}
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                        Título do Evento
                                    </Label>
                                    <Input
                                        value={form.titulo}
                                        onChange={(e) =>
                                            setForm((f) => ({ ...f, titulo: e.target.value }))
                                        }
                                        placeholder="Ex: Excursão Sítio — Colégio Lumiar"
                                        className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500 rounded-xl"
                                    />
                                </div>

                                {/* Datas */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                            Data Início
                                        </Label>
                                        <Input
                                            type="date"
                                            value={form.dataInicio}
                                            onChange={(e) =>
                                                setForm((f) => ({ ...f, dataInicio: e.target.value }))
                                            }
                                            className="bg-slate-900 border-slate-600 text-white rounded-xl"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                            Hora Início
                                        </Label>
                                        <Input
                                            type="time"
                                            value={form.horaInicio}
                                            onChange={(e) =>
                                                setForm((f) => ({ ...f, horaInicio: e.target.value }))
                                            }
                                            className="bg-slate-900 border-slate-600 text-white rounded-xl"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                            Data Fim
                                        </Label>
                                        <Input
                                            type="date"
                                            value={form.dataFim}
                                            onChange={(e) =>
                                                setForm((f) => ({ ...f, dataFim: e.target.value }))
                                            }
                                            className="bg-slate-900 border-slate-600 text-white rounded-xl"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                            Hora Fim
                                        </Label>
                                        <Input
                                            type="time"
                                            value={form.horaFim}
                                            onChange={(e) =>
                                                setForm((f) => ({ ...f, horaFim: e.target.value }))
                                            }
                                            className="bg-slate-900 border-slate-600 text-white rounded-xl"
                                        />
                                    </div>
                                </div>

                                {/* Lead select */}
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                        <School className="w-3 h-3" />
                                        Vincular a um Lead/Escola
                                    </Label>
                                    <Select
                                        value={form.leadId}
                                        onValueChange={(v) =>
                                            setForm((f) => ({ ...f, leadId: v }))
                                        }
                                    >
                                        <SelectTrigger className="bg-slate-900 border-slate-600 text-white rounded-xl">
                                            <SelectValue placeholder="Selecione uma escola..." />
                                        </SelectTrigger>
                                        <SelectContent className="bg-slate-800 border-slate-700">
                                            {MOCK_LEADS.map((lead) => (
                                                <SelectItem key={lead.id} value={lead.id}>
                                                    {lead.nomeEscola}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Save button */}
                                <button
                                    onClick={handleSaveEvent}
                                    disabled={!form.titulo || !form.dataInicio}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500 text-white font-medium text-sm hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-lg shadow-brand-500/25 mt-2"
                                >
                                    <Save className="w-4 h-4" />
                                    Salvar Agendamento
                                </button>
                            </div>
                        </>
                    ) : selectedEvent ? (
                        <>
                            <DialogHeader>
                                <DialogTitle className="font-display text-lg text-white">
                                    {selectedEvent.title}
                                </DialogTitle>
                                <DialogDescription className="text-slate-400">
                                    Detalhes do agendamento
                                </DialogDescription>
                            </DialogHeader>

                            <div className="space-y-4 mt-4">
                                {/* Color bar */}
                                <div
                                    className="h-2 rounded-full"
                                    style={{ backgroundColor: selectedEvent.backgroundColor }}
                                />

                                {/* Details grid */}
                                <div className="grid grid-cols-2 gap-3">
                                    <InfoCard
                                        icon={<School className="w-4 h-4 text-brand-400" />}
                                        label="Escola"
                                        value={selectedEvent.extendedProps.nomeEscola}
                                    />
                                    <InfoCard
                                        icon={<CalendarDays className="w-4 h-4 text-blue-400" />}
                                        label="Data"
                                        value={formatDateRange(
                                            selectedEvent.start,
                                            selectedEvent.end
                                        )}
                                    />
                                    {selectedEvent.extendedProps.destino && (
                                        <InfoCard
                                            icon={<MapPin className="w-4 h-4 text-emerald-400" />}
                                            label="Destino"
                                            value={selectedEvent.extendedProps.destino}
                                        />
                                    )}
                                    {selectedEvent.extendedProps.quantidadeAlunos && (
                                        <InfoCard
                                            icon={<Users className="w-4 h-4 text-violet-400" />}
                                            label="Alunos"
                                            value={`${selectedEvent.extendedProps.quantidadeAlunos} alunos`}
                                        />
                                    )}
                                </div>

                                {/* Status badge */}
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-semibold text-slate-400 uppercase">
                                        Status:
                                    </span>
                                    <span
                                        className={`text-xs font-bold uppercase px-2.5 py-1 rounded-full border ${statusStyles[selectedEvent.extendedProps.status] ||
                                            statusStyles.confirmado
                                            }`}
                                    >
                                        {selectedEvent.extendedProps.status}
                                    </span>
                                </div>

                                {/* Action buttons */}
                                <div className="flex gap-2 mt-2">
                                    <button
                                        onClick={() => goToConversas(selectedEvent.extendedProps.leadId)}
                                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500 text-white font-medium text-sm hover:bg-brand-600 transition-colors shadow-lg shadow-brand-500/25"
                                    >
                                        💬 Abrir Conversa
                                    </button>
                                    <button
                                        onClick={() => handleDeleteEvent(selectedEvent.id)}
                                        className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-red-500/15 text-red-400 font-medium text-sm hover:bg-red-500/25 border border-red-500/30 transition-colors"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        Excluir
                                    </button>
                                </div>
                            </div>
                        </>
                    ) : null}
                </DialogContent>
            </Dialog>

        </>
    );
}

// =============================================
// HELPERS
// =============================================
function formatDateRange(start: string, end: string): string {
    const s = new Date(start);
    const e = new Date(end);
    const dateOpts: Intl.DateTimeFormatOptions = {
        day: "2-digit",
        month: "short",
    };
    const timeOpts: Intl.DateTimeFormatOptions = {
        hour: "2-digit",
        minute: "2-digit",
    };

    // All day event
    if (!start.includes("T")) {
        if (start === end) {
            return s.toLocaleDateString("pt-BR", dateOpts);
        }
        return `${s.toLocaleDateString("pt-BR", dateOpts)} — ${e.toLocaleDateString("pt-BR", dateOpts)}`;
    }

    // Timed event
    return `${s.toLocaleDateString("pt-BR", dateOpts)} ${s.toLocaleTimeString("pt-BR", timeOpts)} — ${e.toLocaleTimeString("pt-BR", timeOpts)}`;
}

function InfoCard({
    icon,
    label,
    value,
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
}) {
    return (
        <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-700/50">
            <div className="flex items-center gap-1.5 mb-1">
                {icon}
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                    {label}
                </span>
            </div>
            <p className="text-sm font-medium text-slate-200 truncate">{value}</p>
        </div>
    );
}
