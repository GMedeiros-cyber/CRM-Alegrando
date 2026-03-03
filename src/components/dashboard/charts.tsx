"use client";

import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    Area,
    AreaChart,
} from "recharts";
import { useState, useEffect } from "react";
// import { getTopDestinos } from "@/lib/actions/leads"; // Comentado para mocks

// =========================================
// Mock data
// =========================================

const leadsPorMes = [
    { mes: "Set", leads: 28 },
    { mes: "Out", leads: 34 },
    { mes: "Nov", leads: 42 },
    { mes: "Dez", leads: 38 },
    { mes: "Jan", leads: 51 },
    { mes: "Fev", leads: 47 },
];

const leadsPorTemperatura = [
    { name: "Frio", value: 35, color: "#3b82f6" },
    { name: "Morno", value: 42, color: "#f59e0b" },
    { name: "Quente", value: 23, color: "#ef4444" },
];

const conversoesSemana = [
    { dia: "Seg", convertidos: 3, novos: 7 },
    { dia: "Ter", convertidos: 5, novos: 4 },
    { dia: "Qua", convertidos: 2, novos: 8 },
    { dia: "Qui", convertidos: 6, novos: 5 },
    { dia: "Sex", convertidos: 4, novos: 6 },
    { dia: "Sáb", convertidos: 1, novos: 2 },
];

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
        <div className="bg-slate-800 rounded-xl shadow-lg border-2 border-slate-600 px-4 py-3 text-sm">
            <p className="font-medium text-white mb-1">{label}</p>
            {payload.map((entry, index) => (
                <p key={index} style={{ color: entry.color }} className="text-xs">
                    {entry.name}: <span className="font-semibold">{entry.value}</span>
                </p>
            ))}
        </div>
    );
};

export function LeadsPorMesChart() {
    return (
        <div className="bento-card-static p-6 bento-enter" style={{ animationDelay: "200ms" }}>
            <div className="mb-6">
                <h3 className="font-display text-lg font-semibold text-white">
                    Leads por Mês
                </h3>
                <p className="text-sm text-slate-400 mt-0.5">
                    Evolução dos últimos 6 meses
                </p>
            </div>
            <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={leadsPorMes} barCategoryGap="20%">
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
        </div>
    );
}

export function TemperaturaChart() {
    return (
        <div className="bento-card-static p-6 bento-enter" style={{ animationDelay: "300ms" }}>
            <div className="mb-6">
                <h3 className="font-display text-lg font-semibold text-white">
                    Leads por Temperatura
                </h3>
                <p className="text-sm text-slate-400 mt-0.5">
                    Distribuição atual do pipeline
                </p>
            </div>
            <div className="h-[200px] flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={leadsPorTemperatura}
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={80}
                            paddingAngle={4}
                            dataKey="value"
                            strokeWidth={0}
                        >
                            {leadsPorTemperatura.map((entry, index) => (
                                <Cell key={index} fill={entry.color} />
                            ))}
                        </Pie>
                        <Tooltip
                            content={({ active, payload }) => {
                                if (!active || !payload?.[0]) return null;
                                const data = payload[0].payload as {
                                    name: string;
                                    value: number;
                                    color: string;
                                };
                                return (
                                    <div className="bg-slate-800 rounded-xl shadow-lg border-2 border-slate-600 px-4 py-3">
                                        <p
                                            className="text-sm font-semibold"
                                            style={{ color: data.color }}
                                        >
                                            {data.name}: {data.value}
                                        </p>
                                    </div>
                                );
                            }}
                        />
                    </PieChart>
                </ResponsiveContainer>
            </div>
            {/* Legend */}
            <div className="flex items-center justify-center gap-6 mt-2">
                {leadsPorTemperatura.map((item) => (
                    <div key={item.name} className="flex items-center gap-2">
                        <div
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: item.color }}
                        />
                        <span className="text-xs text-slate-400 font-medium">
                            {item.name}{" "}
                            <span className="text-white font-semibold">{item.value}</span>
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// =========================================
// Top Destinos (dados reais do banco)
// =========================================

const mockDestinos = [
    { destino: "Parque Nacional da Tijuca", total: 45 },
    { destino: "Museu do Amanhã", total: 32 },
    { destino: "Petrópolis", total: 28 },
    { destino: "Paraty", total: 15 },
    { destino: "Cristo Redentor", total: 10 },
];

export function TopDestinosChart() {
    const [data, setData] = useState<{ destino: string; total: number }[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // FIXME: Mocks temporários para visualização
        setData(mockDestinos);
        setLoading(false);
        /* 
        getTopDestinos()
            .then(res => setData(res as { destino: string; total: number }[]))
            .finally(() => setLoading(false));
        */
    }, []);

    return (
        <div className="bento-card-static p-6 bento-enter bg-slate-800" style={{ animationDelay: "500ms" }}>
            <div className="mb-6">
                <h3 className="font-display text-lg font-semibold text-white">
                    Top Destinos & Passeios
                </h3>
                <p className="text-sm text-slate-400 mt-0.5">
                    Destinos mais requisitados pelos leads
                </p>
            </div>
            {loading ? (
                <div className="h-[220px] flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : data.length > 0 ? (
                <div className="h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data} layout="vertical" barCategoryGap="25%">
                            <XAxis
                                type="number"
                                hide
                            />
                            <YAxis
                                type="category"
                                dataKey="destino"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 13, fill: "#e2e8f0" }}
                                width={140}
                            />
                            <Tooltip content={<CustomTooltipContent />} cursor={{ fill: 'transparent' }} />
                            <Bar dataKey="total" name="Leads" radius={[0, 4, 4, 0]} fill="#fb923c">
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            ) : (
                <div className="h-[220px] flex items-center justify-center">
                    <p className="text-sm text-slate-400">
                        Nenhum destino registrado ainda.
                    </p>
                </div>
            )}
        </div>
    );
}
