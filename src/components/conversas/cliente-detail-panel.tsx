"use client";

import { memo, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
    Bot,
    UserRound,
    User,
    Phone,
    MapPin,
    Save,
    CalendarDays,
    Clock,
    ExternalLink,
    Loader2,
    ListTodo,
    Trash2,
    Plus,
    Camera,
    Link2,
    Send,
    Share2,
    CheckCircle2,
    Cake,
    Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { updateCliente, getGroupParticipants } from "@/lib/actions/leads";
import type { ClienteDetail, PasseioHistorico } from "@/lib/actions/leads";
import { isGroupTelefone } from "./lead-list-item";
import type { KanbanColumn } from "@/lib/actions/kanban";
import type { AgendamentoEvent } from "@/lib/actions/agenda";

export type TaskItem = { id: string; text: string; done: boolean };

export type FormState = {
    nome: string;
    email: string;
    cpf: string;
    status: string;
    linkedin: string;
    facebook: string;
    instagram: string;
    endereco: string;
    responsavel: string;
    segundoNumero: string;
    aniversariante: string;
    kanbanColumnId: string;
    ultimoPasseio: string;
    followupDias: number;
    followupHora: string;
    followupAtivo: boolean;
    followupEnviado: boolean;
    followupEnviadoEm: string;
    posPasseioAtivo: boolean;
    posPasseioEnviado: boolean;
    posPasseioEnviadoEm: string;
};

export const INITIAL_FORM: FormState = {
    nome: "",
    email: "",
    cpf: "",
    status: "",
    linkedin: "",
    facebook: "",
    instagram: "",
    endereco: "",
    responsavel: "",
    segundoNumero: "",
    aniversariante: "",
    kanbanColumnId: "",
    ultimoPasseio: "",
    followupDias: 45,
    followupHora: "09:00",
    followupAtivo: false,
    followupEnviado: false,
    followupEnviadoEm: "",
    posPasseioAtivo: false,
    posPasseioEnviado: false,
    posPasseioEnviadoEm: "",
};

export interface ClienteDetailPanelProps {
    cliente: ClienteDetail;
    selectedTelefone: string;
    form: FormState;
    tasks: TaskItem[];
    passeiosHistorico: PasseioHistorico[];
    agendamentos: AgendamentoEvent[];
    kanbanColumns: KanbanColumn[];
    loadingAgendamentos: boolean;
    posPasseioLink: string;
    addingPasseio: boolean;
    novoPasseioDestino: string;
    novoPasseioData: string;
    confirmingDelete: boolean;
    confirmingClearMessages: boolean;
    isRunningAction: boolean;
    isSavingCliente: boolean;
    newTaskText: string;

    onFormChange: (updates: Partial<FormState>) => void;
    onSave: () => void;
    onToggleIA: () => void;
    onAddTask: () => void;
    onToggleTask: (id: string) => void;
    onDeleteTask: (id: string) => void;
    onDeleteAgendamento: (googleEventId: string) => void;
    onAddPasseio: () => void;
    onDeletePasseio: (id: string) => void;
    onDeleteCliente: () => void;
    onClearMessages: () => void;
    onSendManualFollowup: () => void;
    onSendPosPasseio: () => void;
    setPosPasseioLink: (v: string) => void;
    setAddingPasseio: (v: boolean) => void;
    setNovoPasseioDestino: (v: string) => void;
    setNovoPasseioData: (v: string) => void;
    setConfirmingDelete: (v: boolean) => void;
    setConfirmingClearMessages: (v: boolean) => void;
    setNewTaskText: (v: string) => void;
    startSavingCliente: (fn: () => Promise<void>) => void;
    startRunningAction: (fn: () => Promise<void>) => void;
    onToast: (toast: { type: "success" | "error"; text: string }) => void;
}

const ClienteDetailPanelInner = function ClienteDetailPanel({
    cliente,
    selectedTelefone,
    form,
    tasks,
    passeiosHistorico,
    agendamentos,
    kanbanColumns,
    loadingAgendamentos,
    posPasseioLink,
    addingPasseio,
    novoPasseioDestino,
    novoPasseioData,
    confirmingDelete,
    confirmingClearMessages,
    isRunningAction,
    isSavingCliente,
    newTaskText,
    onFormChange,
    onSave,
    onToggleIA,
    onAddTask,
    onToggleTask,
    onDeleteTask,
    onDeleteAgendamento,
    onAddPasseio,
    onDeletePasseio,
    onDeleteCliente,
    onClearMessages,
    onSendManualFollowup,
    onSendPosPasseio,
    setPosPasseioLink,
    setAddingPasseio,
    setNovoPasseioDestino,
    setNovoPasseioData,
    setConfirmingDelete,
    setConfirmingClearMessages,
    setNewTaskText,
    startSavingCliente,
    startRunningAction,
    onToast,
}: ClienteDetailPanelProps) {
    const pendingTasks = tasks.filter((t) => !t.done);
    const doneTasks = tasks.filter((t) => t.done);
    const sortedTasks = [...pendingTasks, ...doneTasks];
    const allTasksDone = tasks.length > 0 && pendingTasks.length === 0;
    const isGroup = isGroupTelefone(cliente.telefone);

    const [participants, setParticipants] = useState<{
        name: string;
        participantPhone: string | null;
        messageCount: number;
    }[]>([]);
    const [loadingParticipants, setLoadingParticipants] = useState(false);

    useEffect(() => {
        if (!isGroup) {
            setParticipants([]);
            return;
        }
        let cancelled = false;
        setLoadingParticipants(true);
        getGroupParticipants(cliente.telefone)
            .then((data) => { if (!cancelled) setParticipants(data); })
            .finally(() => { if (!cancelled) setLoadingParticipants(false); });
        return () => { cancelled = true; };
    }, [cliente.telefone, isGroup]);

    return (
        <div className="p-4 space-y-4">
            {/* Section title */}
            <div className="pb-3 mb-1 border-b border-[#C7D2FE] dark:border-[#3d4a60]/70">
                <div className="flex items-center gap-2">
                    <div className="w-1 h-5 rounded-full bg-brand-500" />
                    <h3 className="text-sm font-bold text-[#191918] dark:text-white tracking-tight">
                        Detalhes do Cliente
                    </h3>
                </div>
            </div>

            {/* Group participants — only for groups */}
            {isGroup && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
                    <div className="flex items-center gap-2 mb-2">
                        <Users className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-xs font-bold text-emerald-300 uppercase tracking-wide">
                            Integrantes do grupo
                        </span>
                        <span className="ml-auto text-[10px] font-semibold text-emerald-300/80 bg-emerald-500/15 px-1.5 py-0.5 rounded-full">
                            {participants.length}
                        </span>
                    </div>
                    {loadingParticipants ? (
                        <div className="flex justify-center py-3">
                            <Loader2 className="w-4 h-4 animate-spin text-emerald-400/70" />
                        </div>
                    ) : participants.length === 0 ? (
                        <p className="text-[11px] text-[#6366F1] dark:text-[#94a3b8] py-1">
                            Nenhum integrante identificado ainda. Mensagens novas
                            captarão automaticamente nome e número.
                        </p>
                    ) : (
                        <ul className="space-y-1.5">
                            {participants.map((p, idx) => (
                                <li key={`${p.participantPhone || p.name}-${idx}`} className="flex items-center gap-2 text-[12px]">
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-[#191918] dark:text-white truncate">
                                            {p.name}
                                        </p>
                                        {p.participantPhone && (
                                            <p className="text-[10px] font-mono text-[#6366F1] dark:text-[#94a3b8] truncate">
                                                {p.participantPhone}
                                            </p>
                                        )}
                                    </div>
                                    <span className="text-[10px] font-semibold text-emerald-300 bg-emerald-500/15 px-1.5 py-0.5 rounded-full shrink-0">
                                        {p.messageCount}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            {/* AI Toggle — only for alegrando (não para grupos) */}
            {cliente.canal !== "festas" && !isGroup && (
                <div
                    className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-xl border-2 transition-colors",
                        cliente.iaAtiva
                            ? "bg-emerald-500/15 border-emerald-500/50"
                            : "bg-orange-500/15 border-orange-500/50"
                    )}
                >
                    <div className="flex items-center gap-2">
                        {cliente.iaAtiva ? (
                            <Bot className="w-4 h-4 text-emerald-400" />
                        ) : (
                            <UserRound className="w-4 h-4 text-orange-400" />
                        )}
                        <span
                            className={cn(
                                "text-xs font-semibold",
                                cliente.iaAtiva ? "text-emerald-300" : "text-orange-300"
                            )}
                        >
                            {cliente.iaAtiva ? "IA Ativa" : "Modo Manual"}
                        </span>
                    </div>
                    <Switch
                        checked={cliente.iaAtiva}
                        onCheckedChange={onToggleIA}
                        className="data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-orange-500"
                    />
                </div>
            )}

            {/* Fields */}
            <div className="space-y-3">
                <FieldGroup icon={<User className="w-3 h-3" />} label="Nome">
                    <Input
                        value={form.nome}
                        onChange={(e) => onFormChange({ nome: e.target.value })}
                        onBlur={onSave}
                        placeholder="Nome do cliente"
                        className="rounded-lg h-8 text-sm bg-[#EEF2FF] dark:bg-[#1e2536] border-[#A5B4FC] dark:border-[#4a5568] text-[#191918] dark:text-white placeholder:text-[#6366F1] dark:text-[#94a3b8]"
                    />
                </FieldGroup>

                {cliente.canal === "festas" && (
                    <FieldGroup icon={<Cake className="w-3 h-3" />} label="Aniversariante">
                        <Input
                            value={form.aniversariante}
                            onChange={(e) => onFormChange({ aniversariante: e.target.value })}
                            onBlur={onSave}
                            placeholder="Nome do aniversariante"
                            className="rounded-lg h-8 text-sm bg-[#EEF2FF] dark:bg-[#1e2536] border-[#A5B4FC] dark:border-[#4a5568] text-[#191918] dark:text-white placeholder:text-[#6366F1] dark:placeholder:text-[#64748b]"
                        />
                    </FieldGroup>
                )}

                <FieldGroup icon={<Phone className="w-3 h-3" />} label="Telefone">
                    <Input
                        value={cliente.telefone}
                        disabled
                        className="rounded-lg h-8 text-sm bg-[#EEF2FF] dark:bg-[#1e2536]/50 border-[#C7D2FE] dark:border-[#3d4a60] text-[#191918] dark:text-white font-medium cursor-not-allowed"
                    />
                </FieldGroup>

                {cliente.canal !== "festas" && (
                    <FieldGroup icon={<Phone className="w-3 h-3" />} label="Segundo Número">
                        <Input
                            value={form.segundoNumero}
                            onChange={(e) => onFormChange({ segundoNumero: e.target.value })}
                            onBlur={onSave}
                            placeholder="(opcional)"
                            className="rounded-lg h-8 text-sm bg-[#EEF2FF] dark:bg-[#1e2536] border-[#A5B4FC] dark:border-[#4a5568] text-[#191918] dark:text-white placeholder:text-[#6366F1] dark:placeholder:text-[#64748b]"
                        />
                    </FieldGroup>
                )}

                {cliente.canal !== "festas" && (
                    <FieldGroup icon={<MapPin className="w-3 h-3" />} label="Endereço">
                        <Input
                            value={form.endereco}
                            onChange={(e) => onFormChange({ endereco: e.target.value })}
                            onBlur={onSave}
                            placeholder="Rua, número, bairro, cidade"
                            className="rounded-lg h-8 text-sm bg-[#EEF2FF] dark:bg-[#1e2536] border-[#A5B4FC] dark:border-[#4a5568] text-[#191918] dark:text-white placeholder:text-[#6366F1] dark:text-[#94a3b8]"
                        />
                    </FieldGroup>
                )}

                {cliente.canal !== "festas" && (
                    <FieldGroup icon={<UserRound className="w-3 h-3" />} label="Responsável">
                        <Input
                            value={form.responsavel}
                            onChange={(e) => onFormChange({ responsavel: e.target.value })}
                            onBlur={onSave}
                            placeholder="Nome do responsável"
                            className="rounded-lg h-8 text-sm bg-[#EEF2FF] dark:bg-[#1e2536] border-[#A5B4FC] dark:border-[#4a5568] text-[#191918] dark:text-white placeholder:text-[#6366F1] dark:placeholder:text-[#64748b]"
                        />
                    </FieldGroup>
                )}

                <div className="grid grid-cols-2 gap-2">
                    <FieldGroup label="Email">
                        <Input
                            value={form.email}
                            onChange={(e) => onFormChange({ email: e.target.value })}
                            onBlur={onSave}
                            placeholder="email@exemplo.com"
                            className="rounded-lg h-8 text-sm bg-[#EEF2FF] dark:bg-[#1e2536] border-[#A5B4FC] dark:border-[#4a5568] text-[#191918] dark:text-white placeholder:text-[#6366F1] dark:text-[#94a3b8]"
                        />
                    </FieldGroup>
                    <FieldGroup label="CPF">
                        <Input
                            value={form.cpf}
                            onChange={(e) => onFormChange({ cpf: e.target.value })}
                            onBlur={onSave}
                            placeholder="000.000.000-00"
                            className="rounded-lg h-8 text-sm bg-[#EEF2FF] dark:bg-[#1e2536] border-[#A5B4FC] dark:border-[#4a5568] text-[#191918] dark:text-white placeholder:text-[#6366F1] dark:text-[#94a3b8]"
                        />
                    </FieldGroup>
                </div>

                <FieldGroup label="Status (Kanban)">
                    <Select
                        value={form.kanbanColumnId}
                        onValueChange={(val) => {
                            onFormChange({ kanbanColumnId: val });
                            startSavingCliente(async () => {
                                try {
                                    await updateCliente(selectedTelefone, {
                                        kanbanColumnId: val || null,
                                    });
                                    onToast({ type: "success", text: "Cliente atualizado!" });
                                } catch (err) {
                                    onToast({ type: "error", text: `Erro ao salvar: ${err}` });
                                }
                            });
                        }}
                    >
                        <SelectTrigger className="rounded-lg h-8 text-sm bg-[#EEF2FF] dark:bg-[#1e2536] border-[#A5B4FC] dark:border-[#4a5568] text-[#191918] dark:text-white">
                            <SelectValue placeholder="Mudar coluna..." />
                        </SelectTrigger>
                        <SelectContent>
                            {kanbanColumns.map((col) => (
                                <SelectItem key={col.id} value={col.id}>
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: col.color || "#6366f1" }} />
                                        {col.name}
                                    </div>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </FieldGroup>

                {cliente.canal !== "festas" && (
                    <FieldGroup label="Último Passeio">
                        <p className="text-sm text-[#191918] dark:text-white px-1 h-8 flex items-center">
                            {form.ultimoPasseio
                                ? new Date(form.ultimoPasseio + "T00:00:00").toLocaleDateString("pt-BR")
                                : "Nenhum passeio registrado"}
                        </p>
                    </FieldGroup>
                )}

                {/* Histórico de Passeios */}
                {cliente.canal !== "festas" && <div className="pt-2 border-t border-[#C7D2FE] dark:border-[#3d4a60]/60">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-brand-400/70" />
                            <h4 className="text-xs font-semibold text-[#37352F] dark:text-[#cbd5e1] tracking-tight">
                                Histórico de Passeios
                            </h4>
                            {passeiosHistorico.length > 0 && (
                                <span className="text-[10px] bg-[#E0E7FF] dark:bg-[#2d3347]/80 text-[#6366F1] dark:text-[#94a3b8] px-1.5 py-0.5 rounded-full font-medium">
                                    {passeiosHistorico.length}
                                </span>
                            )}
                        </div>
                        <button
                            onClick={() => setAddingPasseio(!addingPasseio)}
                            className="text-[10px] font-semibold text-brand-400 hover:text-brand-300 transition-colors"
                        >
                            {addingPasseio ? "Cancelar" : "+ Registrar"}
                        </button>
                    </div>

                    {/* Formulário de adicionar passeio */}
                    {addingPasseio && (
                        <div className="space-y-2 mb-3 p-2 rounded-lg bg-[#EEF2FF] dark:bg-[#1e2536]/60 border border-[#C7D2FE] dark:border-[#3d4a60]">
                            <Input
                                value={novoPasseioDestino}
                                onChange={(e) => setNovoPasseioDestino(e.target.value)}
                                placeholder="Ex: Passeio Sítio do Carroção"
                                className="rounded-lg h-8 text-sm bg-[#F7F7F5] dark:bg-[#0f1829] border-[#A5B4FC] dark:border-[#4a5568] text-[#191918] dark:text-white placeholder:text-[#6366F1] dark:text-[#94a3b8]"
                            />
                            <DatePicker
                                value={novoPasseioData}
                                onChange={(v) => setNovoPasseioData(v)}
                                placeholder="Data do passeio"
                                className="w-full rounded-lg"
                            />
                            <button
                                onClick={onAddPasseio}
                                disabled={!novoPasseioDestino || !novoPasseioData || isSavingCliente}
                                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500 text-[#191918] dark:text-white text-xs font-semibold hover:bg-brand-600 disabled:opacity-40 transition-colors"
                            >
                                <Save className="w-3 h-3" />
                                Salvar Passeio
                            </button>
                        </div>
                    )}

                    {/* Lista de passeios */}
                    {passeiosHistorico.length === 0 ? (
                        <p className="text-xs text-[#9B9A97] dark:text-[#64748b] italic">Nenhum passeio registrado.</p>
                    ) : (
                        <div className="space-y-1.5 max-h-[150px] overflow-y-auto">
                            {passeiosHistorico.map((p) => (
                                <div
                                    key={p.id}
                                    className="group/passeio flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-[#EEF2FF] dark:hover:bg-[#1e2536]/60 transition-colors"
                                >
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs text-[#191918] dark:text-white font-medium truncate">{p.destino}</p>
                                        <p className="text-[10px] text-[#6366F1] dark:text-[#94a3b8]">
                                            {new Date(p.dataPaseio + "T00:00:00").toLocaleDateString("pt-BR")}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => onDeletePasseio(p.id)}
                                        className="opacity-0 group-hover/passeio:opacity-100 text-red-400 hover:text-red-300 transition-opacity shrink-0 ml-2"
                                    >
                                        <Trash2 className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>}

                {/* Follow-up */}
                {cliente.canal !== "festas" && <FieldGroup label="Follow-up ativo">
                    <div className="flex items-center h-8">
                        <Switch
                            checked={form.followupAtivo}
                            onCheckedChange={(checked) => {
                                onFormChange({ followupAtivo: checked });
                                startSavingCliente(async () => {
                                    try {
                                        await updateCliente(selectedTelefone, { followupAtivo: checked });
                                        onToast({ type: "success", text: checked ? "Follow-up ativado!" : "Follow-up desativado!" });
                                    } catch {
                                        onToast({ type: "error", text: "Erro ao atualizar follow-up" });
                                    }
                                });
                            }}
                            className="data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-[#C7D2FE] dark:data-[state=unchecked]:bg-[#3d4a60]"
                        />
                    </div>
                </FieldGroup>}

                {cliente.canal !== "festas" && form.followupAtivo && (
                    <>
                        <div className="grid grid-cols-2 gap-2">
                            <FieldGroup label="Follow-up (dias)">
                                <Input
                                    type="number"
                                    min={1}
                                    value={form.followupDias}
                                    onChange={(e) => onFormChange({ followupDias: parseInt(e.target.value) || 45 })}
                                    onBlur={onSave}
                                    className="rounded-lg h-8 text-sm bg-[#EEF2FF] dark:bg-[#1e2536] border-[#A5B4FC] dark:border-[#4a5568] text-[#191918] dark:text-white"
                                />
                            </FieldGroup>
                            <FieldGroup label="Horario de envio">
                                <TimePicker
                                    value={form.followupHora}
                                    onChange={(v) => {
                                        onFormChange({ followupHora: v });
                                        setTimeout(() => onSave(), 0);
                                    }}
                                    className="w-full rounded-lg"
                                />
                            </FieldGroup>
                        </div>

                        {form.followupEnviado && (
                            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#EEF2FF] dark:bg-[#1e2536]/60 border border-[#C7D2FE] dark:border-[#3d4a60]">
                                <span className="text-xs text-[#6366F1] dark:text-[#94a3b8]">
                                    ✅ Enviado {form.followupEnviadoEm
                                        ? `em ${new Date(form.followupEnviadoEm).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às ${new Date(form.followupEnviadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                                        : ""}
                                </span>
                                <button
                                    onClick={() => {
                                        startRunningAction(async () => {
                                            try {
                                                await updateCliente(selectedTelefone, { followupAtivo: false });
                                                onFormChange({ followupAtivo: false, followupEnviado: false, followupEnviadoEm: "" });
                                                onToast({ type: "success", text: "Follow-up resetado." });
                                            } catch {
                                                onToast({ type: "error", text: "Erro ao resetar follow-up" });
                                            }
                                        });
                                    }}
                                    disabled={isRunningAction}
                                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#E0E7FF] dark:bg-[#2d3347] text-[#6366F1] dark:text-[#94a3b8] hover:text-[#191918] dark:hover:text-white hover:bg-[#C7D2FE] dark:hover:bg-[#3d4a60] transition-colors"
                                >
                                    Resetar
                                </button>
                            </div>
                        )}
                        {form.ultimoPasseio && !form.followupEnviado && (
                            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/15 border border-amber-500/30">
                                <span className="text-xs font-medium text-amber-400">Follow-up programado para {form.followupDias} dias apos o passeio as {form.followupHora}</span>
                            </div>
                        )}

                        {form.ultimoPasseio && (
                            <button
                                onClick={onSendManualFollowup}
                                disabled={isRunningAction}
                                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-brand-500/15 text-brand-400 text-xs font-semibold hover:bg-brand-500/25 border border-brand-500/30 transition-colors disabled:opacity-40"
                            >
                                {isRunningAction ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                    <Send className="w-3.5 h-3.5" />
                                )}
                                Enviar Follow-up Agora
                            </button>
                        )}
                    </>
                )}

                {cliente.canal !== "festas" && <div className="my-2 border-t border-[#C7D2FE] dark:border-[#3d4a60]/50" />}

                {/* Pós-Passeio */}
                {cliente.canal !== "festas" && (<>
                    <FieldGroup label="Pós-Passeio (Fotos)">
                        <div className="flex items-center h-8">
                            <Switch
                                checked={form.posPasseioAtivo}
                                onCheckedChange={(checked) => {
                                    onFormChange({ posPasseioAtivo: checked });
                                    startSavingCliente(async () => {
                                        try {
                                            await updateCliente(selectedTelefone, { posPasseioAtivo: checked });
                                            onToast({ type: "success", text: checked ? "Pós-Passeio ativado!" : "Pós-Passeio desativado!" });
                                            if (!checked) setPosPasseioLink("");
                                        } catch {
                                            onToast({ type: "error", text: "Erro ao atualizar pós-passeio" });
                                        }
                                    });
                                }}
                                className="data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-[#C7D2FE] dark:data-[state=unchecked]:bg-[#3d4a60]"
                            />
                        </div>
                    </FieldGroup>

                    {form.posPasseioAtivo && (
                        <div className="flex flex-col gap-2 p-3 bg-[#F0F4FF] dark:bg-[#1e2536] rounded-xl border border-[#C7D2FE] dark:border-[#3d4a60]/50 relative overflow-hidden">
                            {/* Ícone de fundo */}
                            <Camera className="absolute -right-4 -top-4 w-24 h-24 text-[#9B9A97] dark:text-[#64748b]/50 pointer-events-none" />

                            {!form.posPasseioEnviado ? (
                                <>
                                    <div className="flex flex-col gap-2 z-10">
                                        <Label className="text-[10px] text-[#6366F1] dark:text-[#94a3b8]">Link das Fotos</Label>
                                        <Input
                                            type="url"
                                            value={posPasseioLink}
                                            onChange={(e) => setPosPasseioLink(e.target.value)}
                                            placeholder="https://..."
                                            className="h-8 text-xs bg-[#EEF2FF] dark:bg-[#1e2536] border-[#A5B4FC] dark:border-[#4a5568] focus:border-emerald-500/50 transition-colors"
                                        />
                                        <button
                                            disabled={isRunningAction || !posPasseioLink.trim()}
                                            onClick={onSendPosPasseio}
                                            className="flex items-center justify-center gap-2 h-8 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-[#191918] dark:text-white font-medium transition-all disabled:opacity-50 disabled:hover:bg-emerald-600 text-xs shadow-sm mt-1"
                                        >
                                            <Link2 className="w-3.5 h-3.5" />
                                            {isRunningAction ? "Enviando..." : "Enviar Link"}
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <div className="flex items-center justify-between z-10">
                                    <div className="flex flex-col gap-1">
                                        <span className="text-xs text-[#37352F] dark:text-[#cbd5e1] font-medium flex items-center gap-1.5">
                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                            Enviadas
                                        </span>
                                        <span className="text-[10px] text-[#6366F1] dark:text-[#94a3b8]">
                                            {form.posPasseioEnviadoEm ? new Date(form.posPasseioEnviadoEm).toLocaleString("pt-BR") : "Data desconhecida"}
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => {
                                            startRunningAction(async () => {
                                                try {
                                                    await updateCliente(selectedTelefone, { posPasseioAtivo: false });
                                                    onFormChange({ posPasseioAtivo: false, posPasseioEnviado: false, posPasseioEnviadoEm: "" });
                                                    setPosPasseioLink("");
                                                } catch {
                                                    onToast({ type: "error", text: "Erro ao resetar pós-passeio" });
                                                }
                                            });
                                        }}
                                        disabled={isRunningAction}
                                        className="text-[10px] font-medium px-2 py-1 rounded border border-[#A5B4FC] dark:border-[#4a5568] text-[#37352F] dark:text-[#cbd5e1] hover:text-[#191918] dark:hover:text-white hover:bg-[#E0E7FF] dark:hover:bg-[#2d3347] transition-colors"
                                    >
                                        Novo Envio
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </>)}

                {/* Redes Sociais */}
                <div className="pt-2">
                    <div className="flex items-center gap-1.5 mb-2">
                        <Share2 className="w-3.5 h-3.5 text-brand-400/70" />
                        <h4 className="text-xs font-semibold text-[#37352F] dark:text-[#cbd5e1] tracking-tight">
                            Redes Sociais
                        </h4>
                    </div>
                    <div className="space-y-2">
                        <div className="relative">
                            <Input
                                value={form.linkedin}
                                onChange={(e) => onFormChange({ linkedin: e.target.value })}
                                onBlur={onSave}
                                placeholder="https://linkedin.com/in/..."
                                className="rounded-lg h-8 pr-8 text-sm bg-[#EEF2FF] dark:bg-[#1e2536] border-[#A5B4FC] dark:border-[#4a5568] text-[#191918] dark:text-white placeholder:text-[#6366F1] dark:text-[#94a3b8]"
                            />
                            {form.linkedin && (
                                <a
                                    href={form.linkedin.startsWith('http') ? form.linkedin : `https://${form.linkedin}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6366F1] dark:text-[#94a3b8] hover:text-brand-400"
                                >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                            )}
                        </div>
                        <div className="relative">
                            <Input
                                value={form.facebook}
                                onChange={(e) => onFormChange({ facebook: e.target.value })}
                                onBlur={onSave}
                                placeholder="https://facebook.com/..."
                                className="rounded-lg h-8 pr-8 text-sm bg-[#EEF2FF] dark:bg-[#1e2536] border-[#A5B4FC] dark:border-[#4a5568] text-[#191918] dark:text-white placeholder:text-[#6366F1] dark:text-[#94a3b8]"
                            />
                            {form.facebook && (
                                <a
                                    href={form.facebook.startsWith('http') ? form.facebook : `https://${form.facebook}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6366F1] dark:text-[#94a3b8] hover:text-brand-400"
                                >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                            )}
                        </div>
                        <div className="relative">
                            <Input
                                value={form.instagram}
                                onChange={(e) => onFormChange({ instagram: e.target.value })}
                                onBlur={onSave}
                                placeholder="https://instagram.com/..."
                                className="rounded-lg h-8 pr-8 text-sm bg-[#EEF2FF] dark:bg-[#1e2536] border-[#A5B4FC] dark:border-[#4a5568] text-[#191918] dark:text-white placeholder:text-[#6366F1] dark:text-[#94a3b8]"
                            />
                            {form.instagram && (
                                <a
                                    href={form.instagram.startsWith('http') ? form.instagram : `https://${form.instagram}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6366F1] dark:text-[#94a3b8] hover:text-brand-400"
                                >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Agendamentos */}
            {cliente.canal !== "festas" && <div className="pt-4 border-t border-[#C7D2FE] dark:border-[#3d4a60]/60">
                <div className="flex items-center gap-1.5 mb-3">
                    <CalendarDays className="w-3.5 h-3.5 text-brand-400/70" />
                    <h4 className="text-xs font-semibold text-[#37352F] dark:text-[#cbd5e1] tracking-tight flex-1">
                        Agendamentos
                    </h4>
                    {agendamentos.length > 0 && (
                        <span className="text-[10px] bg-[#E0E7FF] dark:bg-[#2d3347]/80 text-[#6366F1] dark:text-[#94a3b8] px-1.5 py-0.5 rounded-full font-medium">
                            {agendamentos.length}
                        </span>
                    )}
                </div>

                {loadingAgendamentos ? (
                    <div className="flex justify-center py-3">
                        <Loader2 className="w-4 h-4 animate-spin text-[#6366F1] dark:text-[#94a3b8]" />
                    </div>
                ) : agendamentos.length === 0 ? (
                    <p className="text-xs text-[#9B9A97] dark:text-[#64748b] italic">Nenhum agendamento vinculado.</p>
                ) : (
                    <div className="space-y-2">
                        {agendamentos.map((ag) => {
                            const start = new Date(ag.start);
                            const end = new Date(ag.end);
                            const dateStr = start.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
                            const timeStr = `${start.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} \u2014 ${end.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;

                            return (
                                <div
                                    key={ag.id}
                                    className="group/ag rounded-xl border border-[#C7D2FE] dark:border-[#3d4a60] bg-[#EEF2FF] dark:bg-[#1e2536]/60 p-3 hover:border-[#A5B4FC] dark:hover:border-[#4a5568] transition-colors"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-semibold text-[#191918] dark:text-white truncate">{ag.title}</p>
                                            <div className="flex items-center gap-1 mt-1 text-[11px] text-[#6366F1] dark:text-[#94a3b8]">
                                                <CalendarDays className="w-3 h-3 shrink-0" />
                                                <span>{dateStr}</span>
                                            </div>
                                            <div className="flex items-center gap-1 text-[11px] text-[#6366F1] dark:text-[#94a3b8]">
                                                <Clock className="w-3 h-3 shrink-0" />
                                                <span>{timeStr}</span>
                                            </div>
                                            {ag.extendedProps.status && (
                                                <span className="inline-block mt-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-medium capitalize">
                                                    {ag.extendedProps.status}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex flex-col gap-1 shrink-0">
                                            <a
                                                href={`/agenda?eventId=${ag.extendedProps.googleEventId}`}
                                                className="p-1.5 rounded-lg bg-[#E0E7FF] dark:bg-[#2d3347] text-[#6366F1] dark:text-[#94a3b8] hover:text-[#191918] dark:hover:text-white hover:bg-[#C7D2FE] dark:hover:bg-[#3d4a60] transition-colors"
                                                title="Ver na Agenda"
                                            >
                                                <ExternalLink className="w-3 h-3" />
                                            </a>
                                            <button
                                                onClick={() => onDeleteAgendamento(ag.extendedProps.googleEventId)}
                                                className="p-1.5 rounded-lg bg-[#E0E7FF] dark:bg-[#2d3347] text-[#6366F1] dark:text-[#94a3b8] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                                title="Excluir agendamento"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>}

            {/* Tarefas */}
            <div className="pt-4 border-t border-[#C7D2FE] dark:border-[#3d4a60]/60">
                <div className="flex items-center gap-1.5 mb-3">
                    <ListTodo className="w-3.5 h-3.5 text-brand-400/70" />
                    <h4 className="text-xs font-semibold text-[#37352F] dark:text-[#cbd5e1] tracking-tight flex-1">
                        Tarefas
                    </h4>
                    {pendingTasks.length > 0 && (
                        <span className="text-[10px] bg-[#E0E7FF] dark:bg-[#2d3347]/80 text-[#6366F1] dark:text-[#94a3b8] px-1.5 py-0.5 rounded-full font-medium">
                            {pendingTasks.length} pendentes
                        </span>
                    )}
                    {allTasksDone && (
                        <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full font-medium">
                            Todas concluídas
                        </span>
                    )}
                </div>

                {tasks.length > 0 && (
                    <div className="flex items-center gap-2 mb-3">
                        <div className="flex-1 h-1.5 bg-[#E0E7FF] dark:bg-[#2d3347] rounded-full overflow-hidden">
                            <div
                                className="h-full bg-brand-500 rounded-full transition-all duration-300"
                                style={{ width: `${(doneTasks.length / tasks.length) * 100}%` }}
                            />
                        </div>
                        <span className="text-[10px] text-[#6366F1] dark:text-[#94a3b8] shrink-0">
                            {doneTasks.length}/{tasks.length}
                        </span>
                    </div>
                )}

                <div className="space-y-1.5">
                    {sortedTasks.map((task) => (
                        <div key={task.id} className="group/task flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[#EEF2FF] dark:hover:bg-[#1e2536]/60 transition-colors">
                            <button
                                onClick={() => onToggleTask(task.id)}
                                className={cn(
                                    "w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                                    task.done
                                        ? "bg-brand-500 border-brand-500"
                                        : "border-[#A5B4FC] dark:border-[#4a5568] hover:border-[#6366F1]"
                                )}
                            >
                                {task.done && (
                                    <svg className="w-2.5 h-2.5 text-[#191918] dark:text-white" viewBox="0 0 12 12" fill="none">
                                        <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                )}
                            </button>
                            <span className={cn(
                                "text-xs flex-1 min-w-0 break-words",
                                task.done ? "text-[#9B9A97] dark:text-[#64748b] line-through" : "text-[#37352F] dark:text-[#cbd5e1]"
                            )}>
                                {task.text}
                            </span>
                            <button
                                onClick={() => onDeleteTask(task.id)}
                                className="opacity-0 group-hover/task:opacity-100 text-red-400 hover:text-red-300 transition-opacity shrink-0"
                            >
                                <Trash2 className="w-3 h-3" />
                            </button>
                        </div>
                    ))}
                </div>

                <div className="flex items-center gap-1.5 mt-2">
                    <input
                        value={newTaskText}
                        onChange={(e) => setNewTaskText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") onAddTask(); }}
                        placeholder="+ Adicionar tarefa..."
                        className="flex-1 bg-[#EEF2FF] dark:bg-[#1e2536] border border-[#C7D2FE] dark:border-[#3d4a60] rounded-lg px-2 py-1.5 text-xs text-[#191918] dark:text-white placeholder:text-[#9B9A97] dark:placeholder:text-[#94a3b8] outline-none focus:ring-1 focus:ring-brand-400 focus:border-brand-400"
                    />
                    {newTaskText.trim() && (
                        <button
                            onClick={onAddTask}
                            className="p-1.5 rounded-lg bg-brand-500 text-[#191918] dark:text-white hover:bg-brand-600 transition-colors shrink-0"
                        >
                            <Plus className="w-3 h-3" />
                        </button>
                    )}
                </div>

                {tasks.length === 0 && (
                    <p className="text-xs text-[#9B9A97] dark:text-[#64748b] italic mt-2">
                        Nenhuma tarefa criada ainda.
                    </p>
                )}
            </div>

            {/* Zona de Perigo */}
            <div className="pt-4 border-t border-red-500/20">
                <div className="flex items-center gap-1.5 mb-3">
                    <div className="w-1 h-4 rounded-full bg-red-500/50" />
                    <h4 className="text-xs font-semibold text-red-400/80 tracking-tight">
                        Zona de Perigo
                    </h4>
                </div>

                {/* Limpar conversas */}
                {confirmingClearMessages ? (
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 mb-2">
                        <p className="text-xs text-amber-400 font-medium mb-2">Apagar todo o histórico de mensagens?</p>
                        <div className="flex gap-2">
                            <button onClick={onClearMessages} disabled={isRunningAction}
                                className="flex-1 px-2 py-1.5 rounded-lg bg-amber-500 text-[#191918] dark:text-white text-xs font-semibold hover:bg-amber-600 transition-colors disabled:opacity-40">
                                Confirmar
                            </button>
                            <button onClick={() => setConfirmingClearMessages(false)}
                                className="flex-1 px-2 py-1.5 rounded-lg bg-[#E0E7FF] dark:bg-[#2d3347] text-[#191918] dark:text-white text-xs font-semibold hover:bg-[#C7D2FE] dark:hover:bg-[#3d4a60] transition-colors">
                                Cancelar
                            </button>
                        </div>
                    </div>
                ) : (
                    <button onClick={() => setConfirmingClearMessages(true)}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 text-amber-400 text-xs font-semibold hover:bg-amber-500/20 border border-amber-500/20 transition-colors mb-2">
                        <Trash2 className="w-3.5 h-3.5" />
                        Limpar histórico de conversas
                    </button>
                )}

                {/* Excluir cliente */}
                {confirmingDelete ? (
                    <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30">
                        <p className="text-xs text-red-400 font-medium mb-2">Excluir cliente permanentemente? Isso apaga todos os dados.</p>
                        <div className="flex gap-2">
                            <button onClick={onDeleteCliente} disabled={isRunningAction}
                                className="flex-1 px-2 py-1.5 rounded-lg bg-red-500 text-[#191918] dark:text-white text-xs font-semibold hover:bg-red-600 transition-colors disabled:opacity-40">
                                {isRunningAction ? "Excluindo..." : "Confirmar exclusão"}
                            </button>
                            <button onClick={() => setConfirmingDelete(false)}
                                className="flex-1 px-2 py-1.5 rounded-lg bg-[#E0E7FF] dark:bg-[#2d3347] text-[#191918] dark:text-white text-xs font-semibold hover:bg-[#C7D2FE] dark:hover:bg-[#3d4a60] transition-colors">
                                Cancelar
                            </button>
                        </div>
                    </div>
                ) : (
                    <button onClick={() => setConfirmingDelete(true)}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/10 text-red-400 text-xs font-semibold hover:bg-red-500/20 border border-red-500/20 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                        Excluir cliente
                    </button>
                )}
            </div>
        </div>
    );
};

export const ClienteDetailPanel = memo(ClienteDetailPanelInner);

function FieldGroup({
    icon,
    label,
    children,
}: {
    icon?: ReactNode;
    label: string;
    children: ReactNode;
}) {
    return (
        <div className="space-y-1">
            <Label className="text-[10px] font-semibold text-[#37352F] dark:text-[#cbd5e1] uppercase tracking-wider flex items-center gap-1">
                {icon}
                {label}
            </Label>
            {children}
        </div>
    );
}
