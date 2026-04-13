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
import { getLeadsPorMes, getTopDestinos } from "@/lib/actions/dashboard";
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
export function LeadsPorMesChart() {
    const [data, setData] = useState<{ mes: string; leads: number }[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getLeadsPorMes()
            .then((res) => setData(res))
            .finally(() => setLoading(false));
    }, []);

    return (
        <div className="bento-card-static p-6 bento-enter" style={{ animationDelay: "200ms" }}>
            <div className="mb-6">
                <h3 className="font-display text-lg font-semibold text-foreground">
                    Leads por Mês
                </h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                    Evolução dos últimos 6 meses
                </p>
            </div>
            {loading ? (
                <div className="h-[260px] flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
                </div>
            ) : data.length > 0 ? (
                <div className="h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data} barCategoryGap="20%">
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
                                fill="#ef5544"
                                radius={[8, 8, 0, 0]}
                                name="Leads"
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            ) : (
                <div className="h-[260px] flex items-center justify-center">
                    <p className="text-sm text-[#6366F1]">Nenhum lead registrado nos últimos 6 meses.</p>
                </div>
            )}
        </div>
    );
}

// =========================================
// Top Destinos — dados reais
// =========================================
export function TopDestinosChart() {
    const [data, setData] = useState<{ destino: string; pedidos: number; fechados: number }[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getTopDestinos()
            .then((res) => setData(res))
            .finally(() => setLoading(false));
    }, []);

    return (
        <div className="bento-card-static p-6 bento-enter" style={{ animationDelay: "500ms" }}>
            <div className="mb-6">
                <h3 className="font-display text-lg font-semibold text-foreground">
                    Top Destinos & Passeios
                </h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                    Pedidos vs fechados este mês
                </p>
            </div>
            {loading ? (
                <div className="h-[220px] flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
                </div>
            ) : data.length > 0 ? (
                <div className="h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data} layout="vertical" barCategoryGap="25%">
                            <XAxis type="number" hide />
                            <YAxis
                                type="category"
                                dataKey="destino"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 13, fill: "#e2e8f0" }}
                                width={140}
                            />
                            <Tooltip content={<CustomTooltipContent />} cursor={{ fill: "transparent" }} />
                            <Bar dataKey="pedidos" name="Pedidos" radius={[0, 4, 4, 0]} fill="#fb923c" />
                            <Bar dataKey="fechados" name="Fechados" radius={[0, 4, 4, 0]} fill="#22c55e" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            ) : (
                <div className="h-[220px] flex flex-col items-center justify-center gap-2">
                    <span className="text-3xl">📍</span>
                    <p className="text-sm text-[#6366F1]">
                        Nenhuma menção registrada este mês.
                    </p>
                </div>
            )}
        </div>
    );
}
