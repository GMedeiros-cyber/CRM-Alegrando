"use client";

import { useState, useRef, useEffect } from "react";
import { Plus, X, MoreHorizontal, User as UserIcon, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { 
    getUsers, 
    assignTaskCard, 
    deleteTaskList, 
    reorderTaskLists,
    getTaskBoard,
    createTaskList,
    createTaskCard,
    updateTaskList,
    deleteTaskCard
} from "@/lib/actions/tasks";

// =============================================
// Types
// =============================================

export interface TaskCard {
    id: string;
    title: string;
    description?: string;
    position: number;
    assignedUser?: {
        id: string;
        name: string;
        avatarUrl: string | null;
    } | null;
}

export interface TaskList {
    id: string;
    name: string;
    position: number;
    cards: TaskCard[];
}

export interface UserDTO {
    id: string;
    name: string;
    avatarUrl: string | null;
}

// =============================================
// Card Component
// =============================================

function TrelloCard({ card, onClick }: { card: TaskCard; onClick: () => void }) {
    return (
        <div 
            onClick={onClick}
            className="bg-slate-700/90 hover:bg-slate-600/90 rounded-lg border border-slate-600/50 hover:border-slate-500/60 px-3 py-2.5 cursor-pointer transition-all duration-150 group shadow-sm hover:shadow-md"
        >
            <p className="text-[13px] text-slate-200 leading-snug">
                {card.title}
            </p>
            {card.assignedUser && (
                <div className="flex justify-end mt-2">
                    <div
                        title={card.assignedUser.name}
                        className="w-5 h-5 rounded-full overflow-hidden border border-slate-500"
                    >
                    {card.assignedUser.avatarUrl ? (
                        <img src={card.assignedUser.avatarUrl} alt={card.assignedUser.name} className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full bg-brand-500 flex items-center justify-center text-[9px] text-white font-bold">
                            {card.assignedUser.name.charAt(0).toUpperCase()}
                        </div>
                    )}
                    </div>
                </div>
            )}
        </div>
    );
}

// =============================================
// Add Card Input
// =============================================

function AddCardForm({
    onAdd,
    onCancel,
}: {
    onAdd: (title: string) => void;
    onCancel: () => void;
}) {
    const [text, setText] = useState("");
    const ref = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        ref.current?.focus();
    }, []);

    function handleSubmit() {
        const trimmed = text.trim();
        if (trimmed) {
            onAdd(trimmed);
            setText("");
        }
    }

    return (
        <div className="space-y-2">
            <textarea
                ref={ref}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmit();
                    }
                    if (e.key === "Escape") onCancel();
                }}
                placeholder="Insira um título para este cartão..."
                className="w-full bg-slate-700/90 border border-slate-600/50 rounded-lg px-3 py-2.5 text-[13px] text-slate-200 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400 resize-none min-h-[60px]"
                rows={2}
            />
            <div className="flex items-center gap-2">
                <button
                    onClick={handleSubmit}
                    className="px-3 py-1.5 rounded-lg bg-brand-500 text-white text-sm font-semibold hover:bg-brand-600 transition-colors"
                >
                    Adicionar cartão
                </button>
                <button
                    onClick={onCancel}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}

// =============================================
// List Component
// =============================================

