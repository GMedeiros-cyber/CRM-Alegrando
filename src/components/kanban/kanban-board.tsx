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
import {
    arrayMove,
    SortableContext,
    horizontalListSortingStrategy,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRouter } from "next/navigation";
import { KanbanColumn } from "./kanban-column";
import { KanbanCard } from "./kanban-card";
import {
    moveLeadInKanban,
    createKanbanColumn,
    confirmPasseioRealizado,
    reorderKanbanColumns,
    getLeadsSemColuna,
} from "@/lib/actions/kanban";
import type {
    KanbanColumn as KanbanColumnType,
    KanbanLead,
} from "@/lib/actions/kanban";
import {
    Plus,
    Loader2,
    AlertTriangle,
    CheckCircle2,
    Phone,
} from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

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
    const [activeColumnId, setActiveColumnId] = useState<string | null>(null);

    // Leads sem coluna (sidebar)
    const [unallocatedLeads, setUnallocatedLeads] = useState<KanbanLead[]>([]);
    const [loadingSidebar, setLoadingSidebar] = useState(true);

    // Snapshot para reverter se cancelar modal
    const leadsMapSnapshot = useRef<Record<string, KanbanLead[]> | null>(null);
    const unallocatedSnapshot = useRef<KanbanLead[] | null>(null);

    useEffect(() => {
        getLeadsSemColuna()
            .then(setUnallocatedLeads)
            .finally(() => setLoadingSidebar(false));
    }, []);

    // Inline add column
    const [addingColumn, setAddingColumn] = useState(false);
    const [newColName, setNewColName] = useState("");
    const newColRef = useRef<HTMLInputElement>(null);

    // Modal de confirmação "Passeio Realizado"
    const [confirmModal, setConfirmModal] = useState(false);
    const [confirmLead, setConfirmLead] = useState<KanbanLead | null>(null);
    const [confirmLoading, setConfirmLoading] = useState(false);
    const [confirmError, setConfirmError] = useState<string | null>(null);

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

    function handleColumnDeleted(colId: string) {
        const deletedLeads = leadsMap[colId] || [];
        if (deletedLeads.length > 0) {
            setUnallocatedLeads((prev) => [...deletedLeads, ...prev]);
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

    const isUnallocatedLead = useCallback(
        (leadId: string): boolean => {
            return unallocatedLeads.some((l) => l.id === leadId);
        },
        [unallocatedLeads]
    );

    // === DRAG START: salvar snapshot ===
    const handleDragStart = useCallback(
        (event: DragStartEvent) => {
            const id = event.active.id as string;

            // Salvar snapshot
            leadsMapSnapshot.current = JSON.parse(JSON.stringify(leadsMap));
            unallocatedSnapshot.current = [...unallocatedLeads];

            if (id.startsWith("col-sortable-")) {
                setActiveColumnId(id.replace("col-sortable-", ""));
                return;
            }

            if (isUnallocatedLead(id)) {
                const lead = unallocatedLeads.find((l) => l.id === id);
                if (lead) setActiveCard(lead);
                return;
            }

            const colId = findColumnOfLead(id);
            if (colId) {
                const lead = leadsMap[colId].find((l) => l.id === id);
                if (lead) setActiveCard(lead);
            }
        },
        [findColumnOfLead, leadsMap, isUnallocatedLead, unallocatedLeads]
    );

    const handleDragOver = useCallback(
        (event: DragOverEvent) => {
            const { active, over } = event;
            if (!over) return;

            const activeId = active.id as string;
            if (activeId.startsWith("col-sortable-")) return;

            const overId = over.id as string;
            if (overId.startsWith("col-sortable-")) return;

            const fromUnallocated = isUnallocatedLead(activeId);
            const activeColId = fromUnallocated ? null : findColumnOfLead(activeId);

            let overColId: string | null = null;
            if (overId.startsWith("column-")) {
                overColId = overId.replace("column-", "");
            } else {
                overColId = findColumnOfLead(overId);
            }

            if (!overColId) return;
            if (!fromUnallocated && activeColId === overColId) return;
            if (!fromUnallocated && !activeColId) return;

            setLeadsMap((prev) => {
                const destLeads = [...(prev[overColId!] || [])];

                if (fromUnallocated) {
                    const lead = unallocatedLeads.find((l) => l.id === activeId);
                    if (!lead) return prev;
                    if (destLeads.some((l) => l.id === activeId)) return prev;

                    const movedLead = { ...lead, kanbanColumnId: overColId! };
                    let overIdx = destLeads.findIndex((l) => l.id === overId);
                    if (overIdx === -1) overIdx = destLeads.length;
                    destLeads.splice(overIdx, 0, movedLead);

                    setUnallocatedLeads((ul) => ul.filter((l) => l.id !== activeId));
                    return { ...prev, [overColId!]: destLeads };
                }

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
        [findColumnOfLead, isUnallocatedLead, unallocatedLeads]
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
                if (fromColId !== toColId) {
                    let newOrder: string[] = [];
                    setColumns((prev) => {
                        const oldIdx = prev.findIndex((c) => c.id === fromColId);
                        const newIdx = prev.findIndex((c) => c.id === toColId);
                        if (oldIdx === -1 || newIdx === -1) return prev;
                        const reordered = arrayMove(prev, oldIdx, newIdx);
                        newOrder = reordered.map((c) => c.id);
                        return reordered;
                    });
                    setTimeout(() => {
                        reorderKanbanColumns(newOrder).catch(console.error);
                    }, 0);
                }
                return;
            }

            // === Card movement ===
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

            const finalColId = findColumnOfLead(activeId) || overColId;
            const finalLeads = leadsMap[finalColId] || [];
            const lead = finalLeads.find((l) => l.id === activeId);

            // === "Passeio Realizado" → abrir modal ===
            const targetCol = columns.find((c) => c.id === finalColId);
            if (targetCol?.slug === "passeio_realizado" && lead) {
                setConfirmLead(lead);
                setConfirmError(null);
                setConfirmModal(true);
                return;
            }

            // Mover normalmente
            const finalIdx = finalLeads.findIndex((l) => l.id === activeId);
            moveLeadInKanban(activeId, finalColId, finalIdx >= 0 ? finalIdx : 0).catch(console.error);
        },
        [findColumnOfLead, leadsMap, columns]
    );

    // === Confirmar passeio → lead fica 5s na coluna, depois vai pra sidebar ===
    async function handleConfirmPasseio() {
        if (!confirmLead) return;
        setConfirmLoading(true);
        setConfirmError(null);

        try {
            // 1. Confirmar (INSERT em passeios_realizados — data = now)
            const res = await confirmPasseioRealizado(confirmLead.telefone, confirmLead.destino);
            if (!res.success) {
                setConfirmError(res.error || "Erro desconhecido.");
                setConfirmLoading(false);
                return;
            }

            setConfirmModal(false);
            leadsMapSnapshot.current = null;
            unallocatedSnapshot.current = null;

            const leadId = confirmLead.id;
            const dataPasseio = res.dataPasseio || new Date().toISOString().split("T")[0];

            // 2. Após 5 segundos, mover para null e sidebar
            setTimeout(async () => {
                await moveLeadInKanban(leadId, null, 0);

                // Remover do board
                setLeadsMap((prev) => {
                    const updated = { ...prev };
                    for (const colId of Object.keys(updated)) {
                        updated[colId] = updated[colId].filter((l) => l.id !== leadId);
                    }
                    return updated;
                });

                // Adicionar na sidebar com tag
                const updatedLead: KanbanLead = {
                    ...confirmLead,
                    kanbanColumnId: "",
                    ultimoPasseio: { data: dataPasseio, destino: confirmLead.destino || null },
                    totalPasseios: (confirmLead.totalPasseios || 0) + 1,
                };
                setUnallocatedLeads((prev) => [updatedLead, ...prev]);
                onDataChanged?.();
            }, 5000);
        } catch (err) {
            console.error("Erro ao confirmar passeio:", err);
            setConfirmError("Erro ao confirmar. Tente novamente.");
        } finally {
            setConfirmLoading(false);
        }
    }

    // Cancelar → restaurar snapshot
    function handleCancelConfirm() {
        if (leadsMapSnapshot.current) {
            setLeadsMap(leadsMapSnapshot.current);
        }
        if (unallocatedSnapshot.current) {
            setUnallocatedLeads(unallocatedSnapshot.current);
        }
        setConfirmModal(false);
        leadsMapSnapshot.current = null;
        unallocatedSnapshot.current = null;
    }

    const handleLeadClick = useCallback(
        () => {
            router.push(`/conversas`);
        },
        [router]
    );

    const columnSortableIds = columns.map((c) => `col-sortable-${c.id}`);
    const unallocatedIds = unallocatedLeads.map((l) => l.id);

    return (
        <>
            <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
            >
                <div className="flex h-[calc(100vh-180px)]">
                    {/* === SIDEBAR: Leads sem coluna === */}
                    <div className="w-[220px] min-w-[220px] flex flex-col bg-slate-800/40 border-2 border-slate-700 rounded-2xl mr-4 shrink-0">
                        <div className="px-3 py-3 border-b border-slate-700">
                            <div className="flex items-center justify-between">
                                <h3 className="font-display text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                    Leads sem coluna
                                </h3>
                                <span className="text-[10px] font-medium text-slate-500 bg-slate-700 px-1.5 py-0.5 rounded-full">
                                    {unallocatedLeads.length}
                                </span>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1.5">
                            {loadingSidebar ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
                                </div>
                            ) : unallocatedLeads.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-8 gap-1.5 text-center">
                                    <CheckCircle2 className="w-5 h-5 text-emerald-500/50" />
                                    <p className="text-[11px] text-slate-600 leading-tight">
                                        Todos os leads estão alocados ✓
                                    </p>
                                </div>
                            ) : (
                                <SortableContext items={unallocatedIds} strategy={verticalListSortingStrategy}>
                                    {unallocatedLeads.map((lead) => (
                                        <UnallocatedLeadItem key={lead.id} lead={lead} />
                                    ))}
                                </SortableContext>
                            )}
                        </div>
                    </div>

                    {/* === BOARD === */}
                    <div className="flex gap-4 overflow-x-auto pb-4 flex-1">
                        <SortableContext items={columnSortableIds} strategy={horizontalListSortingStrategy}>
                            {columns.map((column) => (
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

            {/* Modal simplificado — Passeio Realizado (sem campo de data) */}
            <Dialog open={confirmModal} onOpenChange={(open) => { if (!open) handleCancelConfirm(); }}>
                <DialogContent className="bg-slate-800 border-2 border-slate-700 text-white max-w-md">
                    <DialogHeader>
                        <DialogTitle className="font-display text-lg text-white flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                            Confirmar Passeio Realizado?
                        </DialogTitle>
                        <DialogDescription className="text-slate-400">
                            O lead voltará para &quot;Leads sem coluna&quot; com a tag do passeio registrado.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 mt-4">
                        {confirmLead && (
                            <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-700/50">
                                <p className="text-sm font-semibold text-white">{confirmLead.nomeEscola}</p>
                                {confirmLead.destino && (
                                    <p className="text-xs text-slate-400 mt-1">📍 {confirmLead.destino}</p>
                                )}
                                {confirmLead.telefone && (
                                    <p className="text-xs text-slate-500 mt-0.5">📱 {confirmLead.telefone}</p>
                                )}
                            </div>
                        )}

                        {confirmError && (
                            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-sm">
                                <AlertTriangle className="w-4 h-4 shrink-0" />
                                {confirmError}
                            </div>
                        )}

                        <div className="flex gap-2">
                            <button
                                onClick={handleConfirmPasseio}
                                disabled={confirmLoading}
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

// =============================================
// Unallocated Lead Item (draggable) — com tag de passeio
// =============================================

function UnallocatedLeadItem({ lead }: { lead: KanbanLead }) {
    const {
        setNodeRef,
        attributes,
        listeners,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: lead.id,
        data: { type: "lead", lead },
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    function formatDate(dateStr: string) {
        const [y, m, d] = dateStr.split("-");
        return `${d}/${m}/${y}`;
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            className={cn(
                "bg-slate-900/60 border border-slate-700/50 rounded-xl px-3 py-2 cursor-grab active:cursor-grabbing hover:border-slate-600 transition-colors",
                isDragging && "opacity-30"
            )}
        >
            <p className="text-xs font-semibold text-slate-300 truncate">{lead.nomeEscola}</p>
            {lead.telefone && (
                <p className="text-[10px] text-slate-600 mt-0.5 flex items-center gap-1">
                    <Phone className="w-2.5 h-2.5" />
                    {lead.telefone}
                </p>
            )}
            {/* Tag de passeio */}
            {lead.totalPasseios > 0 && lead.ultimoPasseio && (
                <div className="mt-1.5">
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded-lg px-1.5 py-0.5">
                        ✅ {formatDate(lead.ultimoPasseio.data)}
                        {lead.totalPasseios > 1 && (
                            <span className="text-emerald-500/60"> · +{lead.totalPasseios - 1} passeio{lead.totalPasseios > 2 ? "s" : ""}</span>
                        )}
                    </span>
                </div>
            )}
        </div>
    );
}
