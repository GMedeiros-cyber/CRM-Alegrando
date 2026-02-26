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
import { moveLeadInKanban, createKanbanColumn } from "@/lib/actions/kanban";
import type {
    KanbanColumn as KanbanColumnType,
    KanbanLead,
} from "@/lib/actions/kanban";
import { Plus } from "lucide-react";

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
            setColumns((prev) => [...prev, {
                id: created.id,
                name: created.name,
                position: created.position,
                color: created.color,
            }]);
            setLeadsMap((prev) => ({ ...prev, [created.id]: [] }));
            setNewColName("");
            setAddingColumn(false);
        } catch (err) {
            console.error("Erro ao criar coluna:", err);
        }
    }

    // Column renamed callback
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

            moveLeadInKanban(activeId, finalColId, finalIdx >= 0 ? finalIdx : 0).catch(
                console.error
            );
        },
        [findColumnOfLead, leadsMap]
    );

    // Click → redirect to Conversas
    const handleLeadClick = useCallback(
        (leadId: string) => {
            router.push(`/conversas?leadId=${leadId}`);
        },
        [router]
    );

    return (
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
    );
}
