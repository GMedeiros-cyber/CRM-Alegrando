"use client";

import { useState, useEffect } from "react";
import {
    Users,
    CalendarDays,
    Target,
    ArrowRight,
    Loader2,
} from "lucide-react";
import Link from "next/link";
import { MetricCard } from "@/components/dashboard/metric-card";
import { LeadsPorMesChart } from "@/components/dashboard/charts";
import { getTotalLeadsByCanal, getEventosDoMes, getFollowupsAtivos } from "@/lib/actions/dashboard";
import { updateCliente } from "@/lib/actions/leads";
import { getAgendamentos } from "@/lib/actions/agenda";
import type { AgendamentoEvent } from "@/lib/actions/agenda";

// =============================================
// FOLLOW-UPS ATIVOS CARD
// =============================================
function FollowupsAtivosCard({ onDesativado }: { onDesativado?: () => void }) {
    const [followups, setFollowups] = useState<{
        telefone: string; nome: string; ultimoPasseio: string | null;
        followupDias: number; followupHora: string; followupEnviado: boolean;
    }[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getFollowupsAtivos().then(data => {
            setFollowups(data);
            setLoading(false);
        });
    }, []);

    async function handleDesativar(telefone: string) {
        await updateCliente(telefone, { followupAtivo: false });
        setFollowups(prev => prev.filter(f => f.telefone !== telefone));
        onDesativado?.();
    }

    return (
        <div className="bento-card-static p-6 bento-enter" style={{ animationDelay: "300ms" }}>
            <div className="mb-4 flex items-center justify-between">
                <div>
                    <h3 className="font-display text-lg font-semibold text-foreground flex items-center gap-2">
                        <Target className="w-5 h-5 text-emerald-400" />
                        Follow-ups Ativos
                    </h3>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Leads com follow-up programado
                    </p>
                </div>
                <span className="text-xs font-bold bg-emerald-500/20 text-emerald-400 px-2.5 py-1 rounded-full">
                    {followups.length}
                </span>
            </div>

            {loading ? (
                <div className="flex justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
                </div>
            ) : followups.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 gap-2">
                    <span className="text-3xl">✅</span>
                    <p className="text-sm text-muted-foreground">Nenhum follow-up ativo.</p>
                </div>
            ) : (
                <div className="space-y-2 max-h-[260px] overflow-y-auto">
                    {followups.map(f => (
                        <div key={f.telefone} className="flex items-center gap-3 p-3 rounded-xl bg-background/60 border border-border/50 hover:border-border transition-colors">
                            <div className="flex-1 min-w-0">
                                <Link
                                    href={`/conversas?telefone=${f.telefone}`}
                                    className="text-sm font-semibold text-foreground hover:text-brand-400 transition-colors truncate block"
                                >
                                    {f.nome}
                                </Link>
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                    <span className="text-xs text-muted-foreground">
                                        {f.ultimoPasseio
                                            ? `Passeio: ${new Date(f.ultimoPasseio + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`
                                            : "Sem passeio"}
                                    </span>
                                    <span className="text-xs text-muted-foreground/50">·</span>
                                    <span className="text-xs text-muted-foreground">{f.followupDias}d · {f.followupHora}</span>
                                    {f.followupEnviado && (
                                        <>
                                            <span className="text-xs text-muted-foreground/50">·</span>
                                            <span className="text-[10px] font-bold text-emerald-400">✅ Enviado</span>
                                        </>
                                    )}
                                </div>
                            </div>
                            <button
                                onClick={() => handleDesativar(f.telefone)}
                                className="text-[10px] font-semibold px-2 py-1 rounded-full bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/30 transition-colors shrink-0"
                            >
                                Desativar
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// =============================================
// DASHBOARD PAGE
// =============================================
export default function DashboardPage() {
    const [leadsData, setLeadsData] = useState<{
        total: number;
        alegrando: number;
        festas: number;
    } | null>(null);
    const [eventosDoMes, setEventosDoMes] = useState<number | null>(null);
    const [followupsAtivos, setFollowupsAtivos] = useState<number | null>(null);
    const [proximosEventos, setProximosEventos] = useState<AgendamentoEvent[]>([]);
    const [loadingEventos, setLoadingEventos] = useState(true);

    const mesAtual = new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

    useEffect(() => {
        Promise.all([
            getTotalLeadsByCanal(),
            getEventosDoMes(),
            getFollowupsAtivos(),
            getAgendamentos(),
        ]).then(([leads, eventos, followups, agendamentos]) => {
            setLeadsData(leads);
            setEventosDoMes(eventos);
            setFollowupsAtivos(followups.length);

            const now = new Date();
            const in7Days = new Date();
            in7Days.setDate(now.getDate() + 7);
            const upcoming = agendamentos
                .filter((e) => {
                    const d = new Date(e.start);
                    return d >= now && d <= in7Days;
                })
                .slice(0, 4);
            setProximosEventos(upcoming);
            setLoadingEventos(false);
        });
    }, []);

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="bento-enter">
                <h1 className="font-display text-3xl font-bold text-foreground tracking-tight">
                    Dashboard
                </h1>
                <p className="text-muted-foreground mt-1">
                    Visão geral do pipeline de vendas — Alegrando Eventos
                </p>
            </div>

            {/* KPI Cards Grid — 3 colunas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                <MetricCard
                    title="Total de Leads"
                    value={leadsData !== null ? leadsData.total : "..."}
                    subtitle={
                        leadsData !== null
                            ? `🎒 ${leadsData.alegrando} Alegrando · 🎉 ${leadsData.festas} Festas`
                            : "Acumulado geral"
                    }
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
                <MetricCard
                    title="Follow-ups Ativos"
                    value={followupsAtivos !== null ? followupsAtivos : "..."}
                    subtitle="Leads com follow-up programado"
                    icon={Target}
                    gradient="kpi-gradient-emerald"
                    iconColor="text-emerald-500"
                    delay={100}
                />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <LeadsPorMesChart />
                <FollowupsAtivosCard onDesativado={() => setFollowupsAtivos(prev => (prev ?? 1) - 1)} />
            </div>

            {/* Próximos Eventos */}
            <div
                className="bento-card-static p-6 bento-enter"
                style={{ animationDelay: "500ms" }}
            >
                <div className="mb-5 flex items-center justify-between">
                    <div>
                        <h3 className="font-display text-lg font-semibold text-foreground">
                            Próximos Eventos
                        </h3>
                        <p className="text-sm text-muted-foreground mt-0.5">
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
                                    className="flex items-center gap-4 p-3 rounded-xl bg-background/60 hover:bg-background border border-border/50 transition-colors duration-200 cursor-pointer group"
                                >
                                    <div className="flex flex-col items-center justify-center w-12 h-12 rounded-xl bg-secondary shadow-sm shrink-0">
                                        <span className="text-[10px] font-semibold text-muted-foreground uppercase leading-tight">
                                            {mesAbrev}
                                        </span>
                                        <span className="text-lg font-bold text-foreground leading-tight">
                                            {dia}
                                        </span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-foreground/90 truncate group-hover:text-brand-400 transition-colors">
                                            {evento.title}
                                            {evento.extendedProps.leadId && (
                                                <span className="ml-1.5 text-[9px] font-bold text-brand-400 bg-brand-500/15 px-1 py-0.5 rounded">
                                                    LEAD
                                                </span>
                                            )}
                                        </p>
                                        <p className="text-xs text-muted-foreground/70 truncate">
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
                        <p className="text-sm text-muted-foreground">Nenhum evento nos próximos 7 dias.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
