"use client";

import {
    Users,
    Flame,
    CalendarDays,
    TrendingUp,
    ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { MetricCard } from "@/components/dashboard/metric-card";
import {
    LeadsPorMesChart,
    TemperaturaChart,
    TopDestinosChart,
} from "@/components/dashboard/charts";

// Mock data
const agendamentosProximos = [
    {
        id: 1,
        escola: "Colégio Santo Agostinho",
        destino: "Parque Nacional da Tijuca",
        data: "28 Fev",
        alunos: 45,
        temperatura: "quente" as const,
    },
    {
        id: 2,
        escola: "Escola Maria Clara",
        destino: "Museu do Amanhã",
        data: "03 Mar",
        alunos: 32,
        temperatura: "morno" as const,
    },
    {
        id: 3,
        escola: "Instituto Educacional Lumiar",
        destino: "Petrópolis - Museu Imperial",
        data: "05 Mar",
        alunos: 60,
        temperatura: "quente" as const,
    },
    {
        id: 4,
        escola: "Colégio Pedro II",
        destino: "Paraty - Centro Histórico",
        data: "10 Mar",
        alunos: 38,
        temperatura: "morno" as const,
    },
];

const tempColors = {
    quente: "bg-red-500/20 text-red-400",
    morno: "bg-amber-500/20 text-amber-400",
    frio: "bg-blue-500/20 text-blue-400",
};

export default function DashboardPage() {
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

            {/* KPI Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <MetricCard
                    title="Total de Leads"
                    value={127}
                    subtitle="Acumulado geral"
                    icon={Users}
                    trend={{ value: 12, label: "vs mês" }}
                    gradient="kpi-gradient-coral"
                    iconColor="text-brand-500"
                    delay={0}
                    href="/conversas"
                />
                <MetricCard
                    title="Leads Quentes"
                    value={23}
                    subtitle="Prontos para fechar"
                    icon={Flame}
                    trend={{ value: 8, label: "vs mês" }}
                    gradient="kpi-gradient-amber"
                    iconColor="text-amber-500"
                    delay={50}
                />
                <MetricCard
                    title="Eventos no Mês"
                    value={8}
                    subtitle="Fevereiro 2026"
                    icon={CalendarDays}
                    gradient="kpi-gradient-blue"
                    iconColor="text-blue-500"
                    delay={100}
                    href="/agenda"
                />
                <MetricCard
                    title="Taxa de Conversão"
                    value="31%"
                    subtitle="Meta: > 25%"
                    icon={TrendingUp}
                    trend={{ value: 3, label: "vs mês" }}
                    gradient="kpi-gradient-emerald"
                    iconColor="text-emerald-500"
                    delay={150}
                />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                    <LeadsPorMesChart />
                </div>
                <TemperaturaChart />
            </div>

            {/* Bottom Row: Activity + Upcoming */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <TopDestinosChart />

                {/* Próximos Agendamentos */}
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

                    <div className="space-y-3">
                        {agendamentosProximos.map((evento) => (
                            <Link
                                key={evento.id}
                                href="/agenda"
                                className="flex items-center gap-4 p-3 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-slate-700/50 transition-colors duration-200 cursor-pointer group"
                            >
                                {/* Date badge */}
                                <div className="flex flex-col items-center justify-center w-12 h-12 rounded-xl bg-slate-700 shadow-sm shrink-0">
                                    <span className="text-[10px] font-semibold text-slate-400 uppercase leading-tight">
                                        {evento.data.split(" ")[1]}
                                    </span>
                                    <span className="text-lg font-bold text-white leading-tight">
                                        {evento.data.split(" ")[0]}
                                    </span>
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-slate-200 truncate group-hover:text-brand-400 transition-colors">
                                        {evento.escola}
                                    </p>
                                    <p className="text-xs text-slate-500 truncate">
                                        {evento.destino} · {evento.alunos} alunos
                                    </p>
                                </div>

                                {/* Temperature badge */}
                                <span
                                    className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full shrink-0 ${tempColors[evento.temperatura]}`}
                                >
                                    {evento.temperatura}
                                </span>
                            </Link>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
