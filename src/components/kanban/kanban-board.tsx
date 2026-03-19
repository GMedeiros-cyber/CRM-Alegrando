"use client";

import { useCallback, useState, useRef, useEffect, useMemo } from "react";
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
import {
    arrayMove,
    SortableContext,
    horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useRouter } from "next/navigation";
import { KanbanColumn } from "./kanban-column";
import { KanbanCard } from "./kanban-card";
import {
    moveLeadInKanban,
    createKanbanColumn,
    reorderKanbanColumns,
} from "@/lib/actions/kanban";
import type {
    KanbanColumn as KanbanColumnType,
    KanbanLead,
} from "@/lib/actions/kanban";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface KanbanBoardProps {
    initialColumns: KanbanColumnType[];
    initialLeads: KanbanLead[];
    onDataChanged?: () => void;
}

export function KanbanBoard({
    initialColumns,
    initialLeads,
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
    const [activeColumnId, setActiveColumnId] = useState<string | null>(null);

    const pendingColumnOrder = useRef<string[]>([]);

    // Inline add column
    const [addingColumn, setAddingColumn] = useState(false);
    const [newColName, setNewColName] = useState("");
    const newColRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (addingColumn && newColRef.current) {
            newColRef.current.focus();
        }
    }, [addingColumn]);

    const COLORS = ["#8b5cf6", "#3b82f6", "#f59e0b", "#22c55e", "#ef5544", "#ec4899"];

    const sortedColumns = useMemo(() => {
        return [...columns].sort((a, b) => a.position - b.position);
    }, [columns]);

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
        } catch {
        }
    }

    function handleColumnRenamed(colId: string, newName: string) {
        setColumns((prev) =>
            prev.map((c) => (c.id === colId ? { ...c, name: newName } : c))
        );
    }

    function handleColumnDeleted(colId: string) {
        // Mover leads da coluna deletada para novo_lead
        const deletedLeads = leadsMap[colId] || [];
        const novoLeadCol = columns.find((c) => c.slug === "novo_lead");
        if (deletedLeads.length > 0 && novoLeadCol) {
            const movedLeads = deletedLeads.map((l) => ({
                ...l,
                kanbanColumnId: novoLeadCol.id,
            }));
            setLeadsMap((prev) => ({
                ...prev,
                [novoLeadCol.id]: [...(prev[novoLeadCol.id] || []), ...movedLeads],
            }));
        }
        setColumns((prev) => prev.filter((c) => c.id !== colId));
        setLeadsMap((prev) => {
            const next = { ...prev };
            delete next[colId];
            return next;
        });
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
            const id = event.active.id as string;

            if (id.startsWith("col-sortable-")) {
                const colId = id.replace("col-sortable-", "");
                const col = columns.find((c) => c.id === colId);
                if (col?.slug === "novo_lead") return;
                setActiveColumnId(colId);
                return;
            }

            const colId = findColumnOfLead(id);
            if (colId) {
                const lead = leadsMap[colId].find((l) => l.id === id);
                if (lead) setActiveCard(lead);
            }
        },
        [findColumnOfLead, leadsMap, columns]
    );

    const handleDragOver = useCallback(
        (event: DragOverEvent) => {
            const { active, over } = event;
            if (!over) return;

            const activeId = active.id as string;
            if (activeId.startsWith("col-sortable-")) return;

            const overId = over.id as string;
            if (overId.startsWith("col-sortable-")) return;

            const activeColId = findColumnOfLead(activeId);

            let overColId: string | null = null;
            if (overId.startsWith("column-")) {
                overColId = overId.replace("column-", "");
            } else {
                overColId = findColumnOfLead(overId);
            }

            if (!overColId) return;
            if (activeColId === overColId) return;
            if (!activeColId) return;

            setLeadsMap((prev) => {
                const destLeads = [...(prev[overColId!] || [])];
                const sourceLeads = [...(prev[activeColId!] || [])];
                const activeIdx = sourceLeads.findIndex((l) => l.id === activeId);
                if (activeIdx === -1) return prev;

                const [movedLead] = sourceLeads.splice(activeIdx, 1);
                movedLead.kanbanColumnId = overColId!;

                let overIdx = destLeads.findIndex((l) => l.id === overId);
                if (overIdx === -1) overIdx = destLeads.length;
                destLeads.splice(overIdx, 0, movedLead);

                return { ...prev, [activeColId!]: sourceLeads, [overColId!]: destLeads };
            });
        },
        [findColumnOfLead]
    );

    const handleDragEnd = useCallback(
        (event: DragEndEvent) => {
            const { active, over } = event;
            setActiveCard(null);
            setActiveColumnId(null);
            if (!over) return;

            const activeId = active.id as string;
            const overId = over.id as string;

            // === Column reorder ===
            if (activeId.startsWith("col-sortable-") && overId.startsWith("col-sortable-")) {
                const fromColId = activeId.replace("col-sortable-", "");
                const toColId = overId.replace("col-sortable-", "");
                const fromCol = columns.find((c) => c.id === fromColId);
                const toCol = columns.find((c) => c.id === toColId);

                if (fromCol?.slug === "novo_lead" || toCol?.slug === "novo_lead") return;

                if (fromColId !== toColId) {
                    setColumns((prev) => {
                        const oldIdx = prev.findIndex((c) => c.id === fromColId);
                        const newIdx = prev.findIndex((c) => c.id === toColId);
                        if (oldIdx === -1 || newIdx === -1) return prev;
                        const reordered = arrayMove(prev, oldIdx, newIdx);
                        pendingColumnOrder.current = reordered.map((c) => c.id);
                        return reordered;
                    });

                    setTimeout(() => {
                        if (pendingColumnOrder.current.length > 0) {
                            reorderKanbanColumns(pendingColumnOrder.current).catch(() => {});
                            pendingColumnOrder.current = [];
                        }
                    }, 0);
                }
                return;
            }

            // === Card movement (drag livre, sem modal) ===
            const activeColId = findColumnOfLead(activeId);

            let overColId: string | null = null;
            if (overId.startsWith("column-")) {
                overColId = overId.replace("column-", "");
            } else if (!overId.startsWith("col-sortable-")) {
                overColId = findColumnOfLead(overId);
            }

            if (!overColId) return;

            // Same column reorder
            if (activeColId === overColId && activeId !== overId) {
                setLeadsMap((prev) => {
                    const colLeads = [...(prev[activeColId!] || [])];
                    const oldIdx = colLeads.findIndex((l) => l.id === activeId);
                    const newIdx = colLeads.findIndex((l) => l.id === overId);
                    if (oldIdx === -1 || newIdx === -1) return prev;
                    return { ...prev, [activeColId!]: arrayMove(colLeads, oldIdx, newIdx) };
                });
            }

            // Persistir posição
            const finalColId = findColumnOfLead(activeId) || overColId;
            const finalLeads = leadsMap[finalColId] || [];
            const finalIdx = finalLeads.findIndex((l) => l.id === activeId);
            moveLeadInKanban(activeId, finalColId, finalIdx >= 0 ? finalIdx : 0).catch(() => {});
        },
        [findColumnOfLead, leadsMap, columns]
    );

    const handleLeadClick = useCallback(
        () => {
            router.push(`/conversas`);
        },
        [router]
    );

    const columnSortableIds = sortedColumns.map((c) => `col-sortable-${c.id}`);

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
        >
            <div className="flex h-[calc(100vh-180px)]">
                <div className="flex gap-4 overflow-x-auto pb-4 flex-1">
                    <SortableContext items={columnSortableIds} strategy={horizontalListSortingStrategy}>
                        {sortedColumns.map((column) => (
                            <KanbanColumn
                                key={column.id}
                                column={column}
                                leads={leadsMap[column.id] || []}
                                onLeadClick={handleLeadClick}
                                onColumnRenamed={handleColumnRenamed}
                                onColumnDeleted={handleColumnDeleted}
                            />
                        ))}
                    </SortableContext>

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
            </div>

            <DragOverlay dropAnimation={null}>
                {activeCard ? <KanbanCard lead={activeCard} isOverlay /> : null}
                {activeColumnId ? (
                    <div className="w-[300px] h-16 rounded-2xl bg-slate-700/80 border-2 border-brand-400 flex items-center justify-center text-sm font-semibold text-brand-400 shadow-xl">
                        {columns.find((c) => c.id === activeColumnId)?.name || "Coluna"}
                    </div>
                ) : null}
            </DragOverlay>
        </DndContext>
    );
}
