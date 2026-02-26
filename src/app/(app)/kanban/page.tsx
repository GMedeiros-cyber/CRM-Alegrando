"use client";

import { useEffect, useState, useTransition } from "react";
import { KanbanBoard } from "@/components/kanban/kanban-board";
import {
    getKanbanData,
    seedDefaultColumns,
    createDemoLead,
} from "@/lib/actions/kanban";
import type { KanbanColumn, KanbanLead } from "@/lib/actions/kanban";
import {
    Kanban,
    Sparkles,
    Plus,
    Loader2,
    RefreshCw,
    CheckCircle2,
    AlertCircle,
} from "lucide-react";

const DEMO_SCHOOLS = [
    { name: "Colégio Santo Agostinho", temp: "quente" },
    { name: "Escola Maria Clara", temp: "morno" },
    { name: "Instituto Lumiar", temp: "frio" },
    { name: "Colégio Pedro II", temp: "quente" },
    { name: "Escola Nova Geração", temp: "morno" },
    { name: "Colégio Bandeirantes", temp: "frio" },
];

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

    function handleSeed() {
        startTransition(async () => {
            try {
                const result = await seedDefaultColumns();
                setMessage({ type: "success", text: result.message });
                await loadData();
            } catch (err) {
                setMessage({ type: "error", text: `Erro no seed: ${err}` });
            }
        });
    }

    function handleAddDemo() {
        startTransition(async () => {
            try {
                if (columns.length === 0) {
                    setMessage({ type: "error", text: "Crie as colunas primeiro (Seed)." });
                    return;
                }
                const school =
                    DEMO_SCHOOLS[Math.floor(Math.random() * DEMO_SCHOOLS.length)];
                const randomCol = columns[Math.floor(Math.random() * columns.length)];
                await createDemoLead(school.name, randomCol.id, school.temp);
                setMessage({
                    type: "success",
                    text: `Lead "${school.name}" criado em "${randomCol.name}"!`,
                });
                await loadData();
            } catch (err) {
                setMessage({ type: "error", text: `Erro ao criar lead: ${err}` });
            }
        });
    }

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

                    <button
                        onClick={handleSeed}
                        disabled={isPending}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 disabled:opacity-50 transition-colors shadow-sm"
                    >
                        {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        <span className="hidden sm:inline">Seed Colunas</span>
                    </button>

                    <button
                        onClick={handleAddDemo}
                        disabled={isPending}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 disabled:opacity-50 transition-colors shadow-sm shadow-brand-500/20"
                    >
                        {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                        <span className="hidden sm:inline">Lead Demo</span>
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
                            Clique em <strong>&quot;Seed Colunas&quot;</strong> para criar as colunas
                            padrão (Novo Lead, Qualificação, Proposta Enviada, Agendado, Concluído).
                        </p>
                    </div>
                </div>
            ) : (
                <KanbanBoard initialColumns={columns} initialLeads={leads} />
            )}
        </div>
    );
}
