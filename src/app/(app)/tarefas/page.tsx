"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { Plus, X, MoreHorizontal, GripVertical, Check, Trash2, User as UserIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    DndContext,
    DragOverlay,
    PointerSensor,
    useSensor,
    useSensors,
    closestCorners,
    DragStartEvent,
    DragEndEvent,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    horizontalListSortingStrategy,
    useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// Server Actions
import {
    getTaskBoard,
    createTaskList,
    renameTaskList,
    deleteTaskList,
    reorderTaskLists,
    createTaskCard,
    updateTaskCard,
    deleteTaskCard,
    assignTaskCard,
    getUsers,
} from "@/lib/actions/tasks";
import type { TaskList, TaskCard } from "@/lib/actions/tasks";

// =============================================
// Dropdown Menu & Confirmation Helper
// =============================================
function useClickOutside(ref: React.RefObject<HTMLElement | null>, handler: () => void) {
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                handler();
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [ref, handler]);
}

// =============================================
// Card Modal
// =============================================
function CardModal({
    card,
    listName,
    users,
    onClose,
    onUpdate,
    onDelete,
    onAssign
}: {
    card: TaskCard;
    listName: string;
    users: { id: string; name: string; avatarUrl: string | null }[];
    onClose: () => void;
    onUpdate: (id: string, data: { title?: string; description?: string }) => void;
    onDelete: (id: string) => void;
    onAssign: (id: string, userId: string | null) => void;
}) {
    const [title, setTitle] = useState(card.title);
    const [desc, setDesc] = useState(card.description || "");
    const [assignMenuOpen, setAssignMenuOpen] = useState(false);
    const [isPending, startTransition] = useTransition();

    function handleSave() {
        startTransition(async () => {
            await updateTaskCard(card.id, { title, description: desc });
            onUpdate(card.id, { title, description: desc });
            onClose();
        });
    }

    function handleDelete() {
        startTransition(async () => {
            await deleteTaskCard(card.id);
            onDelete(card.id);
            onClose();
        });
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
            <div
                className="bg-slate-800 rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-5 border border-slate-700"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex justify-between items-start">
                    <div className="space-y-1 w-full mr-4">
                        <input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="bg-transparent text-xl font-bold text-slate-100 outline-none w-full focus:border-b border-brand-500"
                            placeholder="Título do cartão..."
                        />
                        <p className="text-xs text-slate-400">Na lista <span className="font-medium underline">{listName}</span></p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-300">Descrição</label>
                    <textarea
                        value={desc}
                        onChange={(e) => setDesc(e.target.value)}
                        placeholder="Adicione uma descrição mais detalhada..."
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-slate-200 placeholder:text-slate-500 outline-none min-h-[100px] focus:ring-1 focus:ring-brand-500"
                    />
                </div>

                <div className="space-y-2 relative">
                    <label className="text-sm font-semibold text-slate-300">Atribuído a</label>
                    <div
                        className="flex items-center gap-2 bg-slate-900 border border-slate-700 p-2 rounded-lg cursor-pointer hover:border-slate-500 transition-colors"
                        onClick={() => setAssignMenuOpen(!assignMenuOpen)}
                    >
                        {card.assignedUser ? (
                            <>
                                {card.assignedUser.avatarUrl ? (
                                    <img src={card.assignedUser.avatarUrl} alt="" className="w-6 h-6 rounded-full" />
                                ) : (
                                    <div className="w-6 h-6 rounded-full bg-brand-500 flex items-center justify-center text-[10px] font-bold text-white">
                                        {card.assignedUser.name.charAt(0)}
                                    </div>
                                )}
                                <span className="text-sm text-slate-200">{card.assignedUser.name}</span>
                            </>
                        ) : (
                            <>
                                <UserIcon className="w-5 h-5 text-slate-500 ml-1" />
                                <span className="text-sm text-slate-500">Sem atribuição</span>
                            </>
                        )}
                    </div>
                    {assignMenuOpen && (
                        <div className="absolute top-16 left-0 w-full bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-10 py-1">
                            <button
                                onClick={() => {
                                    startTransition(async () => {
                                        await assignTaskCard(card.id, null);
                                        onAssign(card.id, null);
                                        setAssignMenuOpen(false);
                                    });
                                }}
                                className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700"
                            >
                                Remover atribuição
                            </button>
                            {users.map(u => (
                                <button
                                    key={u.id}
                                    onClick={() => {
                                        startTransition(async () => {
                                            await assignTaskCard(card.id, u.id);
                                            onAssign(card.id, u.id);
                                            setAssignMenuOpen(false);
                                        });
                                    }}
                                    className="w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-slate-700 flex items-center gap-3"
                                >
                                    {u.avatarUrl ? (
                                        <img src={u.avatarUrl} alt="" className="w-6 h-6 rounded-full" />
                                    ) : (
                                        <div className="w-6 h-6 rounded-full bg-brand-500 flex items-center justify-center text-[10px] font-bold text-white">
                                            {u.name.charAt(0)}
                                        </div>
                                    )}
                                    {u.name}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="pt-4 flex justify-between items-center border-t border-slate-700">
                    <button
                        onClick={handleDelete}
                        disabled={isPending}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-lg transition-colors"
                    >
                        <Trash2 className="w-4 h-4" />
                        Excluir Cartão
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isPending}
                        className="px-5 py-2.5 bg-brand-500 text-white text-sm font-semibold rounded-lg hover:bg-brand-600 transition-colors disabled:opacity-50"
                    >
                        {isPending ? "Salvando..." : "Salvar Alterações"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// =============================================
// Card Component
// =============================================
function TrelloCard({ card, onClick }: { card: TaskCard; onClick: () => void }) {
    return (
        <div
            onClick={onClick}
            className="bg-slate-700/90 hover:bg-slate-600/90 rounded-lg border border-slate-600/50 hover:border-slate-500/60 p-3 cursor-pointer transition-all duration-150 group shadow-sm hover:shadow-md relative"
        >
            <p className="text-[13px] text-slate-200 leading-snug pr-4">
                {card.title}
            </p>
            {card.description && (
                <div className="mt-2 w-4 h-1 bg-slate-500/50 rounded-full" />
            )}

            {card.assignedUser && (
                <div className="absolute bottom-2 right-2" title={`Atribuído a ${card.assignedUser.name}`}>
                    {card.assignedUser.avatarUrl ? (
                        <img src={card.assignedUser.avatarUrl} alt="" className="w-5 h-5 rounded-full ring-2 ring-slate-800" />
                    ) : (
                        <div className="w-5 h-5 rounded-full bg-brand-500 flex items-center justify-center text-[9px] font-bold text-white ring-2 ring-slate-800">
                            {card.assignedUser.name.charAt(0)}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// =============================================
// List Component
// =============================================
function TrelloList({
    list,
    allListsCount,
    onAddCard,
    onRenameList,
    onDeleteList,
    onReorderListRequest,
    onCardClick,
}: {
    list: TaskList;
    allListsCount: number;
    onAddCard: (listId: string, title: string) => void;
    onRenameList: (listId: string, name: string) => void;
    onDeleteList: (listId: string) => void;
    onReorderListRequest: (listId: string, newIndex: number) => void;
    onCardClick: (card: TaskCard, listName: string) => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: `list-${list.id}`,
        data: { list },
    });

    const style = {
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
    };

    const [addingCard, setAddingCard] = useState(false);
    const [newCardTitle, setNewCardTitle] = useState("");
    const cardInputRef = useRef<HTMLTextAreaElement>(null);

    const [editingName, setEditingName] = useState(false);
    const [name, setName] = useState(list.name);
    const nameRef = useRef<HTMLInputElement>(null);

    const [menuOpen, setMenuOpen] = useState(false);
    const [subMoveOpen, setSubMoveOpen] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useClickOutside(menuRef, () => {
        setMenuOpen(false);
        setSubMoveOpen(false);
        setConfirmDelete(false);
    });

    useEffect(() => {
        if (editingName && nameRef.current) {
            nameRef.current.focus();
            nameRef.current.select();
        }
    }, [editingName]);

    useEffect(() => {
        if (addingCard && cardInputRef.current) {
            cardInputRef.current.focus();
        }
    }, [addingCard]);

    function handleSaveName() {
        const trimmed = name.trim();
        if (trimmed && trimmed !== list.name) {
            onRenameList(list.id, trimmed);
        } else {
            setName(list.name);
        }
        setEditingName(false);
    }

    function handleAddCardSubmit() {
        const title = newCardTitle.trim();
        if (title) {
            onAddCard(list.id, title);
            setNewCardTitle("");
        } else {
            setAddingCard(false);
        }
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="flex flex-col w-[280px] min-w-[280px] max-h-full rounded-xl bg-slate-800 shrink-0 select-none relative"
        >
            {/* Header (Arrastável) */}
            <div
                {...attributes}
                {...listeners}
                className="flex items-center gap-2 px-3 pt-3 pb-2 cursor-grab active:cursor-grabbing"
            >
                {editingName ? (
                    <input
                        ref={nameRef}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onBlur={handleSaveName}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveName();
                            if (e.key === "Escape") {
                                setName(list.name);
                                setEditingName(false);
                            }
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="flex-1 bg-slate-900 border-2 border-brand-400 rounded-lg px-2 py-1 text-sm font-bold text-white outline-none cursor-text"
                    />
                ) : (
                    <h3
                        onClick={(e) => {
                            e.stopPropagation();
                            setEditingName(true);
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="flex-1 text-sm font-bold text-slate-200 cursor-text px-1 py-0.5 rounded hover:bg-slate-700 transition-colors truncate"
                    >
                        {name}
                    </h3>
                )}

                {/* List Menu */}
                <div className="relative" ref={menuRef}>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setMenuOpen(!menuOpen);
                            setSubMoveOpen(false);
                            setConfirmDelete(false);
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-700 transition-colors"
                    >
                        <MoreHorizontal className="w-4 h-4" />
                    </button>

                    {menuOpen && (
                        <div className="absolute right-0 top-8 w-60 bg-slate-900 border border-slate-700/50 shadow-xl rounded-xl py-1.5 z-20" onPointerDown={(e) => e.stopPropagation()}>
                            {!confirmDelete && !subMoveOpen ? (
                                <>
                                    <button
                                        onClick={() => { setAddingCard(true); setMenuOpen(false); }}
                                        className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
                                    >
                                        Adicionar cartão
                                    </button>
                                    <button
                                        onClick={() => setSubMoveOpen(true)}
                                        className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
                                    >
                                        Mover lista...
                                    </button>
                                    <div className="my-1 border-t border-slate-800"></div>
                                    <button
                                        onClick={() => setConfirmDelete(true)}
                                        className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-400/10"
                                    >
                                        Excluir lista
                                    </button>
                                </>
                            ) : confirmDelete ? (
                                <div className="px-3 py-2 space-y-3">
                                    <p className="text-sm font-medium text-slate-300 leading-snug">Excluir lista e todos os cartões?</p>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => onDeleteList(list.id)}
                                            className="flex-1 bg-red-500/20 text-red-400 hover:bg-red-500/30 py-1.5 rounded-lg text-xs font-semibold"
                                        >
                                            Confirmar
                                        </button>
                                        <button
                                            onClick={() => setConfirmDelete(false)}
                                            className="flex-1 bg-slate-800 text-slate-300 hover:bg-slate-700 py-1.5 rounded-lg text-xs font-semibold"
                                        >
                                            Cancelar
                                        </button>
                                    </div>
                                </div>
                            ) : subMoveOpen ? (
                                <div className="px-3 py-2">
                                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Mover para posição:</p>
                                    <div className="max-h-[150px] overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                                        {Array.from({ length: allListsCount }).map((_, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => {
                                                    onReorderListRequest(list.id, idx);
                                                    setMenuOpen(false);
                                                }}
                                                className={cn(
                                                    "w-full text-left px-3 py-1.5 rounded text-sm transition-colors",
                                                    idx === list.position
                                                        ? "bg-brand-500/20 text-brand-400 font-medium"
                                                        : "text-slate-300 hover:bg-slate-800"
                                                )}
                                            >
                                                Posição {idx + 1}
                                            </button>
                                        ))}
                                    </div>
                                    <button
                                        onClick={() => setSubMoveOpen(false)}
                                        className="mt-2 text-xs text-slate-500 hover:text-slate-300 w-full text-left"
                                    >
                                        ← Voltar
                                    </button>
                                </div>
                            ) : null}
                        </div>
                    )}
                </div>
            </div>

            {/* Cards */}
            <div className="flex-1 flex flex-col gap-2 px-2 overflow-y-auto pb-1 min-h-[40px] cursor-default custom-scrollbar">
                {list.cards.map((card) => (
                    <TrelloCard key={card.id} card={card} onClick={() => onCardClick(card, list.name)} />
                ))}
            </div>

            {/* Footer: Add card input */}
            <div className="px-2 pb-2 pt-1 cursor-default">
                {addingCard ? (
                    <div className="space-y-2">
                        <textarea
                            ref={cardInputRef}
                            value={newCardTitle}
                            onChange={(e) => setNewCardTitle(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    handleAddCardSubmit();
                                }
                                if (e.key === "Escape") setAddingCard(false);
                            }}
                            placeholder="Insira um título para este cartão..."
                            className="w-full bg-slate-700/90 border border-slate-600/50 rounded-lg px-3 py-2.5 text-[13px] text-slate-200 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400 resize-none min-h-[60px]"
                            rows={2}
                        />
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleAddCardSubmit}
                                className="px-3 py-1.5 rounded-lg bg-brand-500 text-white text-sm font-semibold hover:bg-brand-600 transition-colors"
                            >
                                Adicionar
                            </button>
                            <button
                                onClick={() => { setAddingCard(false); setNewCardTitle(""); }}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                ) : (
                    <button
                        onClick={() => setAddingCard(true)}
                        className="flex items-center gap-1.5 w-full px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-700/60 transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Adicionar um cartão
                    </button>
                )}
            </div>
        </div>
    );
}

// =============================================
// Page
// =============================================
export default function TarefasPage() {
    const [lists, setLists] = useState<TaskList[]>([]);
    const [users, setUsers] = useState<{ id: string; name: string; avatarUrl: string | null }[]>([]);

    const [addingList, setAddingList] = useState(false);
    const [newListTitle, setNewListTitle] = useState("");

    // Modal state
    const [modalCard, setModalCard] = useState<{ card: TaskCard, listName: string } | null>(null);

    // Initial load
    useEffect(() => {
        async function load() {
            const data = await getTaskBoard();
            setLists(data);
            const team = await getUsers();
            setUsers(team);
        }
        load();
    }, []);

    const [isPending, startTransition] = useTransition();

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8, // Require 8px movement before dragging starts
            },
        })
    );

    // Dnd State
    const [activeList, setActiveList] = useState<TaskList | null>(null);

    function handleDragStart(event: DragStartEvent) {
        const id = event.active.id as string;
        if (id.startsWith("list-")) {
            const listId = id.replace("list-", "");
            setActiveList(lists.find((l) => l.id === listId) || null);
        }
    }

    function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event;
        setActiveList(null);

        if (!over) return;

        const activeId = (active.id as string).replace("list-", "");
        const overId = (over.id as string).replace("list-", "");

        if (activeId !== overId) {
            setLists((prev) => {
                const oldIndex = prev.findIndex((l) => l.id === activeId);
                const newIndex = prev.findIndex((l) => l.id === overId);
                const reordered = arrayMove(prev, oldIndex, newIndex);

                // Re-assign positions
                const updatedList = reordered.map((l, i) => ({ ...l, position: i }));

                // Persist logic (fire and forget)
                startTransition(async () => {
                    await reorderTaskLists(updatedList.map(l => l.id));
                });

                return updatedList;
            });
        }
    }

    function handleAddList() {
        if (!newListTitle.trim()) return;
        startTransition(async () => {
            const created = await createTaskList(newListTitle.trim());
            setLists(prev => [...prev, created]);
            setAddingList(false);
            setNewListTitle("");
        });
    }

    function handleRenameList(listId: string, name: string) {
        setLists(prev => prev.map(l => l.id === listId ? { ...l, name } : l));
        startTransition(async () => {
            await renameTaskList(listId, name);
        });
    }

    function handleDeleteList(listId: string) {
        setLists(prev => prev.filter(l => l.id !== listId));
        startTransition(async () => {
            await deleteTaskList(listId);
        });
    }

    function handleReorderListRequest(listId: string, newIndex: number) {
        setLists(prev => {
            const oldIndex = prev.findIndex(l => l.id === listId);
            if (oldIndex === -1 || oldIndex === newIndex) return prev;
            const reordered = arrayMove(prev, oldIndex, newIndex);

            // Re-assign positions
            const updatedList = reordered.map((l, i) => ({ ...l, position: i }));
            startTransition(async () => {
                await reorderTaskLists(updatedList.map(l => l.id));
            });
            return updatedList;
        });
    }

    function handleAddCard(listId: string, title: string) {
        // Optimistic
        const tempId = `temp-${Date.now()}`;
        setLists(prev => prev.map(l => {
            if (l.id !== listId) return l;
            return {
                ...l,
                cards: [...l.cards, { id: tempId, listId, title, description: null, position: l.cards.length, assignedUserId: null, createdAt: new Date() }]
            }
        }));

        startTransition(async () => {
            const newCard = await createTaskCard(listId, title);
            setLists(prev => prev.map(l => {
                if (l.id !== listId) return l;
                return {
                    ...l,
                    cards: l.cards.map(c => c.id === tempId ? newCard : c)
                }
            }));
        });
    }

    function handleUpdateCard(cardId: string, data: { title?: string, description?: string }) {
        setLists(prev => prev.map(l => ({
            ...l,
            cards: l.cards.map(c => c.id === cardId ? { ...c, ...data } : c)
        })));
    }

    function handleDeleteCard(cardId: string) {
        setLists(prev => prev.map(l => ({
            ...l,
            cards: l.cards.filter(c => c.id !== cardId)
        })));
    }

    function handleAssignCard(cardId: string, userId: string | null) {
        const user = users.find(u => u.id === userId) || null;
        setLists(prev => prev.map(l => ({
            ...l,
            cards: l.cards.map(c => c.id === cardId ? { ...c, assignedUserId: userId, assignedUser: user } : c)
        })));
        if (modalCard && modalCard.card.id === cardId) {
            setModalCard({ ...modalCard, card: { ...modalCard.card, assignedUserId: userId, assignedUser: user } });
        }
    }

    return (
        <div className="h-[calc(100vh-80px)] flex flex-col pt-2">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 shrink-0 bento-enter">
                <div>
                    <h1 className="font-display text-3xl font-bold text-white tracking-tight">
                        Tarefas
                    </h1>
                    <p className="text-slate-400 mt-0.5 text-sm">
                        Quadro de tarefas da equipe — crie listas e cartões livremente
                    </p>
                </div>
            </div>

            {/* Board — horizontal scroll */}
            <div className="flex-1 flex gap-4 overflow-x-auto overflow-y-hidden pb-4 items-start custom-scrollbar">
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCorners}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext
                        items={lists.map(l => `list-${l.id}`)}
                        strategy={horizontalListSortingStrategy}
                    >
                        {lists.map((list) => (
                            <TrelloList
                                key={list.id}
                                list={list}
                                allListsCount={lists.length}
                                onAddCard={handleAddCard}
                                onRenameList={handleRenameList}
                                onDeleteList={handleDeleteList}
                                onReorderListRequest={handleReorderListRequest}
                                onCardClick={(card, listName) => setModalCard({ card, listName })}
                            />
                        ))}
                    </SortableContext>

                    <DragOverlay dropAnimation={null}>
                        {activeList ? (
                            <div className="flex flex-col w-[280px] min-w-[280px] max-h-full rounded-xl bg-slate-800 shrink-0 opacity-80 shadow-2xl border-2 border-brand-500 overflow-hidden">
                                <div className="px-4 py-3 bg-slate-700/50">
                                    <h3 className="font-bold text-slate-200">{activeList.name}</h3>
                                </div>
                            </div>
                        ) : null}
                    </DragOverlay>
                </DndContext>

                {/* Add list form */}
                {addingList ? (
                    <div className="w-[280px] min-w-[280px] rounded-xl bg-slate-800 p-3 shrink-0 space-y-2">
                        <input
                            autoFocus
                            value={newListTitle}
                            onChange={(e) => setNewListTitle(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") handleAddList();
                                if (e.key === "Escape") setAddingList(false);
                            }}
                            placeholder="Insira o título da lista..."
                            className="w-full bg-slate-900 border-2 border-brand-400 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 outline-none"
                        />
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleAddList}
                                className="px-3 py-1.5 rounded-lg bg-brand-500 text-white text-sm font-semibold hover:bg-brand-600 transition-colors"
                            >
                                Adicionar
                            </button>
                            <button
                                onClick={() => setAddingList(false)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                ) : (
                    <button
                        onClick={() => setAddingList(true)}
                        className="flex items-center gap-2 w-[280px] min-w-[280px] px-4 py-3 rounded-xl bg-slate-800/60 hover:bg-slate-800 border-2 border-dashed border-slate-700 hover:border-brand-500/50 text-sm font-medium text-slate-400 hover:text-brand-400 transition-all shrink-0"
                    >
                        <Plus className="w-4 h-4" />
                        Adicionar outra lista
                    </button>
                )}
            </div>

            {/* Modal de Cartão */}
            {modalCard && (
                <CardModal
                    card={modalCard.card}
                    listName={modalCard.listName}
                    users={users}
                    onClose={() => setModalCard(null)}
                    onUpdate={handleUpdateCard}
                    onDelete={handleDeleteCard}
                    onAssign={handleAssignCard}
                />
            )}
        </div>
    );
}
