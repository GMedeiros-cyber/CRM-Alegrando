"use client";

import { useState, useEffect } from "react";
import {
    Users,
    CalendarDays,
    Target,
    ArrowRight,
    Pencil,
    Check,
    Loader2,
} from "lucide-react";
import Link from "next/link";
import { MetricCard } from "@/components/dashboard/metric-card";
import {
    LeadsPorMesChart,
    TopDestinosChart,
} from "@/components/dashboard/charts";
import { getTotalLeads, getEventosDoMes, getTotalPasseiosDoMes } from "@/lib/actions/dashboard";
import { getAgendamentos } from "@/lib/actions/agenda";
import type { AgendamentoEvent } from "@/lib/actions/agenda";

// =============================================
// META DE PASSEIOS CARD (localStorage)
// =============================================
function MetaPasseiosCard() {
    const [meta, setMeta] = useState<number>(30);
    const [atual, setAtual] = useState<number>(0);
    const [editing, setEditing] = useState(false);
    const [inputValue, setInputValue] = useState("");

    // Load meta from localStorage + passeios reais
    useEffect(() => {
        const saved = localStorage.getItem("alegrando_meta_passeios");
        if (saved) setMeta(parseInt(saved));
        getTotalPasseiosDoMes().then(setAtual);
    }, []);

    function handleSave() {
        const val = parseInt(inputValue);
        if (!isNaN(val) && val > 0) {
            setMeta(val);
            localStorage.setItem("alegrando_meta_passeios", String(val));
        }
        setEditing(false);
    }

    const progress = meta > 0 ? Math.min((atual / meta) * 100, 100) : 0;

    return (
        <div
            className="bento-card p-6 relative overflow-hidden bento-enter kpi-gradient-emerald"
            style={{ animationDelay: "100ms" }}
        >
            {/* Decorative circle */}
            <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full opacity-[0.12] bg-emerald-500" />

            <div className="relative z-10 flex flex-col gap-3">
                {/* Icon + Title */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-slate-900/50 backdrop-blur-sm shadow-sm">
                        <Target className="w-5 h-5 text-emerald-500" />
                    </div>
                    <button
                        onClick={() => {
                            if (editing) {
                                handleSave();
                            } else {
                                setInputValue(String(meta));
                                setEditing(true);
                            }
                        }}
                        className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors flex items-center gap-1"
                    >
                        {editing ? (
                            <>
                                <Check className="w-3 h-3" />
                                Salvar
                            </>
                        ) : (
                            <>
                                <Pencil className="w-3 h-3" />
                                Editar Meta
                            </>
                        )}
                    </button>
                </div>

                {/* Value */}
                <div>
                    {editing ? (
                        <div className="flex items-center gap-2">
                            <input
                                type="number"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleSave()}
                                className="w-20 bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-1 text-2xl font-bold text-white text-center outline-none focus:border-emerald-500"
                                autoFocus
                                min={1}
                            />
                            <span className="text-xl text-slate-400">passeios</span>
                        </div>
                    ) : (
                        <p className="font-display text-3xl font-bold text-white tracking-tight">
                            {atual} <span className="text-lg text-slate-400 font-normal">/ {meta}</span>
                        </p>
                    )}
                    <p className="text-sm text-slate-400 mt-0.5">Meta de Passeios</p>
                    {/* Progress bar */}
                    <div className="mt-2 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>
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
                <MetaPasseiosCard />
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
                                    href="/agenda"
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
