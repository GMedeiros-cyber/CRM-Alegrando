"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import {
    SortableContext,
    verticalListSortingStrategy,
    useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDroppable } from "@dnd-kit/core";
import { KanbanCard } from "./kanban-card";
import type { KanbanColumn as KanbanColumnType, KanbanLead } from "@/lib/actions/kanban";
import { renameKanbanColumn, deleteKanbanColumn } from "@/lib/actions/kanban";
import { cn } from "@/lib/utils";
import { Pencil, Check, Trash2, GripVertical } from "lucide-react";

interface KanbanColumnProps {
    column: KanbanColumnType;
    leads: KanbanLead[];
    onLeadClick?: (leadId: string) => void;
    onColumnRenamed?: (colId: string, newName: string) => void;
    onColumnDeleted?: (colId: string) => void;
}

export function KanbanColumn({ column, leads, onLeadClick, onColumnRenamed, onColumnDeleted }: KanbanColumnProps) {
    // Sortable for column reordering
    const {
        setNodeRef: setSortableRef,
        attributes: sortableAttrs,
        listeners: sortableListeners,
        transform,
        transition,
        isDragging: isColumnDragging,
    } = useSortable({
        id: `col-sortable-${column.id}`,
        data: { type: "column", column },
    });

    const sortableStyle = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    // Droppable for receiving cards
    const { setNodeRef: setDroppableRef, isOver } = useDroppable({
        id: `column-${column.id}`,
        data: { type: "column", column },
    });

    const leadIds = useMemo(() => leads.map((l) => l.id), [leads]);

    // Editable column name
    const [editing, setEditing] = useState(false);
    const [name, setName] = useState(column.name);
    const inputRef = useRef<HTMLInputElement>(null);

    // Delete confirmation
    const [confirmingDelete, setConfirmingDelete] = useState(false);

    const isProtected = !!column.slug;

    useEffect(() => {
        setName(column.name);
    }, [column.name]);

    useEffect(() => {
        if (editing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [editing]);

    async function handleSaveName() {
        const trimmed = name.trim();
        if (!trimmed) {
            setName(column.name);
            setEditing(false);
            return;
        }
        if (trimmed !== column.name) {
            try {
                await renameKanbanColumn(column.id, trimmed);
                onColumnRenamed?.(column.id, trimmed);
            } catch {
                setName(column.name);
            }
        }
        setEditing(false);
    }

    function handleKeyDown(e: React.KeyboardEvent) {
        if (e.key === "Enter") handleSaveName();
        if (e.key === "Escape") {
            setName(column.name);
            setEditing(false);
        }
    }

    async function handleDelete() {
        try {
            const res = await deleteKanbanColumn(column.id);
            if (res.success) {
                onColumnDeleted?.(column.id);
            }
        } catch (err) {
            console.error("Erro ao deletar coluna:", err);
        }
        setConfirmingDelete(false);
    }

    return (
        <div
            ref={setSortableRef}
            style={sortableStyle}
            className={cn(
                "flex flex-col w-[300px] min-w-[300px] rounded-2xl bg-slate-800/50 border-2 border-slate-700 shrink-0 transition-all duration-200 group/col",
                isOver && "bg-brand-500/10 ring-2 ring-brand-400 ring-inset border-brand-500",
                isColumnDragging && "opacity-40 shadow-none"
            )}
        >
            {/* Column header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b-2 border-slate-700">
                {/* Drag handle */}
                <button
                    {...sortableAttrs}
                    {...sortableListeners}
                    className="cursor-grab active:cursor-grabbing text-slate-600 hover:text-slate-400 transition-colors shrink-0"
                    title="Arrastar coluna"
                >
                    <GripVertical className="w-4 h-4" />
                </button>

                <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: column.color || "#6366f1" }}
                />

                {editing ? (
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <input
                            ref={inputRef}
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            onKeyDown={handleKeyDown}
                            onBlur={handleSaveName}
                            className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-2 py-1 text-sm font-semibold text-white outline-none focus:ring-2 focus:ring-brand-400 min-w-0"
                        />
                        <button
                            onClick={handleSaveName}
                            className="p-1 rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition-colors"
                        >
                            <Check className="w-3 h-3" />
                        </button>
                    </div>
                ) : (
                    <h3
                        onClick={() => setEditing(true)}
                        className="font-display text-sm font-semibold text-white truncate cursor-pointer group flex items-center gap-1.5 hover:text-brand-400 transition-colors flex-1 min-w-0"
                        title="Clique para editar o nome"
                    >
                        {name}
                        <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-slate-500" />
                    </h3>
                )}

                <span className="text-xs font-medium text-slate-400 bg-slate-700 px-2 py-0.5 rounded-full shrink-0">
                    {leads.length}
                </span>

                {/* Trash button — only on hover, only for non-protected columns */}
                {!isProtected && !confirmingDelete && (
                    <button
                        onClick={() => setConfirmingDelete(true)}
                        className="opacity-0 group-hover/col:opacity-100 text-slate-600 hover:text-red-400 transition-all shrink-0"
                        title="Excluir coluna"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>

            {/* Delete confirmation inline */}
            {confirmingDelete && (
                <div className="px-3 py-2 bg-red-500/10 border-b border-red-500/30">
                    <p className="text-xs text-red-400 font-medium mb-2">
                        Excluir coluna? Os leads voltam para a lista.
                    </p>
                    <div className="flex gap-1.5">
                        <button
                            onClick={handleDelete}
                            className="flex-1 px-2 py-1.5 rounded-lg bg-red-500 text-white text-xs font-medium hover:bg-red-600 transition-colors"
                        >
                            Confirmar
                        </button>
                        <button
                            onClick={() => setConfirmingDelete(false)}
                            className="flex-1 px-2 py-1.5 rounded-lg bg-slate-700 text-slate-300 text-xs font-medium hover:bg-slate-600 transition-colors"
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            )}

            {/* Cards area */}
            <div
                ref={setDroppableRef}
                className="flex-1 flex flex-col gap-2 px-2.5 py-2.5 min-h-[120px] overflow-y-auto"
            >
                <SortableContext items={leadIds} strategy={verticalListSortingStrategy}>
                    {leads.map((lead) => (
                        <KanbanCard
                            key={lead.id}
                            lead={lead}
                            onClick={() => onLeadClick?.(lead.id)}
                        />
                    ))}
                </SortableContext>

                {leads.length === 0 && (
                    <div className="flex-1 flex items-center justify-center py-8 text-xs text-slate-600 border-2 border-dashed border-slate-700 rounded-xl">
                        Arraste leads aqui
                    </div>
                )}
            </div>
        </div>
    );
}
