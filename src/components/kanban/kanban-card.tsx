"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { KanbanLead } from "@/lib/actions/kanban";
import { addLeadTask, toggleLeadTask, deleteLeadTask } from "@/lib/actions/kanban";
import { CalendarDays, Users, Bot, UserRound, Plus, Trash2, CheckSquare, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

type CheckItem = { id: string; text: string; done: boolean };

interface KanbanCardProps {
    lead: KanbanLead;
    isOverlay?: boolean;
    onClick?: () => void;
}

export function KanbanCard({ lead, isOverlay, onClick }: KanbanCardProps) {
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

    // Checklist & Collapse state
    const [checkItems, setCheckItems] = useState<CheckItem[]>(lead.tasks || []);
    const [newItemText, setNewItemText] = useState("");
    const [showChecklist, setShowChecklist] = useState(false);
    const [collapsed, setCollapsed] = useState(false);

    async function addCheckItem() {
        const text = newItemText.trim();
        if (!text) return;
        const tempId = `temp-${Date.now()}`;
        setCheckItems((prev) => [...prev, { id: tempId, text, done: false }]);
        setNewItemText("");
        const result = await addLeadTask(Number(lead.telefone), text);
        if (result) {
            setCheckItems((prev) =>
                prev.map((item) => item.id === tempId ? result : item)
            );
        }
    }

    async function toggleCheckItem(id: string) {
        const item = checkItems.find((i) => i.id === id);
        if (!item) return;
        setCheckItems((prev) =>
            prev.map((i) => i.id === id ? { ...i, done: !i.done } : i)
        );
        await toggleLeadTask(id, !item.done);
    }

    async function removeCheckItem(id: string) {
        setCheckItems((prev) => prev.filter((item) => item.id !== id));
        await deleteLeadTask(id);
    }

    const doneCount = checkItems.filter((i) => i.done).length;
    const pendingCount = checkItems.filter((i) => !i.done).length;
    const allDone = checkItems.length > 0 && pendingCount === 0;

    // Ordenar: pendentes primeiro, concluídas depois
    const sortedItems = [...checkItems].sort((a, b) => {
        if (a.done === b.done) return 0;
        return a.done ? 1 : -1;
    });

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            className={cn(
                "group bg-slate-800 rounded-xl border-2 border-slate-700 p-3.5 cursor-grab active:cursor-grabbing",
                "hover:shadow-md hover:border-slate-600 transition-all duration-200",
                isDragging && "opacity-30 shadow-none",
                isOverlay && "shadow-xl rotate-[2deg] scale-105 border-brand-400"
            )}
        >
            {/* Header: school name + toggle */}
            <div className="flex items-start justify-between gap-2 mb-2" onClick={onClick}>
                <h4 className="flex-1 text-sm font-semibold text-slate-200 leading-tight line-clamp-2">
                    {lead.nomeEscola}
                </h4>
                <button
                    onClick={e => { e.stopPropagation(); setCollapsed(prev => !prev); }}
                    className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-700 transition-colors shrink-0"
                    title={collapsed ? "Expandir" : "Recolher"}
                >
                    {collapsed
                        ? <ChevronDown className="w-3.5 h-3.5" />
                        : <ChevronUp className="w-3.5 h-3.5" />
                    }
                </button>
            </div>

            {/* Collapsible Content */}
            {!collapsed && (
                <>
                    {/* Details */}
            <div className="space-y-1.5" onClick={onClick}>
                {lead.destino && (
                    <p className="text-xs text-slate-400 truncate">
                        📍 {lead.destino}
                    </p>
                )}

                <div className="flex items-center gap-3 text-xs text-slate-500">
                    {lead.dataEvento && (
                        <span className="flex items-center gap-1">
                            <CalendarDays className="w-3 h-3" />
                            {lead.dataEvento}
                        </span>
                    )}
                    {lead.quantidadeAlunos && (
                        <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {lead.quantidadeAlunos}
                        </span>
                    )}
                </div>
            </div>

            {/* Checklist section */}
            {(showChecklist || checkItems.length > 0) && (
                <div className="mt-2.5 pt-2 border-t border-slate-700 space-y-1.5">
                    {/* Progress bar */}
                    {checkItems.length > 0 && (
                        <div className="flex items-center gap-2 mb-1">
                            <CheckSquare className="w-3 h-3 text-slate-500" />
                            <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-brand-500 rounded-full transition-all duration-300"
                                    style={{
                                        width: `${checkItems.length > 0 ? (doneCount / checkItems.length) * 100 : 0}%`,
                                    }}
                                />
                            </div>
                            <span className="text-[10px] font-medium text-slate-500">
                                {doneCount}/{checkItems.length}
                            </span>
                        </div>
                    )}

                    {/* Items — sorted: pending first, done last */}
                    {sortedItems.map((item) => (
                        <div
                            key={item.id}
                            className="flex items-center gap-2 group/check"
                        >
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    toggleCheckItem(item.id);
                                }}
                                className={cn(
                                    "w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                                    item.done
                                        ? "bg-brand-500 border-brand-500"
                                        : "border-slate-600 hover:border-slate-400"
                                )}
                            >
                                {item.done && (
                                    <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 12 12" fill="none">
                                        <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                )}
                            </button>
                            <span
                                className={cn(
                                    "text-xs flex-1 min-w-0 truncate",
                                    item.done
                                        ? "text-slate-600 line-through opacity-50"
                                        : "text-slate-300"
                                )}
                            >
                                {item.text}
                            </span>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    removeCheckItem(item.id);
                                }}
                                className="opacity-0 group-hover/check:opacity-100 text-red-400 hover:text-red-300 transition-opacity"
                            >
                                <Trash2 className="w-3 h-3" />
                            </button>
                        </div>
                    ))}

                    {/* Add item input */}
                    <div className="flex items-center gap-1.5">
                        <input
                            value={newItemText}
                            onChange={(e) => setNewItemText(e.target.value)}
                            onKeyDown={(e) => {
                                e.stopPropagation();
                                if (e.key === "Enter") addCheckItem();
                            }}
                            placeholder="+ Adicionar tarefa..."
                            className="flex-1 bg-slate-900/60 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white placeholder:text-slate-600 outline-none focus:ring-1 focus:ring-brand-400 focus:border-brand-400"
                            onClick={(e) => e.stopPropagation()}
                        />
                        {newItemText.trim() && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    addCheckItem();
                                }}
                                className="p-1.5 rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition-colors"
                            >
                                <Plus className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                </div>
            )}

                    {/* Footer: checklist toggle + AI status */}
                    <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-slate-700">
                        <div className="flex items-center gap-1.5">
                    {/* Checklist toggle button */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowChecklist((v) => !v);
                        }}
                        className={cn(
                            "flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-md transition-colors",
                            showChecklist || checkItems.length > 0
                                ? "bg-brand-500/20 text-brand-400"
                                : "bg-slate-700 text-slate-500 hover:text-slate-300"
                        )}
                        title="Abrir checklist de tarefas"
                    >
                        <CheckSquare className="w-2.5 h-2.5" />
                        {checkItems.length > 0 ? (
                            allDone ? (
                                <span className="text-emerald-400">✓</span>
                            ) : (
                                <span>{pendingCount}</span>
                            )
                        ) : (
                            <span>Tasks</span>
                        )}
                    </button>

                    {/* AI status indicator */}
                    <div
                        className={cn(
                            "flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md",
                            lead.iaAtiva
                                ? "bg-emerald-500/20 text-emerald-400"
                                : "bg-orange-500/20 text-orange-400"
                        )}
                    >
                        {lead.iaAtiva ? (
                            <Bot className="w-2.5 h-2.5" />
                        ) : (
                            <UserRound className="w-2.5 h-2.5" />
                        )}
                            {lead.iaAtiva ? "IA" : "Manual"}
                        </div>
                    </div>
                </div>
                </>
            )}
        </div>
    );
}
