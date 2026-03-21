"use client";

import { useState, useEffect } from "react";
import {
    Users,
    CalendarDays,
    ArrowRight,
    Loader2,
} from "lucide-react";
import Link from "next/link";
import { MetricCard } from "@/components/dashboard/metric-card";
import {
    LeadsPorMesChart,
    TopDestinosChart,
} from "@/components/dashboard/charts";
import { getTotalLeads, getEventosDoMes, getTotalPasseiosDoMes, getPasseiosDoMes, getFollowupsAtivos } from "@/lib/actions/dashboard";
import { updateCliente } from "@/lib/actions/leads";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { getAgendamentos } from "@/lib/actions/agenda";
import type { AgendamentoEvent } from "@/lib/actions/agenda";

// =============================================
// PASSEIOS + FOLLOW-UPS CARD (unificado)
// =============================================
function PasseiosFollowupCard() {
    const [passeiosMes, setPaseiosMes] = useState(0);
    const [followupsAtivos, setFollowupsAtivos] = useState(0);
    const [activeTab, setActiveTab] = useState<"passeios" | "followups" | null>(null);
    const [passeiosList, setPaseiosList] = useState<{ nome: string; telefone: string; destino: string | null; data: string }[]>([]);
    const [followupsList, setFollowupsList] = useState<{
        telefone: string; nome: string; ultimoPasseio: string | null;
        followupDias: number; followupHora: string; followupEnviado: boolean;
    }[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        getTotalPasseiosDoMes().then(setPaseiosMes);
        getFollowupsAtivos().then(data => setFollowupsAtivos(data.length));
    }, []);

    async function handleTabClick(tab: "passeios" | "followups") {
        if (activeTab === tab) {
            setActiveTab(null);
            return;
        }
        setLoading(true);
        if (tab === "passeios") {
            const data = await getPasseiosDoMes();
            setPaseiosList(data);
        } else {
            const data = await getFollowupsAtivos();
            setFollowupsList(data);
        }
        setActiveTab(tab);
        setLoading(false);
    }

    async function handleToggleFollowup(telefone: string, ativo: boolean) {
        await updateCliente(telefone, { followupAtivo: ativo });
        setFollowupsList(prev =>
            prev.filter(f => ativo || f.telefone !== telefone)
        );
        if (!ativo) setFollowupsAtivos(prev => prev - 1);
    }

    return (
        <div
            className="bento-card p-6 relative overflow-hidden bento-enter kpi-gradient-emerald col-span-full"
            style={{ animationDelay: "100ms" }}
        >
            <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full opacity-[0.12] bg-emerald-500" />

            <div className="relative z-10">
                {/* Header com 2 métricas clicáveis */}
                <div className="flex gap-4 mb-4">
                    <button
                        onClick={() => handleTabClick("passeios")}
                        className={cn(
                            "flex-1 p-3 rounded-xl border-2 transition-all text-left",
                            activeTab === "passeios"
                                ? "border-emerald-500/50 bg-emerald-500/10"
                                : "border-slate-700 hover:border-slate-600"
                        )}
                    >
                        <p className="font-display text-2xl font-bold text-white">{passeiosMes}</p>
                        <p className="text-xs text-slate-400">Passeios este mês</p>
                    </button>

                    <button
                        onClick={() => handleTabClick("followups")}
                        className={cn(
                            "flex-1 p-3 rounded-xl border-2 transition-all text-left",
                            activeTab === "followups"
                                ? "border-brand-500/50 bg-brand-500/10"
                                : "border-slate-700 hover:border-slate-600"
                        )}
                    >
                        <p className="font-display text-2xl font-bold text-white">{followupsAtivos}</p>
                        <p className="text-xs text-slate-400">Follow-ups ativos</p>
                    </button>
                </div>

                {/* Conteúdo expandido */}
                {loading && (
                    <div className="flex justify-center py-4">
                        <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
                    </div>
                )}

                {!loading && activeTab === "passeios" && (
                    <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                        {passeiosList.length === 0 ? (
                            <p className="text-xs text-slate-500 italic py-2">Nenhum passeio registrado este mês.</p>
                        ) : (
                            passeiosList.map(p => (
                                <Link
                                    key={p.telefone}
                                    href={`/conversas?telefone=${p.telefone}`}
                                    className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-700/50 transition-colors"
                                >
                                    <div className="min-w-0 flex-1">
                                        <span className="text-xs text-slate-200 font-medium truncate block">{p.nome}</span>
                                        {p.destino && (
                                            <span className="text-[10px] text-slate-500 truncate block">{p.destino}</span>
                                        )}
                                    </div>
                                    <span className="text-[10px] text-slate-500 shrink-0">
                                        {p.data ? new Date(p.data + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : ""}
                                    </span>
                                </Link>
                            ))
                        )}
                    </div>
                )}

                {!loading && activeTab === "followups" && (
                    <div className="space-y-2 max-h-[250px] overflow-y-auto">
                        {followupsList.length === 0 ? (
                            <p className="text-xs text-slate-500 italic py-2">Nenhum follow-up ativo.</p>
                        ) : (
                            followupsList.map(f => (
                                <div key={f.telefone} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-900/40 border border-slate-700/50">
                                    <div className="flex-1 min-w-0">
                                        <Link
                                            href={`/conversas?telefone=${f.telefone}`}
                                            className="text-xs text-slate-200 font-medium hover:text-brand-400 transition-colors truncate block"
                                        >
                                            {f.nome}
                                        </Link>
                                        <p className="text-[10px] text-slate-500">
                                            {f.ultimoPasseio
                                                ? `Passeio: ${new Date(f.ultimoPasseio + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`
                                                : "Sem passeio"}
                                            {" · "}{f.followupDias}d · {f.followupHora}
                                            {f.followupEnviado && " · Enviado"}
                                        </p>
                                    </div>
                                    <Switch
                                        checked={true}
                                        onCheckedChange={(checked) => handleToggleFollowup(f.telefone, checked)}
                                        className="data-[state=checked]:bg-emerald-500 shrink-0"
                                    />
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// =============================================
// DASHBOARD PAGE
// =============================================
export default function DashboardPage() {
    const [totalLeads, setTotalLeads] = useState<number | null>(null);
    const [eventosDoMes, setEventosDoMes] = useState<number | null>(null);
    const [proximosEventos, setProximosEventos] = useState<AgendamentoEvent[]>([]);
    const [loadingEventos, setLoadingEventos] = useState(true);

    const mesAtual = new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

    useEffect(() => {
        getTotalLeads().then(setTotalLeads);
        getEventosDoMes().then(setEventosDoMes);
        getAgendamentos()
            .then((evts) => {
                // Filtrar próximos 7 dias
                const now = new Date();
                const in7Days = new Date();
                in7Days.setDate(now.getDate() + 7);
                const upcoming = evts
                    .filter((e) => {
                        const d = new Date(e.start);
                        return d >= now && d <= in7Days;
                    })
                    .slice(0, 4);
                setProximosEventos(upcoming);
            })
            .finally(() => setLoadingEventos(false));
    }, []);

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="bento-enter">
                <h1 className="font-display text-3xl font-bold text-white tracking-tight">
                    Dashboard
                </h1>
                <p className="text-slate-400 mt-1">
                    Visão geral do pipeline de vendas — Alegrando Eventos
                </p>
            </div>

            {/* KPI Cards Grid — 3 colunas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                <MetricCard
                    title="Total de Leads"
                    value={totalLeads !== null ? totalLeads : "..."}
                    subtitle="Acumulado geral"
                    icon={Users}
                    gradient="kpi-gradient-coral"
                    iconColor="text-brand-500"
                    delay={0}
                    href="/conversas"
                />
                <MetricCard
                    title="Eventos no Mês"
                    value={eventosDoMes !== null ? eventosDoMes : "..."}
                    subtitle={mesAtual.charAt(0).toUpperCase() + mesAtual.slice(1)}
                    icon={CalendarDays}
                    gradient="kpi-gradient-blue"
                    iconColor="text-blue-500"
                    delay={50}
                    href="/agenda"
                />
                <PasseiosFollowupCard />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <LeadsPorMesChart />
                <TopDestinosChart />
            </div>

            {/* Próximos Eventos */}
            <div
                className="bento-card-static p-6 bento-enter"
                style={{ animationDelay: "500ms" }}
            >
                <div className="mb-5 flex items-center justify-between">
                    <div>
                        <h3 className="font-display text-lg font-semibold text-white">
                            Próximos Eventos
                        </h3>
                        <p className="text-sm text-slate-400 mt-0.5">
                            Agendamentos dos próximos 7 dias
                        </p>
                    </div>
                    <Link
                        href="/agenda"
                        className="flex items-center gap-1 text-xs font-semibold text-brand-400 hover:text-brand-300 transition-colors"
                    >
                        Ver agenda
                        <ArrowRight className="w-3 h-3" />
                    </Link>
                </div>

                {loadingEventos ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
                    </div>
                ) : proximosEventos.length > 0 ? (
                    <div className="space-y-3">
                        {proximosEventos.map((evento) => {
                            const d = new Date(evento.start);
                            const dia = d.getDate().toString().padStart(2, "0");
                            const mesAbrev = d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");

                            return (
                                <Link
                                    key={evento.id}
                                    href={`/agenda?eventId=${evento.extendedProps.googleEventId}`}
                                    className="flex items-center gap-4 p-3 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-slate-700/50 transition-colors duration-200 cursor-pointer group"
                                >
                                    <div className="flex flex-col items-center justify-center w-12 h-12 rounded-xl bg-slate-700 shadow-sm shrink-0">
                                        <span className="text-[10px] font-semibold text-slate-400 uppercase leading-tight">
                                            {mesAbrev}
                                        </span>
                                        <span className="text-lg font-bold text-white leading-tight">
                                            {dia}
                                        </span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-slate-200 truncate group-hover:text-brand-400 transition-colors">
                                            {evento.title}
                                            {evento.extendedProps.leadId && (
                                                <span className="ml-1.5 text-[9px] font-bold text-brand-400 bg-brand-500/15 px-1 py-0.5 rounded">
                                                    LEAD
                                                </span>
                                            )}
                                        </p>
                                        <p className="text-xs text-slate-500 truncate">
                                            {evento.extendedProps.nomeEscola}
                                            {evento.extendedProps.destino && ` · ${evento.extendedProps.destino}`}
                                            {evento.extendedProps.quantidadeAlunos && evento.extendedProps.quantidadeAlunos !== 0 && ` · ${evento.extendedProps.quantidadeAlunos} alunos`}
                                        </p>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-8 gap-2">
                        <span className="text-3xl">📅</span>
                        <p className="text-sm text-slate-400">Nenhum evento nos próximos 7 dias.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
