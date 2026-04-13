"use client";

import { useEffect, useState, useTransition } from "react";
import { KanbanBoard } from "@/components/kanban/kanban-board";
import {
    getKanbanData,
    seedDefaultColumns,
} from "@/lib/actions/kanban";
import type { KanbanColumn, KanbanLead } from "@/lib/actions/kanban";
import {
    Kanban,
    Loader2,
    RefreshCw,
    CheckCircle2,
    AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function KanbanPage() {
    const [columns, setColumns] = useState<KanbanColumn[]>([]);
    const [leads, setLeads] = useState<KanbanLead[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState<{
        type: "success" | "error";
        text: string;
    } | null>(null);
    const [isPending] = useTransition();
    const [kanbanCanal, setKanbanCanal] = useState<"alegrando" | "festas">(() => {
        if (typeof window !== "undefined") {
            return (localStorage.getItem("crm_kanban_canal") as "alegrando" | "festas") || "alegrando";
        }
        return "alegrando";
    });

    async function loadData(canal?: string) {
        try {
            setLoading(true);
            const data = await getKanbanData(canal ?? kanbanCanal);

            // Auto-seed se não há colunas
            if (data.columns.length === 0) {
                const seedResult = await seedDefaultColumns();
                if (seedResult.seeded) {
                    // Recarregar após seed
                    const newData = await getKanbanData(canal ?? kanbanCanal);
                    setColumns(newData.columns);
                    setLeads(newData.leads);
                    setMessage({ type: "success", text: "Colunas padrão criadas automaticamente!" });
                    return;
                }
            }

            setColumns(data.columns);
            setLeads(data.leads);
        } catch (err) {
            setMessage({ type: "error", text: `Erro ao carregar dados: ${err}` });
        } finally {
            setLoading(false);
        }
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        loadData();
    }, [kanbanCanal]);

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between bento-enter">
                <div className="px-6 py-4 rounded-xl bg-[#EEF2FF] dark:bg-[#1e2536] border-2 border-[#818CF8] dark:border-[#4a5568] shadow-sm flex flex-col gap-1 w-fit min-w-[320px]">
                    <h1 className="text-2xl font-bold text-[#191918] dark:text-white tracking-tight">
                        Kanban
                    </h1>
                    <p className="text-sm font-medium text-[#6366F1] dark:text-[#94a3b8]">
                        Quadro de vendas — arraste os cards entre as colunas
                    </p>
                </div>

                {/* Toolbar */}
                <div className="flex items-center gap-2">
                    {(["alegrando", "festas"] as const).map((v) => (
                        <button
                            key={v}
                            onClick={() => {
                                setKanbanCanal(v);
                                localStorage.setItem("crm_kanban_canal", v);
                            }}
                            className={cn(
                                "text-[11px] font-semibold uppercase px-3 py-2 rounded-xl border-2 transition-colors",
                                kanbanCanal === v
                                    ? "bg-brand-500/20 text-brand-400 border-brand-500/40"
                                    : "bg-card text-muted-foreground border-border hover:text-foreground hover:border-muted-foreground/40"
                            )}
                        >
                            {v === "alegrando" ? "🎒 Alegrando" : "🎉 Festas"}
                        </button>
                    ))}
                    <button
                        onClick={() => { setMessage(null); loadData(); }}
                        disabled={isPending}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 border-border bg-card text-sm font-medium text-muted-foreground hover:text-foreground hover:border-muted-foreground/40 transition-all"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                        <span className="hidden sm:inline">Atualizar</span>
                    </button>
                </div>
            </div>

            {/* Message toast */}
            {message && (
                <div
                    className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium border-2 ${message.type === "success"
                        ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                        : "bg-red-500/15 text-red-300 border-red-500/30"
                        }`}
                >
                    {message.type === "success" ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                    ) : (
                        <AlertCircle className="w-4 h-4 shrink-0" />
                    )}
                    <span className="flex-1">{message.text}</span>
                    <button
                        onClick={() => setMessage(null)}
                        className="text-xs opacity-60 hover:opacity-100"
                    >
                        ✕
                    </button>
                </div>
            )}

            {/* Board */}
            {loading ? (
                <div className="flex items-center justify-center py-32 bento-enter [animation-delay:150ms]">
                    <Loader2 className="w-8 h-8 animate-spin text-brand-400" />
                </div>
            ) : columns.length === 0 ? (
                <div className="bento-card-static flex flex-col items-center justify-center py-24 gap-4 bento-enter [animation-delay:150ms]">
                    <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-500/15">
                        <Kanban className="w-8 h-8 text-brand-400" />
                    </div>
                    <div className="text-center">
                        <p className="font-display text-lg font-semibold text-foreground">
                            Kanban vazio
                        </p>
                        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                            Adicione leads ao board arrastando da lista de conversas, ou aguarde
                            novos leads entrarem automaticamente.
                        </p>
                    </div>
                </div>
            ) : (
                <div className="bento-enter [animation-delay:150ms]">
                    <KanbanBoard
                        initialColumns={columns}
                        initialLeads={leads}
                        onDataChanged={loadData}
                        canal={kanbanCanal}
                    />
                </div>
            )}
        </div>
    );
}
