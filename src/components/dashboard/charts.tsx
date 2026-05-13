"use client";

import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from "recharts";
import { useState, useEffect } from "react";
import { getLeadsPorMes } from "@/lib/actions/dashboard";
import { Loader2 } from "lucide-react";

// =========================================
// Custom Tooltip (Dark)
// =========================================
const CustomTooltipContent = ({
    active,
    payload,
    label,
}: {
    active?: boolean;
    payload?: Array<{ name: string; value: number; color: string }>;
    label?: string;
}) => {
    if (!active || !payload) return null;
    return (
        <div className="bg-card rounded-xl shadow-lg border-2 border-border px-4 py-3 text-sm">
            <p className="font-medium text-foreground mb-1">{label}</p>
            {payload.map((entry, index) => (
                <p key={index} style={{ color: entry.color }} className="text-xs">
                    {entry.name}: <span className="font-semibold">{entry.value}</span>
                </p>
            ))}
        </div>
    );
};

// =========================================
// Leads por Mês — dados reais
// =========================================
type CanalView = "alegrando" | "festas";

export function LeadsPorMesChart() {
    const [data, setData] = useState<{ mes: string; leads: number }[]>([]);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState<"mes_atual" | "historico">("historico");
    const [canal, setCanal] = useState<CanalView>("alegrando");

    useEffect(() => {
        setLoading(true);
        getLeadsPorMes(canal)
            .then((res) => setData(res))
            .finally(() => setLoading(false));
    }, [canal]);

    const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    const mesAtualLabel = meses[new Date().getMonth()];
    const visibleData = view === "mes_atual"
        ? data.filter((d) => d.mes === mesAtualLabel)
        : data;

    const canalLabel = canal === "alegrando" ? "Alegrando" : "Festas";
    const subtitle = view === "mes_atual"
        ? `${canalLabel} — apenas ${mesAtualLabel.toLowerCase()}`
        : `${canalLabel} — evolução dos últimos 6 meses`;

    return (
        <div className="bento-card-static p-6 bento-enter" style={{ animationDelay: "200ms" }}>
            <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                    <h3 className="font-display text-lg font-semibold text-foreground">
                        Leads por Mês
                    </h3>
                    <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <div className="flex items-center gap-1 rounded-full bg-background/60 border border-border/50 p-0.5">
                        <button
                            type="button"
                            onClick={() => setCanal("alegrando")}
                            className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                                canal === "alegrando"
                                    ? "bg-brand-500 text-white"
                                    : "text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            Alegrando
                        </button>
                        <button
                            type="button"
                            onClick={() => setCanal("festas")}
                            className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                                canal === "festas"
                                    ? "bg-pink-500 text-white"
                                    : "text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            🎉 Festas
                        </button>
                    </div>
                    <div className="flex items-center gap-1 rounded-full bg-background/60 border border-border/50 p-0.5">
                        <button
                            type="button"
                            onClick={() => setView("mes_atual")}
                            className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                                view === "mes_atual"
                                    ? "bg-brand-500 text-white"
                                    : "text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            Mês atual
                        </button>
                        <button
                            type="button"
                            onClick={() => setView("historico")}
                            className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                                view === "historico"
                                    ? "bg-brand-500 text-white"
                                    : "text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            Últimos 6
                        </button>
                    </div>
                </div>
            </div>
            {loading ? (
                <div className="h-[260px] flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
                </div>
            ) : visibleData.length > 0 ? (
                <div className="h-[260px] w-full">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                        <BarChart data={visibleData} barCategoryGap="20%">
                            <CartesianGrid
                                strokeDasharray="3 3"
                                vertical={false}
                                stroke="#334155"
                            />
                            <XAxis
                                dataKey="mes"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 12, fill: "#94a3b8" }}
                            />
                            <YAxis
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 12, fill: "#94a3b8" }}
                            />
                            <Tooltip content={<CustomTooltipContent />} cursor={false} />
                            <Bar
                                dataKey="leads"
                                fill={canal === "festas" ? "#ec4899" : "#ef5544"}
                                radius={[8, 8, 0, 0]}
                                name="Leads"
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            ) : (
                <div className="h-[260px] flex items-center justify-center">
                    <p className="text-sm text-[#6366F1] dark:text-[#94a3b8]">
                        {view === "mes_atual"
                            ? `Nenhum lead em ${mesAtualLabel.toLowerCase()}.`
                            : "Nenhum lead registrado nos últimos 6 meses."}
                    </p>
                </div>
            )}
        </div>
    );
}

