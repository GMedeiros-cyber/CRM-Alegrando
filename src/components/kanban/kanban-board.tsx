"use client";

import { useCallback, useState, useRef, useEffect } from "react";
import {
    DndContext,
    DragOverlay,
    DragStartEvent,
    DragOverEvent,
    DragEndEvent,
    PointerSensor,
    useSensor,
    useSensors,
    closestCorners,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useRouter } from "next/navigation";
import { KanbanColumn } from "./kanban-column";
import { KanbanCard } from "./kanban-card";
import {
    moveLeadInKanban,
    createKanbanColumn,
    confirmPasseioRealizado,
} from "@/lib/actions/kanban";
import type {
    KanbanColumn as KanbanColumnType,
    KanbanLead,
} from "@/lib/actions/kanban";
import {
    Plus,
    Loader2,
    CalendarDays,
    AlertTriangle,
    CheckCircle2,
} from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface KanbanBoardProps {
    initialColumns: KanbanColumnType[];
    initialLeads: KanbanLead[];
    onDataChanged?: () => void;
}

export function KanbanBoard({
    initialColumns,
    initialLeads,
    onDataChanged,
}: KanbanBoardProps) {
    const router = useRouter();
    const [columns, setColumns] = useState(initialColumns);
    const [leadsMap, setLeadsMap] = useState<Record<string, KanbanLead[]>>(() => {
        const map: Record<string, KanbanLead[]> = {};
        for (const col of initialColumns) {
            map[col.id] = initialLeads
                .filter((l) => l.kanbanColumnId === col.id)
                .sort((a, b) => a.kanbanPosition - b.kanbanPosition);
        }
        return map;
    });
    const [activeCard, setActiveCard] = useState<KanbanLead | null>(null);

    // Inline add column
    const [addingColumn, setAddingColumn] = useState(false);
    const [newColName, setNewColName] = useState("");
    const newColRef = useRef<HTMLInputElement>(null);

    // Modal de confirmação "Passeio Realizado"
    const [confirmModal, setConfirmModal] = useState(false);
    const [confirmLead, setConfirmLead] = useState<KanbanLead | null>(null);
    const [confirmColId, setConfirmColId] = useState<string>("");
    const [confirmPosition, setConfirmPosition] = useState<number>(0);
    const [confirmDate, setConfirmDate] = useState<string>("");
    const [confirmLoading, setConfirmLoading] = useState(false);
    const [confirmError, setConfirmError] = useState<string | null>(null);
    // Backup para reverter
    const [preConfirmLeadsMap, setPreConfirmLeadsMap] = useState<Record<string, KanbanLead[]> | null>(null);

    useEffect(() => {
        if (addingColumn && newColRef.current) {
            newColRef.current.focus();
        }
    }, [addingColumn]);

    const COLORS = ["#8b5cf6", "#3b82f6", "#f59e0b", "#22c55e", "#ef5544", "#ec4899"];

    async function handleAddColumn() {
        const name = newColName.trim();
        if (!name) {
            setAddingColumn(false);
            return;
        }
        try {
            const color = COLORS[columns.length % COLORS.length];
            const created = await createKanbanColumn(name, color);
            if (!created) return;
            setColumns((prev) => [...prev, created]);
            setLeadsMap((prev) => ({ ...prev, [created.id]: [] }));
            setNewColName("");
            setAddingColumn(false);
        } catch (err) {
            console.error("Erro ao criar coluna:", err);
        }
    }

    function handleColumnRenamed(colId: string, newName: string) {
        setColumns((prev) =>
            prev.map((c) => (c.id === colId ? { ...c, name: newName } : c))
        );
    }

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 8 },
        })
    );

    const findColumnOfLead = useCallback(
        (leadId: string): string | null => {
            for (const [colId, colLeads] of Object.entries(leadsMap)) {
                if (colLeads.some((l) => l.id === leadId)) return colId;
            }
            return null;
        },
        [leadsMap]
    );

    const handleDragStart = useCallback(
        (event: DragStartEvent) => {
            const leadId = event.active.id as string;
            const colId = findColumnOfLead(leadId);
            if (colId) {
                const lead = leadsMap[colId].find((l) => l.id === leadId);
                if (lead) setActiveCard(lead);
            }
        },
        [findColumnOfLead, leadsMap]
    );

    const handleDragOver = useCallback(
        (event: DragOverEvent) => {
            const { active, over } = event;
            if (!over) return;

            const activeId = active.id as string;
            const overId = over.id as string;
            const activeColId = findColumnOfLead(activeId);

            let overColId: string | null = null;
            if (overId.startsWith("column-")) {
                overColId = overId.replace("column-", "");
            } else {
                overColId = findColumnOfLead(overId);
            }

            if (!activeColId || !overColId || activeColId === overColId) return;

            setLeadsMap((prev) => {
                const sourceLeads = [...(prev[activeColId] || [])];
                const destLeads = [...(prev[overColId!] || [])];

                const activeIdx = sourceLeads.findIndex((l) => l.id === activeId);
                if (activeIdx === -1) return prev;

                const [movedLead] = sourceLeads.splice(activeIdx, 1);
                movedLead.kanbanColumnId = overColId!;

                let overIdx = destLeads.findIndex((l) => l.id === overId);
                if (overIdx === -1) overIdx = destLeads.length;
                destLeads.splice(overIdx, 0, movedLead);

                return { ...prev, [activeColId]: sourceLeads, [overColId!]: destLeads };
            });
        },
        [findColumnOfLead]
    );

    const handleDragEnd = useCallback(
        (event: DragEndEvent) => {
            const { active, over } = event;
            setActiveCard(null);
            if (!over) return;

            const activeId = active.id as string;
            const overId = over.id as string;
            const activeColId = findColumnOfLead(activeId);

            let overColId: string | null = null;
            if (overId.startsWith("column-")) {
                overColId = overId.replace("column-", "");
            } else {
                overColId = findColumnOfLead(overId);
            }

            if (!activeColId || !overColId) return;

            if (activeColId === overColId && activeId !== overId) {
                setLeadsMap((prev) => {
                    const colLeads = [...(prev[activeColId] || [])];
                    const oldIdx = colLeads.findIndex((l) => l.id === activeId);
                    const newIdx = colLeads.findIndex((l) => l.id === overId);
                    if (oldIdx === -1 || newIdx === -1) return prev;
                    return { ...prev, [activeColId]: arrayMove(colLeads, oldIdx, newIdx) };
                });
            }

            const finalColId = findColumnOfLead(activeId) || overColId;
            const finalLeads = leadsMap[finalColId] || [];
            const finalIdx = finalLeads.findIndex((l) => l.id === activeId);
            const lead = finalLeads.find((l) => l.id === activeId);

            // Verificar se é a coluna "Passeio Realizado"
            const targetCol = columns.find((c) => c.id === finalColId);
            if (targetCol?.slug === "passeio_realizado" && lead && !lead.passeioConfirmado) {
                // Salvar backup pra reverter se cancelar
                setPreConfirmLeadsMap({ ...leadsMap });
                setConfirmLead(lead);
                setConfirmColId(finalColId);
                setConfirmPosition(finalIdx >= 0 ? finalIdx : 0);
                setConfirmDate(new Date().toISOString().split("T")[0]);
                setConfirmError(null);
                setConfirmModal(true);
                return; // Não salvar ainda — esperar confirmação
            }

            if (targetCol?.slug === "passeio_realizado" && lead?.passeioConfirmado) {
                // Já confirmado, só mover normalmente
                moveLeadInKanban(activeId, finalColId, finalIdx >= 0 ? finalIdx : 0).catch(console.error);
                return;
            }

            // Mover normalmente
            moveLeadInKanban(activeId, finalColId, finalIdx >= 0 ? finalIdx : 0).catch(console.error);
        },
        [findColumnOfLead, leadsMap, columns]
    );

    // Confirmar passeio
    async function handleConfirmPasseio() {
        if (!confirmLead || !confirmDate) return;
        setConfirmLoading(true);
        setConfirmError(null);

        try {
            const res = await confirmPasseioRealizado(confirmLead.id, confirmDate);
            if (!res.success) {
                setConfirmError(res.error || "Erro desconhecido.");
                setConfirmLoading(false);
                return;
            }

            // Mover no banco
            await moveLeadInKanban(confirmLead.id, confirmColId, confirmPosition);

            // Atualizar lead localmente
            setLeadsMap((prev) => {
                const updated = { ...prev };
                for (const colId of Object.keys(updated)) {
                    updated[colId] = updated[colId].map((l) =>
                        l.id === confirmLead.id
                            ? { ...l, passeioConfirmado: true, dataPasseio: confirmDate }
                            : l
                    );
                }
                return updated;
            });

            setConfirmModal(false);
            setPreConfirmLeadsMap(null);
            onDataChanged?.();
        } catch (err) {
            console.error("Erro ao confirmar passeio:", err);
            setConfirmError("Erro ao confirmar. Tente novamente.");
        } finally {
            setConfirmLoading(false);
        }
    }

    // Cancelar confirmação → reverter
    function handleCancelConfirm() {
        if (preConfirmLeadsMap) {
            setLeadsMap(preConfirmLeadsMap);
        }
        setConfirmModal(false);
        setPreConfirmLeadsMap(null);
    }

    // Click → redirect to Conversas
    const handleLeadClick = useCallback(
        (leadId: string) => {
            // Find lead to get telefone
            for (const colLeads of Object.values(leadsMap)) {
                const lead = colLeads.find((l) => l.id === leadId);
                if (lead) {
                    router.push(`/conversas`);
                    return;
                }
            }
        },
        [router, leadsMap]
    );

    return (
        <>
            <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
            >
                <div className="flex gap-4 overflow-x-auto pb-4 h-[calc(100vh-180px)]">
                    {columns.map((column) => (
                        <KanbanColumn
                            key={column.id}
                            column={column}
                            leads={leadsMap[column.id] || []}
                            onLeadClick={handleLeadClick}
                            onColumnRenamed={handleColumnRenamed}
                        />
                    ))}

                    {/* Inline Add Column */}
                    {addingColumn ? (
                        <div className="flex flex-col w-[300px] min-w-[300px] rounded-2xl bg-slate-800/50 border-2 border-dashed border-brand-500/50 p-4 shrink-0">
                            <input
                                ref={newColRef}
                                value={newColName}
                                onChange={(e) => setNewColName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") handleAddColumn();
                                    if (e.key === "Escape") {
                                        setAddingColumn(false);
                                        setNewColName("");
                                    }
                                }}
                                placeholder="Nome da coluna..."
                                className="bg-slate-900 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-brand-400 mb-3"
                            />
                            <div className="flex gap-2">
                                <button
                                    onClick={handleAddColumn}
                                    className="flex-1 px-3 py-2 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors"
                                >
                                    Criar
                                </button>
                                <button
                                    onClick={() => { setAddingColumn(false); setNewColName(""); }}
                                    className="px-3 py-2 rounded-xl bg-slate-700 text-slate-300 text-sm font-medium hover:bg-slate-600 transition-colors"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button
                            onClick={() => setAddingColumn(true)}
                            className="flex flex-col items-center justify-center gap-2 w-[300px] min-w-[300px] min-h-[120px] rounded-2xl border-2 border-dashed border-slate-700 hover:border-brand-500/50 hover:bg-brand-500/5 text-slate-500 hover:text-brand-400 transition-all shrink-0 cursor-pointer"
                        >
                            <Plus className="w-6 h-6" />
                            <span className="text-sm font-medium">Adicionar Coluna</span>
                        </button>
                    )}
                </div>

                <DragOverlay dropAnimation={null}>
                    {activeCard ? <KanbanCard lead={activeCard} isOverlay /> : null}
                </DragOverlay>
            </DndContext>

            {/* Modal de Confirmação — Passeio Realizado */}
            <Dialog open={confirmModal} onOpenChange={(open) => { if (!open) handleCancelConfirm(); }}>
                <DialogContent className="bg-slate-800 border-2 border-slate-700 text-white max-w-md">
                    <DialogHeader>
                        <DialogTitle className="font-display text-lg text-white flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                            Confirmar Passeio Realizado?
                        </DialogTitle>
                        <DialogDescription className="text-slate-400">
                            Isso contará para a meta do mês e não poderá ser desfeito.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 mt-4">
                        {confirmLead && (
                            <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-700/50">
                                <p className="text-sm font-semibold text-white">{confirmLead.nomeEscola}</p>
                                {confirmLead.destino && (
                                    <p className="text-xs text-slate-400 mt-1">📍 {confirmLead.destino}</p>
                                )}
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                <CalendarDays className="w-3 h-3" />
                                Data do Passeio (obrigatório)
                            </Label>
                            <Input
                                type="date"
                                value={confirmDate}
                                onChange={(e) => setConfirmDate(e.target.value)}
                                className="bg-slate-900 border-slate-600 text-white rounded-xl"
                            />
                        </div>

                        {confirmError && (
                            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-sm">
                                <AlertTriangle className="w-4 h-4 shrink-0" />
                                {confirmError}
                            </div>
                        )}

                        <div className="flex gap-2">
                            <button
                                onClick={handleConfirmPasseio}
                                disabled={!confirmDate || confirmLoading}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 text-white font-medium text-sm hover:bg-emerald-600 disabled:opacity-40 transition-colors shadow-lg shadow-emerald-500/25"
                            >
                                {confirmLoading ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <CheckCircle2 className="w-4 h-4" />
                                )}
                                {confirmLoading ? "Confirmando..." : "Confirmar"}
                            </button>
                            <button
                                onClick={handleCancelConfirm}
                                className="px-4 py-2.5 rounded-xl bg-slate-700 text-slate-300 text-sm font-medium hover:bg-slate-600 transition-colors"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
