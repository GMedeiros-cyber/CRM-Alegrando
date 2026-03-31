"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventClickArg } from "@fullcalendar/core";
import type { DateClickArg } from "@fullcalendar/interaction";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
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
    Loader2,
    RefreshCw,
    FileText,
} from "lucide-react";
import {
    getAgendamentos,
    createAgendamento,
    updateAgendamento,
    deleteAgendamento,
} from "@/lib/actions/agenda";
import type { AgendamentoEvent } from "@/lib/actions/agenda";
import { listClientes } from "@/lib/actions/leads";
import type { ClienteListItem } from "@/lib/actions/leads";
import { format } from "date-fns";

// =============================================
// COMPONENT
// =============================================
interface AgendaCalendarProps {
    onEventsChange?: (events: AgendamentoEvent[]) => void;
}

export function AgendaCalendar({ onEventsChange }: AgendaCalendarProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    // Data mínima = hoje
    const today = format(new Date(), "yyyy-MM-dd");

    // Events from Google Calendar
    const [allEvents, setAllEvents] = useState<AgendamentoEvent[]>([]);
    const [loadingEvents, setLoadingEvents] = useState(true);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [dateError, setDateError] = useState<string | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);

    // Clientes list for the select
    const [clientes, setClientes] = useState<ClienteListItem[]>([]);

    // Modal state
    const [modalOpen, setModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState<"create" | "view">("create");
    const [selectedEvent, setSelectedEvent] = useState<AgendamentoEvent | null>(null);

    // Form state (create)
    const [form, setForm] = useState({
        titulo: "",
        descricao: "",
        dataInicio: "",
        horaInicio: "09:00",
        dataFim: "",
        horaFim: "17:00",
        clienteTelefone: "",
    });

    // Edit state (inline edit)
    const [editing, setEditing] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const [editForm, setEditForm] = useState({
        titulo: "",
        descricao: "",
        dataInicio: "",
        horaInicio: "",
        dataFim: "",
        horaFim: "",
        clienteTelefone: "",
    });

    // =============================================
    // DATA LOADING
    // =============================================
    async function loadEvents() {
        try {
            setLoadingEvents(true);
            setErrorMsg(null);
            const events = await getAgendamentos();
            setAllEvents(events);
            onEventsChange?.(events);
        } catch (err) {
            setErrorMsg(String(err));
        } finally {
            setLoadingEvents(false);
        }
    }

    async function loadClientes() {
        try {
            const result = await listClientes({ limit: 1000 });
            setClientes(result.data);
        } catch (err) {
            console.error("[agenda] Erro ao carregar clientes:", err);
        }
    }

    // Load initial data
    useEffect(() => {
        loadEvents();
        loadClientes();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Reset confirmingDelete when modal closes or event changes
    useEffect(() => {
        if (!modalOpen) setConfirmingDelete(false);
    }, [modalOpen]);

    // Inicializa editForm quando evento selecionado
    useEffect(() => {
        if (selectedEvent && modalMode === "view") {
            const startDate = selectedEvent.start.split("T")[0];
            const startTime = selectedEvent.start.includes("T")
                ? selectedEvent.start.split("T")[1].substring(0, 5)
                : "09:00";
            const endDate = selectedEvent.end?.split("T")[0] || startDate;
            const endTime = selectedEvent.end?.includes("T")
                ? selectedEvent.end.split("T")[1].substring(0, 5)
                : "17:00";
            setEditForm({
                titulo: selectedEvent.title,
                descricao: selectedEvent.extendedProps.description || "",
                dataInicio: startDate,
                horaInicio: startTime,
                dataFim: endDate,
                horaFim: endTime,
                clienteTelefone: selectedEvent.extendedProps.leadId || "",
            });
            setEditing(false);
        }
    }, [selectedEvent, modalMode]);

    // =============================================
    // MODAL HANDLERS
    // =============================================

    function openCreateModal() {
        const todayStr = format(new Date(), "yyyy-MM-dd");
        setModalMode("create");
        setSelectedEvent(null);
        setSaveError(null);
        setDateError(null);
        setForm({
            titulo: "",
            descricao: "",
            dataInicio: todayStr,
            horaInicio: "09:00",
            dataFim: todayStr,
            horaFim: "17:00",
            clienteTelefone: "",
        });
        setModalOpen(true);
    }

    useEffect(() => {
        function handler() {
            openCreateModal();
        }
        window.addEventListener("agenda:create", handler);
        return () => window.removeEventListener("agenda:create", handler);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Listener para abrir evento a partir da lista de Próximos Eventos
    useEffect(() => {
        function handleOpenEvent(e: Event) {
            const customEvent = e as CustomEvent<{ eventId: string }>;
            const evt = allEvents.find((ev) => ev.id === customEvent.detail.eventId);
            if (evt) {
                setModalMode("view");
                setSelectedEvent(evt);
                setEditing(true);
                setModalOpen(true);
            }
        }
        window.addEventListener("agenda:open-event", handleOpenEvent);
        return () => window.removeEventListener("agenda:open-event", handleOpenEvent);
    }, [allEvents]);

    function handleDateClick(info: DateClickArg) {
        setModalMode("create");
        setSelectedEvent(null);
        setForm({
            titulo: "",
            descricao: "",
            dataInicio: info.dateStr.split("T")[0],
            horaInicio: "09:00",
            dataFim: info.dateStr.split("T")[0],
            horaFim: "17:00",
            clienteTelefone: "",
        });
        setModalOpen(true);
    }

    function handleEventClick(info: EventClickArg) {
        const evt = allEvents.find((e) => e.id === info.event.id);
        if (evt) {
            setModalMode("view");
            setSelectedEvent(evt);
            setSaveError(null);
            setDateError(null);
            setEditing(true);
            setModalOpen(true);
        }
    }

    // =============================================
    // CRUD HANDLERS
    // =============================================

    // 3️⃣ Save new event → Google Calendar + email convidado
    function handleSaveEvent() {
        if (!form.titulo || !form.dataInicio) return;
        setSaveError(null);

        if (form.dataInicio < today) {
            setDateError("Não é possível criar eventos em datas passadas.");
            return;
        }

        if (form.dataFim && form.dataFim < form.dataInicio) {
            setDateError("Data fim não pode ser anterior à data de início.");
            return;
        }
        setDateError(null);

        const efectivoTelefone = form.clienteTelefone === "__none__" ? "" : form.clienteTelefone;
        const cliente = clientes.find((c) => c.telefone === efectivoTelefone);

        const tituloFinal = form.titulo || (cliente ? `Alegrando x ${cliente.nome}` : "Sem título");

        startTransition(async () => {
            try {
                await createAgendamento({
                    titulo: tituloFinal,
                    descricao: form.descricao,
                    dataInicio: form.dataInicio,
                    horaInicio: form.horaInicio,
                    dataFim: form.dataFim || form.dataInicio,
                    horaFim: form.horaFim,
                    leadId: efectivoTelefone,
                    nomeEscola: cliente?.nome || form.titulo,
                    status: "confirmado",
                    emailConvidado: cliente?.email || undefined,
                    nomeConvidado: cliente?.nome || undefined,
                });
                setModalOpen(false);
                await loadEvents();
            } catch (err) {
                setSaveError(err instanceof Error ? err.message : String(err));
            }
        });
    }

    // 2️⃣ Update event → Google Calendar
    async function handleUpdateEvent() {
        if (!selectedEvent) return;
        setSaveError(null);

        if (editForm.dataInicio < today) {
            setDateError("Não é possível criar eventos em datas passadas.");
            return;
        }

        if (editForm.dataFim && editForm.dataFim < editForm.dataInicio) {
            setDateError("Data fim não pode ser anterior à data de início.");
            return;
        }
        setDateError(null);

        const efectivoTelefone = editForm.clienteTelefone === "__none__" ? "" : editForm.clienteTelefone;
        const cliente = clientes.find((c) => c.telefone === efectivoTelefone);

        const tituloFinal = editForm.titulo || (cliente ? `Alegrando x ${cliente.nome}` : "Sem título");

        startTransition(async () => {
            try {
                await updateAgendamento(selectedEvent.extendedProps.googleEventId, {
                    titulo: tituloFinal,
                    descricao: editForm.descricao,
                    dataInicio: editForm.dataInicio,
                    horaInicio: editForm.horaInicio,
                    dataFim: editForm.dataFim,
                    horaFim: editForm.horaFim,
                    leadId: efectivoTelefone || undefined,
                    nomeEscola: cliente?.nome || editForm.titulo,
                });
                setEditing(false);
                setModalOpen(false);
                await loadEvents();
            } catch (err) {
                setSaveError(err instanceof Error ? err.message : String(err));
            }
        });
    }

    // Delete event → Google Calendar
    function handleDeleteEvent(googleEventId: string) {
        startTransition(async () => {
            try {
                await deleteAgendamento(googleEventId);
                setSelectedEvent(null);
                setModalOpen(false);
                await loadEvents();
            } catch (err) {
                setSaveError(err instanceof Error ? err.message : String(err));
            }
        });
    }

    function goToConversas(telefone: string) {
        setModalOpen(false);
        if (telefone) {
            router.push(`/conversas?telefone=${telefone}`);
        }
    }

    return (
        <>
            {/* =================== CALENDAR =================== */}
            {errorMsg && (
                <div className="mb-3 px-4 py-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-sm">
                    ❌ Erro Google Calendar: {errorMsg}
                </div>
            )}
            <div className="flex items-center justify-end mb-3">
                <button
                    onClick={() => loadEvents()}
                    disabled={loadingEvents}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700 text-slate-300 text-sm hover:bg-slate-600 transition-colors disabled:opacity-40"
                >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingEvents ? "animate-spin" : ""}`} />
                    Atualizar
                </button>
            </div>
            <div className="agenda-dark-calendar relative">
                {loadingEvents && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/60 rounded-2xl backdrop-blur-sm">
                        <div className="flex items-center gap-3 text-slate-300">
                            <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
                            <span className="text-sm font-medium">
                                Carregando Google Calendar...
                            </span>
                        </div>
                    </div>
                )}
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
                <DialogContent
                    className={
                        modalMode === "view"
                            ? "bg-slate-800 border-2 border-slate-700 text-white max-w-md max-h-[90vh] overflow-y-auto"
                            : "bg-slate-800 border-2 border-slate-700 text-white max-w-md"
                    }
                >
                    {modalMode === "create" ? (
                        <>
                            <DialogHeader>
                                <DialogTitle className="font-display text-lg text-white flex items-center gap-2">
                                    <CalendarDays className="w-5 h-5 text-brand-400" />
                                    Novo Agendamento
                                </DialogTitle>
                                <DialogDescription className="text-slate-400">
                                    Crie um novo evento no Google Calendar.
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

                                {/* Descrição */}
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                        Descrição / Pauta
                                    </Label>
                                    <textarea
                                        value={form.descricao}
                                        onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
                                        placeholder="Ex: Apresentação do roteiro Hopi Hari para 80 alunos do 5º ano"
                                        rows={2}
                                        className="w-full rounded-xl bg-slate-900 border border-slate-600 text-white placeholder:text-slate-500 px-3 py-2 text-sm resize-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20 outline-none"
                                    />
                                </div>

                                {/* Datas */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                            Data Início
                                        </Label>
                                        <DatePicker
                                            value={form.dataInicio}
                                            onChange={(v) => {
                                                setDateError(null);
                                                setForm((f) => ({ ...f, dataInicio: v }));
                                            }}
                                            minDate={new Date()}
                                            className="w-full rounded-xl"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                            Hora Início
                                        </Label>
                                        <TimePicker
                                            value={form.horaInicio}
                                            onChange={(v) => setForm((f) => ({ ...f, horaInicio: v }))}
                                            className="w-full rounded-xl"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                            Data Fim
                                        </Label>
                                        <DatePicker
                                            value={form.dataFim}
                                            onChange={(v) => {
                                                setDateError(null);
                                                setForm((f) => ({ ...f, dataFim: v }));
                                            }}
                                            minDate={new Date()}
                                            className="w-full rounded-xl"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                            Hora Fim
                                        </Label>
                                        <TimePicker
                                            value={form.horaFim}
                                            onChange={(v) => setForm((f) => ({ ...f, horaFim: v }))}
                                            className="w-full rounded-xl"
                                        />
                                    </div>
                                </div>

                                {/* Cliente select */}
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                        <School className="w-3 h-3" />
                                        Vincular a um Cliente
                                    </Label>
                                    <Select
                                        value={form.clienteTelefone}
                                        onValueChange={(v) =>
                                            setForm((f) => ({ ...f, clienteTelefone: v }))
                                        }
                                    >
                                        <SelectTrigger className="bg-slate-900 border-slate-600 text-white rounded-xl">
                                            <SelectValue placeholder="Selecione um cliente..." />
                                        </SelectTrigger>
                                        <SelectContent className="bg-slate-800 border-slate-700">
                                            {clientes.map((cliente) => (
                                                <SelectItem
                                                    key={cliente.telefone}
                                                    value={cliente.telefone}
                                                >
                                                    {cliente.nome || cliente.telefone}
                                                </SelectItem>
                                            ))}
                                            <SelectItem value="__none__">— Nenhum —</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Erro de data */}
                                {dateError && (
                                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-sm">
                                        {dateError}
                                    </div>
                                )}

                                {/* Erro de salvamento */}
                                {saveError && (
                                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-sm">
                                        {saveError}
                                    </div>
                                )}

                                {/* Save button */}
                                <button
                                    onClick={handleSaveEvent}
                                    disabled={!form.titulo || !form.dataInicio || isPending}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500 text-white font-medium text-sm hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-lg shadow-brand-500/25 mt-2"
                                >
                                    {isPending ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Save className="w-4 h-4" />
                                    )}
                                    {isPending ? "Salvando..." : "Salvar Agendamento"}
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
                                    {selectedEvent.extendedProps.leadId ? (
                                        <div className="bg-slate-900/60 rounded-xl p-3 border border-brand-500/30">
                                            <div className="flex items-center gap-1.5 mb-1">
                                                <School className="w-4 h-4 text-brand-400" />
                                                <span className="text-[10px] font-semibold text-brand-400 uppercase tracking-wider">
                                                    Lead Vinculado
                                                </span>
                                            </div>
                                            <p className="text-sm font-medium text-brand-300">{selectedEvent.extendedProps.nomeEscola}</p>
                                        </div>
                                    ) : (
                                        <InfoCard
                                            icon={<School className="w-4 h-4 text-slate-400" />}
                                            label="Título"
                                            value={selectedEvent.extendedProps.nomeEscola || selectedEvent.title}
                                        />
                                    )}
                                    <InfoCard
                                        icon={<CalendarDays className="w-4 h-4 text-blue-400" />}
                                        label="Data"
                                        value={formatDateRange(
                                            selectedEvent.start,
                                            selectedEvent.end
                                        )}
                                    />
                                    {selectedEvent.extendedProps.description && (
                                        <div className="col-span-2 bg-slate-900/60 rounded-xl p-3 border border-slate-700/50">
                                            <div className="flex items-center gap-1.5 mb-1">
                                                <FileText className="w-4 h-4 text-slate-400" />
                                                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                                                    Descrição
                                                </span>
                                            </div>
                                            <p className="text-sm text-slate-300 whitespace-pre-line">
                                                {selectedEvent.extendedProps.description}
                                            </p>
                                        </div>
                                    )}
                                    {selectedEvent.extendedProps.destino && (
                                        <InfoCard
                                            icon={<MapPin className="w-4 h-4 text-emerald-400" />}
                                            label="Destino"
                                            value={selectedEvent.extendedProps.destino}
                                        />
                                    )}
                                    {selectedEvent.extendedProps.quantidadeAlunos != null &&
                                     selectedEvent.extendedProps.quantidadeAlunos > 0 && (
                                        <InfoCard
                                            icon={<Users className="w-4 h-4 text-violet-400" />}
                                            label="Alunos"
                                            value={`${selectedEvent.extendedProps.quantidadeAlunos} alunos`}
                                        />
                                    )}
                                </div>

                                {/* Formulário de edição direto */}
                                <div className="space-y-3">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Título</Label>
                                        <Input
                                            value={editForm.titulo}
                                            onChange={(e) => setEditForm(f => ({ ...f, titulo: e.target.value }))}
                                            className="bg-slate-900 border-slate-600 text-white rounded-xl"
                                        />
                                    </div>
                                    {/* Descrição */}
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                            Descrição / Pauta
                                        </Label>
                                        <textarea
                                            value={editForm.descricao}
                                            onChange={(e) => setEditForm((f) => ({ ...f, descricao: e.target.value }))}
                                            placeholder="Descrição do evento..."
                                            rows={2}
                                            className="w-full rounded-xl bg-slate-900 border border-slate-600 text-white placeholder:text-slate-500 px-3 py-2 text-sm resize-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20 outline-none"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Data Início</Label>
                                            <DatePicker
                                                value={editForm.dataInicio}
                                                onChange={(v) => { setDateError(null); setEditForm(f => ({ ...f, dataInicio: v })); }}
                                                minDate={new Date()}
                                                className="w-full rounded-xl"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Hora Início</Label>
                                            <TimePicker
                                                value={editForm.horaInicio}
                                                onChange={(v) => setEditForm(f => ({ ...f, horaInicio: v }))}
                                                className="w-full rounded-xl"
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Data Fim</Label>
                                            <DatePicker
                                                value={editForm.dataFim}
                                                onChange={(v) => { setDateError(null); setEditForm(f => ({ ...f, dataFim: v })); }}
                                                minDate={new Date()}
                                                className="w-full rounded-xl"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Hora Fim</Label>
                                            <TimePicker
                                                value={editForm.horaFim}
                                                onChange={(v) => setEditForm(f => ({ ...f, horaFim: v }))}
                                                className="w-full rounded-xl"
                                            />
                                        </div>
                                    </div>
                                    {/* Cliente select */}
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                            <School className="w-3 h-3" />
                                            Vincular a um Cliente
                                        </Label>
                                        <Select
                                            value={editForm.clienteTelefone}
                                            onValueChange={(v) => setEditForm((f) => ({ ...f, clienteTelefone: v }))}
                                        >
                                            <SelectTrigger className="bg-slate-900 border-slate-600 text-white rounded-xl">
                                                <SelectValue placeholder="Selecione um cliente..." />
                                            </SelectTrigger>
                                            <SelectContent className="bg-slate-800 border-slate-700">
                                                {clientes.map((c) => (
                                                    <SelectItem key={c.telefone} value={c.telefone}>
                                                        {c.nome || c.telefone}
                                                    </SelectItem>
                                                ))}
                                                <SelectItem value="__none__">— Nenhum —</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    {dateError && (
                                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-sm">
                                            {dateError}
                                        </div>
                                    )}
                                    {saveError && (
                                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-sm">
                                            {saveError}
                                        </div>
                                    )}
                                    {confirmingDelete ? (
                                        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 space-y-2">
                                            <p className="text-sm text-red-300 font-medium text-center">
                                                Excluir este evento?
                                            </p>
                                            <p className="text-xs text-red-400/70 text-center">
                                                Esta ação removerá o evento do Google Calendar.
                                            </p>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => setConfirmingDelete(false)}
                                                    disabled={isPending}
                                                    className="flex-1 px-3 py-2 rounded-lg bg-slate-700 text-slate-200 text-sm font-medium hover:bg-slate-600 transition-colors disabled:opacity-40"
                                                >
                                                    Cancelar
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteEvent(selectedEvent.extendedProps.googleEventId)}
                                                    disabled={isPending}
                                                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-40"
                                                >
                                                    {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                                    Excluir
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex gap-2">
                                            <button
                                                onClick={handleUpdateEvent}
                                                disabled={isPending}
                                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500 text-white font-medium text-sm hover:bg-brand-600 disabled:opacity-40 transition-colors shadow-lg shadow-brand-500/25"
                                            >
                                                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                                Salvar
                                            </button>
                                            {selectedEvent.extendedProps.leadId && (
                                                <button
                                                    onClick={() => goToConversas(selectedEvent.extendedProps.leadId)}
                                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-700 text-slate-200 font-medium text-sm hover:bg-slate-600 transition-colors"
                                                >
                                                    💬 Conversa
                                                </button>
                                            )}
                                            <button
                                                onClick={() => setConfirmingDelete(true)}
                                                disabled={isPending}
                                                className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-red-500/15 text-red-400 font-medium text-sm hover:bg-red-500/25 border border-red-500/30 transition-colors disabled:opacity-40"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    )}
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

    if (!start.includes("T")) {
        if (start === end) {
            return s.toLocaleDateString("pt-BR", dateOpts);
        }
        return `${s.toLocaleDateString("pt-BR", dateOpts)} — ${e.toLocaleDateString("pt-BR", dateOpts)}`;
    }

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
