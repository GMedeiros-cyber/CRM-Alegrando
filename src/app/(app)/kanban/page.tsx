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

export default function KanbanPage() {
    const [columns, setColumns] = useState<KanbanColumn[]>([]);
    const [leads, setLeads] = useState<KanbanLead[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState<{
        type: "success" | "error";
        text: string;
    } | null>(null);
    const [isPending, startTransition] = useTransition();

    async function loadData() {
        try {
            setLoading(true);
            const data = await getKanbanData();

            // Auto-seed se não há colunas
            if (data.columns.length === 0) {
                const seedResult = await seedDefaultColumns();
                if (seedResult.seeded) {
                    // Recarregar após seed
                    const newData = await getKanbanData();
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

    useEffect(() => {
        loadData();
    }, []);

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="font-display text-3xl font-bold text-white tracking-tight">
                        Kanban
                    </h1>
                    <p className="text-slate-400 mt-0.5 text-sm">
                        Quadro de vendas — arraste os cards entre as colunas
                    </p>
                </div>

                {/* Toolbar */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => { setMessage(null); loadData(); }}
                        disabled={isPending}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 border-slate-700 bg-slate-800 text-sm font-medium text-slate-400 hover:text-white hover:border-slate-600 transition-all"
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
                <div className="flex items-center justify-center py-32">
                    <Loader2 className="w-8 h-8 animate-spin text-brand-400" />
                </div>
            ) : columns.length === 0 ? (
                <div className="bento-card-static flex flex-col items-center justify-center py-24 gap-4">
                    <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-500/15">
                        <Kanban className="w-8 h-8 text-brand-400" />
                    </div>
                    <div className="text-center">
                        <p className="font-display text-lg font-semibold text-white">
                            Kanban vazio
                        </p>
                        <p className="text-sm text-slate-400 mt-1 max-w-sm">
                            Adicione leads ao board arrastando da lista de conversas, ou aguarde
                            novos leads entrarem automaticamente.
                        </p>
                    </div>
                </div>
            ) : (
                <KanbanBoard
                    initialColumns={columns}
                    initialLeads={leads}
                    onDataChanged={loadData}
                />
            )}
        </div>
    );
}
