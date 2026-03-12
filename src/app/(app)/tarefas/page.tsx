"use client";

import { useState, useRef, useEffect } from "react";
import { Plus, X, MoreHorizontal, User as UserIcon, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { 
    getUsers, 
    getTaskBoard,
    createTaskList,
    renameTaskList,
    deleteTaskList,
    reorderTaskLists,
    createTaskCard,
    updateTaskCard,
    deleteTaskCard,
    assignTaskCard
} from "@/lib/actions/tasks";

// =============================================
// Types
// =============================================

export interface TaskCard {
    id: string;
    title: string;
    description?: string | null;
    position: number;
    listId?: string | null;
    assignedUserId?: string | null;
    createdAt?: Date | null;
    updatedAt?: Date | null;
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
    createdAt?: Date | null;
    updatedAt?: Date | null;
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

function TrelloCard({ 
    card,
    users,
    onAssignUser,
    onUpdateTitle,
    onDeleteCard,
}: { 
    card: TaskCard;
    users: UserDTO[];
    onAssignUser: (cardId: string, userId: string | null) => void;
    onUpdateTitle: (cardId: string, title: string) => void;
    onDeleteCard: (cardId: string) => void;
}) {
    const [editing, setEditing] = useState(false);
    const [title, setTitle] = useState(card.title);
    
    // popover for users
    const [showUsers, setShowUsers] = useState(false);
    const usersMenuRef = useRef<HTMLDivElement>(null);

    // save title
    function handleSaveTitle() {
        const trimmed = title.trim();
        if (trimmed && trimmed !== card.title) {
            onUpdateTitle(card.id, trimmed);
        } else {
            setTitle(card.title);
        }
        setEditing(false);
    }

    // close users popover when clicking outside or pressing escape
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (usersMenuRef.current && !usersMenuRef.current.contains(e.target as Node)) {
                setShowUsers(false);
            }
        }
        function handleEscape(e: KeyboardEvent) {
            if (e.key === "Escape") {
                setShowUsers(false);
            }
        }
        if (showUsers) {
            document.addEventListener("mousedown", handleClickOutside);
            document.addEventListener("keydown", handleEscape);
        }
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleEscape);
        };
    }, [showUsers]);

    return (
        <div 
            onDoubleClick={() => {
                if (!showUsers) {
                    setEditing(true);
                }
            }}
            onClick={() => {
                if (!editing) {
                    setShowUsers(!showUsers);
                }
            }}
            className="group relative bg-slate-700/90 hover:bg-slate-600/90 rounded-lg border border-slate-600/50 hover:border-slate-500/60 px-3 py-2.5 cursor-pointer transition-all duration-150 shadow-sm hover:shadow-md"
        >
            {editing ? (
                <textarea
                    autoFocus
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={handleSaveTitle}
                    onClick={(e) => e.stopPropagation()} // prevent triggering showUsers
                    onDoubleClick={(e) => e.stopPropagation()} // prevent triggering itself
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSaveTitle();
                        }
                        if (e.key === "Escape") {
                            setTitle(card.title);
                            setEditing(false);
                        }
                    }}
                    className="w-full bg-slate-800 rounded px-2 py-1 text-[13px] text-slate-200 outline-none focus:ring-2 focus:ring-brand-400 resize-none"
                    rows={3}
                />
            ) : (
                <p className="text-[13px] text-slate-200 leading-snug pr-6">
                    {card.title}
                </p>
            )}

            {/* Hover Delete Button */}
            {!editing && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        if(confirm("Tem certeza que deseja excluir este cartão de forma permanente?")) {
                            onDeleteCard(card.id);
                        }
                    }}
                    className="absolute top-2 right-2 p-1 text-slate-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-700/90 rounded"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            )}

            {/* Assignment Avatar */}
            {!editing && card.assignedUser && (
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

            {/* Popover User Assignment (Single Click) */}
            {showUsers && !editing && (
                <div 
                    ref={usersMenuRef} 
                    onClick={(e) => e.stopPropagation()}
                    className="absolute top-10 left-0 mt-1 w-56 bg-slate-800 rounded-lg shadow-xl border border-slate-700 z-50 overflow-hidden text-sm animate-in fade-in zoom-in-95 duration-100"
                >
                    <div className="p-2 space-y-1 max-h-48 overflow-y-auto">
                        <button
                            onClick={() => {
                                onAssignUser(card.id, null);
                                setShowUsers(false);
                            }}
                            className="w-full text-left px-2 py-1.5 hover:bg-slate-700 text-slate-300 rounded text-xs"
                        >
                            Sem atribuição
                        </button>
                        <div className="h-px bg-slate-700 my-1 mx-1" />
                        {users.map(user => (
                            <button
                                key={user.id}
                                onClick={() => {
                                    onAssignUser(card.id, user.id);
                                    setShowUsers(false);
                                }}
                                className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-slate-700 text-slate-200 rounded text-xs"
                            >
                                <div className="w-5 h-5 rounded-full overflow-hidden shrink-0">
                                    {user.avatarUrl ? (
                                        <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full bg-brand-500 flex items-center justify-center text-[9px] text-white font-bold">
                                            {user.name.charAt(0).toUpperCase()}
                                        </div>
                                    )}
                                </div>
                                <span className="truncate">{user.name}</span>
                            </button>
                        ))}
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
            onCancel(); // Fecha depois de adicionar
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
    users,
    onAddCard,
    onRenameList,
    onDeleteList,
    onMoveList,
    onAssignUser,
    onUpdateCard,
    onDeleteCard
}: {
    list: TaskList;
    totalLists: number;
    users: UserDTO[];
    onAddCard: (listId: string, title: string) => void;
    onRenameList: (listId: string, name: string) => void;
    onDeleteList: (listId: string) => void;
    onMoveList: (listId: string, newIndex: number) => void;
    onAssignUser: (cardId: string, userId: string | null) => void;
    onUpdateCard: (cardId: string, title: string) => void;
    onDeleteCard: (cardId: string) => void;
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
                    <TrelloCard 
                        key={card.id} 
                        card={card} 
                        users={users}
                        onAssignUser={onAssignUser}
                        onUpdateTitle={onUpdateCard}
                        onDeleteCard={onDeleteCard}
                    />
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
            onCancel(); // Fecha após adição
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
// Page
// =============================================

export default function TarefasPage() {
    const [lists, setLists] = useState<TaskList[]>([]);
    const [loading, setLoading] = useState(true);
    const [addingList, setAddingList] = useState(false);
    
    const [users, setUsers] = useState<UserDTO[]>([]);

    useEffect(() => {
        Promise.all([getTaskBoard(), getUsers()])
            .then(([boardData, userData]) => {
                setLists(boardData);
                setUsers(userData);
            })
            .catch(err => console.error("Failed to load data:", err))
            .finally(() => setLoading(false));
    }, []);

    async function handleAddCard(listId: string, title: string) {
        const tempId = `temp-${Date.now()}`;
        const targetList = lists.find(l => l.id === listId);
        if (!targetList) return;
        const newPos = targetList.cards.length;

        setLists((prev) =>
            prev.map((list) => {
                if (list.id !== listId) return list;
                const newCard: TaskCard = {
                    id: tempId,
                    title,
                    position: newPos,
                };
                return { ...list, cards: [...list.cards, newCard] };
            })
        );
        
        try {
            const newCard = await createTaskCard(listId, title, newPos);
            setLists((prev) =>
                prev.map((list) => {
                    if (list.id !== listId) return list;
                    return { ...list, cards: list.cards.map(c => c.id === tempId ? newCard : c) };
                })
            );
        } catch (err) {
            console.error("Failed to persist card adding:", err);
        }
    }

    async function handleAddList(name: string) {
        const newPos = lists.length;
        const tempId = `temp-list-${Date.now()}`;
        const newList: TaskList = {
            id: tempId,
            name,
            position: newPos,
            cards: [],
        };
        setLists((prev) => [...prev, newList]);
        setAddingList(false);
        
        try {
            const created = await createTaskList(name, newPos);
            setLists((prev) => prev.map(l => l.id === tempId ? created : l));
        } catch (err) {
            console.error("Failed to persist list adding:", err);
        }
    }

    async function handleRenameList(listId: string, newName: string) {
        setLists((prev) =>
            prev.map((list) =>
                list.id === listId ? { ...list, name: newName } : list
            )
        );
        try {
            await renameTaskList(listId, newName);
        } catch(err) {
            console.error("Failed to persistence list renaming:", err);
        }
    }

    async function handleUpdateCard(cardId: string, title: string) {
        setLists((prev) => prev.map(list => ({
            ...list,
            cards: list.cards.map(c => c.id === cardId ? { ...c, title } : c)
        })));
        
        try {
            await updateTaskCard(cardId, { title });
        } catch (err) {
            console.error("Failed to update card title:", err);
        }
    }

    async function handleAssignUser(cardId: string, userId: string | null) {
        const user = users.find(u => u.id === userId) || null;
        
        // Optimistic
        setLists((prev) => prev.map(list => ({
            ...list,
            cards: list.cards.map(c => c.id === cardId ? { ...c, assignedUser: user } : c)
        })));
        
        try {
            await assignTaskCard(cardId, userId);
        } catch (err) {
            console.error("Failed to assign user:", err);
        }
    }

    async function handleDeleteCard(cardId: string) {
        setLists((prev) => prev.map(list => ({
            ...list,
            cards: list.cards.filter(c => c.id !== cardId)
        })));
        
        try {
            await deleteTaskCard(cardId);
        } catch (err) {
            console.error("Failed to delete card:", err);
        }
    }
    
    async function handleDeleteList(listId: string) {
        setLists(prev => {
            const newLists = prev.filter(l => l.id !== listId);
            return newLists.map((l, idx) => ({ ...l, position: idx }));
        });
        
        try {
            await deleteTaskList(listId);
            // Reordenar no banco as que ficaram
            await reorderTaskLists(lists.filter(l => l.id !== listId).map(l => l.id));
        } catch (error) {
            console.error("Failed to delete list:", error);
        }
    }
    
    async function handleMoveList(listId: string, newIndex: number) {
        const oldIndex = lists.findIndex(l => l.id === listId);
        if (oldIndex === -1 || oldIndex === newIndex) return;
        
        const newLists = [...lists];
        const [movedList] = newLists.splice(oldIndex, 1);
        newLists.splice(newIndex, 0, movedList);
        
        const normalized = newLists.map((l, idx) => ({ ...l, position: idx }));
        setLists(normalized);
        
        try {
            const orderedIds = normalized.map(l => l.id);
            await reorderTaskLists(orderedIds);
        } catch (error) {
            console.error("Failed to move list:", error);
        }
    }

    return (
        <div className="h-[calc(100vh-80px)] flex flex-col relative w-full overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 shrink-0 bento-enter pl-4 pr-4 lg:pl-0 lg:pr-8">
                <div>
                    <h1 className="font-display text-3xl font-bold text-white tracking-tight">
                        Tarefas
                    </h1>
                    <p className="text-slate-400 mt-0.5 text-sm">
                        Quadro de tarefas da equipe — crie listas e cartões livremente
                    </p>
                </div>
            </div>

            {loading ? (
                <div className="flex-1 flex justify-center mt-20">
                    <div className="w-8 h-8 rounded-full border-4 border-slate-700 border-t-brand-500 animate-spin" />
                </div>
            ) : (
                <div className="flex-1 flex gap-4 overflow-x-auto overflow-y-hidden pb-4 items-start relative px-4 lg:px-0">
                    {lists
                        .sort((a, b) => a.position - b.position)
                        .map((list) => (
                            <TrelloList
                                key={list.id}
                                list={list}
                                totalLists={lists.length}
                                users={users}
                                onAddCard={handleAddCard}
                                onRenameList={handleRenameList}
                                onAssignUser={handleAssignUser}
                                onUpdateCard={handleUpdateCard}
                                onDeleteCard={handleDeleteCard}
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
            )}
        </div>
    );
}