function TrelloList({
    list,
    totalLists,
    onAddCard,
    onRenameList,
    onCardClick,
    onDeleteList,
    onMoveList
}: {
    list: TaskList;
    totalLists: number;
    onAddCard: (listId: string, title: string) => void;
    onRenameList: (listId: string, name: string) => void;
    onCardClick: (card: TaskCard, listId: string, listName: string) => void;
    onDeleteList: (listId: string) => void;
    onMoveList: (listId: string, newIndex: number) => void;
}) {
    const [addingCard, setAddingCard] = useState(false);
    const [editingName, setEditingName] = useState(false);
    const [name, setName] = useState(list.name);
    const nameRef = useRef<HTMLInputElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const [showMenu, setShowMenu] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showMoveSubmenu, setShowMoveSubmenu] = useState(false);

    useEffect(() => {
        if (editingName && nameRef.current) {
            nameRef.current.focus();
            nameRef.current.select();
        }
    }, [editingName]);

    // Close menu when clicking outside
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setShowMenu(false);
                setShowDeleteConfirm(false);
                setShowMoveSubmenu(false);
            }
        }
        function handleEscape(e: KeyboardEvent) {
            if (e.key === "Escape") {
                setShowMenu(false);
                setShowDeleteConfirm(false);
                setShowMoveSubmenu(false);
            }
        }
        
        if (showMenu) {
            document.addEventListener("mousedown", handleClickOutside);
            document.addEventListener("keydown", handleEscape);
        }
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleEscape);
        };
    }, [showMenu]);

    function handleSaveName() {
        const trimmed = name.trim();
        if (trimmed && trimmed !== list.name) {
            onRenameList(list.id, trimmed);
        } else {
            setName(list.name);
        }
        setEditingName(false);
    }
    
    function resetMenu() {
        setShowMenu(false);
        setShowDeleteConfirm(false);
        setShowMoveSubmenu(false);
    }

    return (
        <div className="flex flex-col w-[280px] min-w-[280px] max-h-full rounded-xl bg-slate-800 shrink-0">
            {/* Header */}
            <div className="flex items-center gap-2 px-3 pt-3 pb-2 relative">
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
                        className="flex-1 bg-slate-900 border-2 border-brand-400 rounded-lg px-2 py-1 text-sm font-bold text-white outline-none"
                    />
                ) : (
                    <h3
                        onClick={() => setEditingName(true)}
                        className="flex-1 text-sm font-bold text-slate-200 cursor-pointer px-1 py-0.5 rounded hover:bg-slate-700 transition-colors truncate"
                    >
                        {name}
                    </h3>
                )}
                
                <div ref={menuRef}>
                    <button 
                        onClick={() => {
                            if (showMenu) {
                                resetMenu();
                            } else {
                                setShowMenu(true);
                            }
                        }}
                        className="p-1 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-700 transition-colors"
                    >
                        <MoreHorizontal className="w-4 h-4" />
                    </button>
                    
                    {/* Popover Menu */}
                    {showMenu && (
                        <div className="absolute top-10 right-2 w-64 bg-slate-700 rounded-lg shadow-xl border border-slate-600 z-50 overflow-hidden text-sm animate-in fade-in zoom-in-95 duration-100">
                            {showDeleteConfirm ? (
                                <div className="p-3">
                                    <p className="text-slate-200 font-medium mb-3">Excluir lista e todos os cartões?</p>
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => {
                                                onDeleteList(list.id);
                                                resetMenu();
                                            }}
                                            className="flex-1 px-2 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded text-xs font-semibold"
                                        >
                                            Confirmar
                                        </button>
                                        <button 
                                            onClick={() => setShowDeleteConfirm(false)}
                                            className="flex-1 px-2 py-1.5 bg-slate-600 hover:bg-slate-500 text-slate-200 rounded text-xs font-semibold"
                                        >
                                            Cancelar
                                        </button>
                                    </div>
                                </div>
                            ) : showMoveSubmenu ? (
                                <div className="p-2">
                                    <div className="flex items-center gap-2 mb-2 px-2">
                                        <button 
                                            onClick={() => setShowMoveSubmenu(false)}
                                            className="text-slate-400 hover:text-white"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                        <p className="text-slate-200 font-semibold text-xs border-b border-slate-600 flex-1 pb-1">Mover Lista</p>
                                    </div>
                                    <div className="max-h-48 overflow-y-auto">
                                        {Array.from({ length: totalLists }).map((_, i) => (
                                            <button
                                                key={i}
                                                disabled={i === list.position}
                                                onClick={() => {
                                                    onMoveList(list.id, i);
                                                    resetMenu();
                                                }}
                                                className={cn(
                                                    "w-full text-left px-3 py-1.5 rounded block",
                                                    i === list.position 
                                                        ? "text-brand-400 bg-brand-500/10 font-bold" 
                                                        : "text-slate-300 hover:bg-slate-600"
                                                )}
                                            >
                                                Posição {i + 1} {i === list.position && "(Atual)"}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="p-1.5 space-y-0.5">
                                    <button 
                                        onClick={() => {
                                            resetMenu();
                                            setAddingCard(true);
                                        }}
                                        className="w-full text-left px-2 py-1.5 hover:bg-slate-600 text-slate-200 rounded"
                                    >
                                        Adicionar cartão
                                    </button>
                                    <button 
                                        onClick={() => setShowMoveSubmenu(true)}
                                        className="w-full text-left px-2 py-1.5 hover:bg-slate-600 text-slate-200 rounded flex items-center justify-between"
                                    >
                                        <span>Mover lista</span>
                                    </button>
                                    <div className="h-px bg-slate-600 my-1 mx-2" />
                                    <button 
                                        onClick={() => setShowDeleteConfirm(true)}
                                        className="w-full text-left px-2 py-1.5 hover:bg-red-500/20 text-red-400 rounded"
                                    >
                                        Excluir lista
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Cards */}
            <div className="flex-1 flex flex-col gap-2 px-2 overflow-y-auto pb-1 min-h-0">
                {list.cards.map((card) => (
                    <TrelloCard key={card.id} card={card} onClick={() => onCardClick(card, list.id, list.name)} />
                ))}
            </div>

            {/* Footer: Add card */}
            <div className="px-2 pb-2 pt-1">
                {addingCard ? (
                    <AddCardForm
                        onAdd={(title) => {
                            onAddCard(list.id, title);
                        }}
                        onCancel={() => setAddingCard(false)}
                    />
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
// Add List Form
// =============================================

function AddListForm({
    onAdd,
    onCancel,
}: {
    onAdd: (name: string) => void;
    onCancel: () => void;
}) {
    const [name, setName] = useState("");
    const ref = useRef<HTMLInputElement>(null);

    useEffect(() => {
        ref.current?.focus();
    }, []);

    function handleSubmit() {
        const trimmed = name.trim();
        if (trimmed) {
            onAdd(trimmed);
            setName("");
        }
    }

    return (
        <div className="w-[280px] min-w-[280px] rounded-xl bg-slate-800 p-3 shrink-0 space-y-2">
            <input
                ref={ref}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter") handleSubmit();
                    if (e.key === "Escape") onCancel();
                }}
                placeholder="Insira o título da lista..."
                className="w-full bg-slate-900 border-2 border-brand-400 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 outline-none"
            />
            <div className="flex items-center gap-2">
                <button
                    onClick={handleSubmit}
                    className="px-3 py-1.5 rounded-lg bg-brand-500 text-white text-sm font-semibold hover:bg-brand-600 transition-colors"
                >
                    Adicionar lista
                </button>
                <button
                    onClick={onCancel}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}

// =============================================
// Card Modal Component (Simplified)
// =============================================

function CardModal({
    card,
    users,
    onClose,
    onAssignUser,
    onDeleteCard,
}: {
    card: TaskCard;
    users: UserDTO[];
    onClose: () => void;
    onAssignUser: (cardId: string, userId: string | null) => void;
    onDeleteCard: (cardId: string) => void;
}) {
    const [isSaving, setIsSaving] = useState(false);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm bento-enter">
            <div className="bg-slate-800 rounded-xl w-full max-w-[320px] shadow-2xl flex flex-col overflow-hidden relative">
                {/* Close Button top-right absolute */}
                <button
                    onClick={onClose}
                    className="absolute top-3 right-3 p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors z-10"
                >
                    <X className="w-4 h-4" />
                </button>

                {/* Body */}
                <div className="px-5 py-6 space-y-6 pt-10">
                    <div>
                        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Atribuído a</h3>
                        <select
                            value={card.assignedUser?.id || ""}
                            onChange={async (e) => {
                                const value = e.target.value;
                                const userId = value || null;
                                setIsSaving(true);
                                await onAssignUser(card.id, userId);
                                setIsSaving(false);
                            }}
                            disabled={isSaving}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-brand-400 appearance-none cursor-pointer disabled:opacity-50"
                        >
                            <option value="">Sem atribuição</option>
                            {users.map(user => (
                                <option key={user.id} value={user.id}>
                                    {user.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Ações</h3>
                        <button
                            onClick={() => {
                                if(confirm("Tem certeza que deseja excluir este cartão de forma permanente?")) {
                                    onDeleteCard(card.id);
                                }
                            }}
                            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:text-red-300 bg-red-400/10 hover:bg-red-400/20 rounded-lg transition-colors text-left"
                        >
                            <Trash2 className="w-4 h-4" />
                            Excluir cartão
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// =============================================
// Page
// =============================================

export default function TarefasPage() {
    const [lists, setLists] = useState<TaskList[]>([]); // ✅ Empty initial state (No mock IDs)
    const [addingList, setAddingList] = useState(false);
    
    const [users, setUsers] = useState<UserDTO[]>([]);
    const [selectedCardInfo, setSelectedCardInfo] = useState<{ card: TaskCard; listId: string; listName: string } | null>(null);

    useEffect(() => {
        getUsers()
            .then(data => setUsers(data))
            .catch(err => console.error("Failed to load users:", err));
            
        // ✅ Fetch initial real data
        getTaskBoard()
            .then(data => setLists(data as any))
            .catch(err => console.error("Failed to load task board:", err));
    }, []);

    async function handleAddCard(listId: string, title: string) {
        try {
            const list = lists.find(l => l.id === listId);
            const position = list ? list.cards.length : 0;
            const newCard = await createTaskCard(listId, title, position);
            
            setLists((prev) =>
                prev.map((l) => {
                    if (l.id !== listId) return l;
                    return { ...l, cards: [...l.cards, { ...newCard, assignedUser: null } as any] };
                })
            );
        } catch (error) {
            console.error("Failed to create card", error);
        }
    }

    async function handleAddList(name: string) {
        try {
            const newList = await createTaskList(name, lists.length);
            setLists((prev) => [...prev, { ...newList, cards: [] } as any]);
            setAddingList(false);
        } catch (error) {
            console.error("Failed to create list", error);
        }
    }

    async function handleRenameList(listId: string, newName: string) {
        setLists((prev) =>
            prev.map((list) =>
                list.id === listId ? { ...list, name: newName } : list
            )
        );
        updateTaskList(listId, newName).catch(console.error);
    }

    function handleCardClick(card: TaskCard, listId: string, listName: string) {
        setSelectedCardInfo({ card, listId, listName });
    }

    async function handleAssignUser(cardId: string, userId: string | null) {
        const user = users.find(u => u.id === userId) || null;
        
        // Optimistic UI update
        setLists((prev) => prev.map(list => ({
            ...list,
            cards: list.cards.map(c => c.id === cardId ? { ...c, assignedUser: user } : c)
        })));
        
        if (selectedCardInfo && selectedCardInfo.card.id === cardId) {
            setSelectedCardInfo(prev => prev ? { ...prev, card: { ...prev.card, assignedUser: user } } : null);
        }
        
        try {
            await assignTaskCard(cardId, userId);
        } catch (err) {
            console.error("Failed to assign user:", err);
        }
    }

    function handleDeleteCard(cardId: string) {
        setLists((prev) => prev.map(list => ({
            ...list,
            cards: list.cards.filter(c => c.id !== cardId)
        })));
        setSelectedCardInfo(null);
        
        deleteTaskCard(cardId).catch(console.error);
    }
    
    async function handleDeleteList(listId: string) {
        setLists(prev => {
            const newLists = prev.filter(l => l.id !== listId);
            return newLists.map((l, idx) => ({ ...l, position: idx }));
        });
        
        try {
            await deleteTaskList(listId);
        } catch (error) {
            console.error("Failed to delete list:", error);
        }
    }
    
    // ✅ Bug 1 Fixed: execute async server action OUTSIDE state update callback
    async function handleMoveList(listId: string, newIndex: number) {
        const oldIndex = lists.findIndex(l => l.id === listId);
        if (oldIndex === -1 || oldIndex === newIndex) return;
        
        // Cópia para não mutar estado prev
        const newLists = [...lists];
        const [movedList] = newLists.splice(oldIndex, 1);
        newLists.splice(newIndex, 0, movedList);
        
        const normalized = newLists.map((l, idx) => ({ ...l, position: idx }));
        
        // Atualiza a view
        setLists(normalized);
        
        // Então chama o backend
        try {
            const orderedIds = normalized.map(l => l.id);
            reorderTaskLists(orderedIds).catch(console.error);
        } catch (error) {
            console.error("Failed to move list:", error);
        }
    }

    return (
        <div className="h-[calc(100vh-80px)] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 shrink-0 bento-enter">
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
            <div className="flex-1 flex gap-4 overflow-x-auto overflow-y-hidden pb-4 items-start">
                {lists
                    .sort((a, b) => a.position - b.position)
                    .map((list) => (
                        <TrelloList
                            key={list.id}
                            list={list}
                            totalLists={lists.length}
                            onAddCard={handleAddCard}
                            onRenameList={handleRenameList}
                            onCardClick={handleCardClick}
                            onDeleteList={handleDeleteList}
                            onMoveList={handleMoveList}
                        />
                    ))}

                {/* Add list button / form */}
                {addingList ? (
                    <AddListForm
                        onAdd={handleAddList}
                        onCancel={() => setAddingList(false)}
                    />
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

            {/* Modal */}
            {selectedCardInfo && (
                <CardModal
                    card={selectedCardInfo.card}
                    users={users}
                    onClose={() => setSelectedCardInfo(null)}
                    onAssignUser={handleAssignUser}
                    onDeleteCard={handleDeleteCard}
                />
            )}
        </div>
    );
}


