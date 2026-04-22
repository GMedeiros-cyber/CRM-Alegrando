"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { Plus, X, MoreHorizontal, User as UserIcon, Trash2, SquarePen } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    DndContext,
    DragOverlay,
    PointerSensor,
    useSensor,
    useSensors,
    closestCorners,
    useDroppable,
    type DragStartEvent,
    type DragOverEvent,
    type DragEndEvent,
} from "@dnd-kit/core";
import {
    SortableContext,
    useSortable,
    verticalListSortingStrategy,
    arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
    assignMultipleTaskCard,
    moveTaskCard,
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
    assignedUsers?: {
        id: string;
        name: string;
        avatarUrl: string | null;
    }[];
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
    isOverlay,
}: {
    card: TaskCard;
    users: UserDTO[];
    onAssignUser: (cardId: string, userId: string, action: "add" | "remove") => void;
    onUpdateTitle: (cardId: string, title: string) => void;
    onDeleteCard: (cardId: string) => void;
    isOverlay?: boolean;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: card.id,
        data: { type: "card", listId: card.listId },
        disabled: isOverlay,
    });

    const dndStyle = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    const [editing, setEditing] = useState(false);
    const [title, setTitle] = useState(card.title);

    // popover for options
    const [menuOpen, setMenuOpen] = useState(false);
    // sub-popover for users
    const [showUsers, setShowUsers] = useState(false);
    // inline delete confirmation
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    const menuRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
    const assignedUsers = card.assignedUsers || (card.assignedUser ? [card.assignedUser] : []);
    const assignedUserIds = assignedUsers.map((user) => user.id);

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

    // close menu when clicking outside or pressing escape
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setMenuOpen(false);
                setShowUsers(false);
                setShowDeleteConfirm(false);
            }
        }
        function handleEscape(e: KeyboardEvent) {
            if (e.key === "Escape") {
                setMenuOpen(false);
                setShowUsers(false);
                setShowDeleteConfirm(false);
                if (editing) {
                    setTitle(card.title);
                    setEditing(false);
                }
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleEscape);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleEscape);
        };
    }, [menuOpen, showUsers, showDeleteConfirm, editing, card.title]);

    return (
        <>
            <div
                ref={isOverlay ? undefined : setNodeRef}
                style={isOverlay ? undefined : dndStyle}
                {...(isOverlay ? {} : attributes)}
                {...(isOverlay || editing ? {} : listeners)}
                className={cn(
                    "group relative bg-[#EEF2FF] dark:bg-[#1e2536] hover:bg-[#E0E7FF] dark:hover:bg-[#2d3347] rounded-lg border border-[#818CF8] dark:border-[#4a5568] hover:border-[#6366F1] p-3 shadow-sm hover:shadow-md transition-all duration-150",
                    !editing && !isOverlay && "cursor-grab active:cursor-grabbing",
                    isDragging && "opacity-40",
                    isOverlay && "shadow-2xl rotate-2"
                )}
            >
                {editing ? (
                    <div>
                        <textarea
                            autoFocus
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
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
                            className="w-full bg-[#EEF2FF] dark:bg-[#1e2536] rounded px-2 py-1 text-[13px] text-[#191918] dark:text-white outline-none focus:ring-2 focus:ring-brand-400 resize-none"
                            rows={3}
                        />
                        <div className="flex justify-start mt-2">
                            <button
                                onClick={handleSaveTitle}
                                className="px-3 py-1.5 rounded-lg bg-brand-500 text-[#191918] dark:text-white text-xs font-semibold hover:bg-brand-600 transition-colors"
                            >
                                Salvar
                            </button>
                        </div>
                    </div>
                ) : (
                    <div
                        onClick={() => setEditing(true)}
                        className="cursor-pointer"
                    >
                        <p className="text-[13px] text-[#191918] dark:text-white leading-snug pr-6 break-words">
                            {card.title}
                        </p>
                        {assignedUsers.length > 0 && (
                            <div className="flex justify-end mt-2">
                                <div className="flex items-center">
                                    {assignedUsers.map((assignedUser, idx) => (
                                        <div
                                            key={assignedUser.id}
                                            title={assignedUser.name}
                                            className={cn(
                                                "w-5 h-5 rounded-full overflow-hidden border border-[#A5B4FC] dark:border-[#4a5568]",
                                                idx > 0 && "-ml-1"
                                            )}
                                        >
                                            {assignedUser.avatarUrl ? (
                                                <Image src={assignedUser.avatarUrl} alt={assignedUser.name} width={24} height={24} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full bg-brand-500 flex items-center justify-center text-[9px] text-[#191918] dark:text-white font-bold">
                                                    {assignedUser.name.charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Hover Edit Icon */}
                {!editing && (
                    <button
                        ref={buttonRef}
                        onClick={(e) => {
                            e.stopPropagation();
                            if (!menuOpen && buttonRef.current) {
                                const rect = buttonRef.current.getBoundingClientRect();
                                setMenuPos({
                                    top: rect.bottom + window.scrollY + 4,
                                    left: rect.right + window.scrollX - 224,
                                });
                            }
                            setMenuOpen(!menuOpen);
                            setShowUsers(false);
                            setShowDeleteConfirm(false);
                        }}
                        className="absolute top-2 right-2 p-1.5 text-[#6366F1] dark:text-[#94a3b8] hover:text-[#191918] dark:hover:text-white opacity-0 group-hover:opacity-100 transition-opacity bg-[#C7D2FE] hover:bg-[#A5B4FC] rounded"
                    >
                        <SquarePen className="w-3.5 h-3.5 text-[#37352F] dark:text-[#cbd5e1]" />
                    </button>
                )}
            </div>

            {menuOpen && typeof window !== "undefined" && createPortal(
                <>
                    {/* Backdrop - fecha ao clicar fora */}
                    <div
                        className="fixed inset-0 z-[99]"
                        onClick={() => {
                            setMenuOpen(false);
                            setShowUsers(false);
                            setShowDeleteConfirm(false);
                        }}
                    />
                    {/* Menu */}
                    <div
                        ref={menuRef}
                        onClick={(e) => e.stopPropagation()}
                        style={{ top: menuPos.top, left: menuPos.left }}
                        className="fixed w-56 bg-[#EEF2FF] dark:bg-[#1e2536] rounded-lg shadow-xl border border-[#C7D2FE] dark:border-[#3d4a60] z-[100] overflow-hidden text-sm animate-in fade-in zoom-in-95 duration-100"
                    >
                        {showDeleteConfirm ? (
                            <div className="p-3">
                                <p className="text-[#191918] dark:text-white font-medium mb-3 text-xs">Excluir este cartão?</p>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => {
                                            onDeleteCard(card.id);
                                            setMenuOpen(false);
                                        }}
                                        className="flex-1 px-2 py-1.5 bg-red-500 hover:bg-red-600 text-[#191918] dark:text-white rounded text-xs font-semibold transition-colors"
                                    >
                                        Confirmar
                                    </button>
                                    <button
                                        onClick={() => setShowDeleteConfirm(false)}
                                        className="flex-1 px-2 py-1.5 bg-[#C7D2FE] hover:bg-[#A5B4FC] text-[#191918] dark:text-white rounded text-xs font-semibold transition-colors"
                                    >
                                        Cancelar
                                    </button>
                                </div>
                            </div>
                        ) : showUsers ? (
                            <div className="p-2 space-y-2">
                                <div className="flex items-center gap-2 px-2">
                                    <button
                                        onClick={() => setShowUsers(false)}
                                        className="text-[#6366F1] dark:text-[#94a3b8] hover:text-[#191918] dark:hover:text-white p-1 rounded hover:bg-[#E0E7FF] dark:hover:bg-[#2d3347]"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                    <p className="text-[#191918] dark:text-white font-semibold text-xs border-b border-[#C7D2FE] dark:border-[#3d4a60] flex-1 pb-1">Membros</p>
                                </div>
                                <div className="max-h-48 overflow-y-auto space-y-1">
                                    {users.map((user) => {
                                        const isAssigned = assignedUserIds.includes(user.id);

                                        return (
                                            <button
                                                key={user.id}
                                                onClick={() => onAssignUser(card.id, user.id, isAssigned ? "remove" : "add")}
                                                className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-[#E0E7FF] dark:hover:bg-[#2d3347] text-[#191918] dark:text-white rounded text-xs transition-colors"
                                            >
                                                <div className="w-5 h-5 rounded-full overflow-hidden shrink-0 border border-[#A5B4FC] dark:border-[#4a5568]">
                                                    {user.avatarUrl ? (
                                                        <Image src={user.avatarUrl} alt={user.name} width={24} height={24} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full bg-brand-500 flex items-center justify-center text-[9px] text-[#191918] dark:text-white font-bold">
                                                            {user.name.charAt(0).toUpperCase()}
                                                        </div>
                                                    )}
                                                </div>
                                                <span className="truncate">{user.name}</span>
                                                {isAssigned && (
                                                    <span className="ml-auto text-[10px] text-brand-400 font-bold">✓</span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                                <div className="border-t border-[#C7D2FE] dark:border-[#3d4a60] pt-2 px-2">
                                    <button
                                        onClick={() => {
                                            setShowUsers(false);
                                            setMenuOpen(false);
                                        }}
                                        className="w-full px-2 py-1.5 rounded bg-[#E0E7FF] dark:bg-[#2d3347] hover:bg-[#C7D2FE] dark:hover:bg-[#3d4a60] text-[#191918] dark:text-white text-xs font-semibold transition-colors"
                                    >
                                        Confirmar
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="p-1.5 space-y-0.5">
                                <button
                                    onClick={() => setShowUsers(true)}
                                    className="w-full text-left px-2 py-1.5 hover:bg-[#E0E7FF] dark:hover:bg-[#2d3347] text-[#191918] dark:text-white rounded transition-colors text-xs font-medium flex items-center gap-2"
                                >
                                    <UserIcon className="w-3.5 h-3.5 text-[#6366F1] dark:text-[#94a3b8]" />
                                    Alterar Membros
                                </button>
                                <div className="h-px bg-[#E0E7FF] dark:bg-[#2d3347] my-1 mx-2" />
                                <button
                                    onClick={() => setShowDeleteConfirm(true)}
                                    className="w-full text-left px-2 py-1.5 hover:bg-red-500/10 text-red-400 rounded transition-colors text-xs font-medium flex items-center gap-2"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Excluir
                                </button>
                            </div>
                        )}
                    </div>
                </>,
                document.body
            )}
        </>
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
                className="w-full bg-[#E0E7FF] dark:bg-[#2d3347]/90 border border-[#A5B4FC] dark:border-[#4a5568]/50 rounded-lg px-3 py-2.5 text-[13px] text-[#191918] dark:text-white placeholder:text-[#6366F1] dark:text-[#94a3b8] outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400 resize-none min-h-[60px]"
                rows={2}
            />
            <div className="flex items-center gap-2">
                <button
                    onClick={handleSubmit}
                    className="px-3 py-1.5 rounded-lg bg-brand-500 text-[#191918] dark:text-white text-sm font-semibold hover:bg-brand-600 transition-colors"
                >
                    Adicionar cartão
                </button>
                <button
                    onClick={onCancel}
                    className="p-1.5 rounded-lg text-[#6366F1] dark:text-[#94a3b8] hover:text-[#191918] dark:hover:text-white hover:bg-[#E0E7FF] dark:hover:bg-[#2d3347] transition-colors"
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
    onAssignUser: (cardId: string, userId: string, action: "add" | "remove") => void;
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

    const { setNodeRef: setDroppableRef, isOver } = useDroppable({
        id: `list-${list.id}`,
        data: { type: "list", listId: list.id },
    });

    const cardIds = list.cards.map((c) => c.id);

    return (
        <div className={cn(
            "flex flex-col w-[280px] min-w-[280px] max-h-full rounded-xl bg-[#EEF2FF] dark:bg-[#1e2536] shrink-0 transition-colors",
            isOver && "ring-2 ring-brand-400"
        )}>
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
                        className="flex-1 bg-[#F7F7F5] dark:bg-[#0f1829] border-2 border-brand-400 rounded-lg px-2 py-1 text-sm font-bold text-[#191918] dark:text-white outline-none"
                    />
                ) : (
                    <h3
                        onClick={() => setEditingName(true)}
                        className="flex-1 text-sm font-bold text-[#191918] dark:text-white cursor-pointer px-1 py-0.5 rounded hover:bg-[#E0E7FF] dark:hover:bg-[#2d3347] transition-colors truncate"
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
                        className="p-1 rounded-lg text-[#6366F1] dark:text-[#94a3b8] hover:text-[#37352F] dark:hover:text-[#cbd5e1] hover:bg-[#E0E7FF] dark:hover:bg-[#2d3347] transition-colors"
                    >
                        <MoreHorizontal className="w-4 h-4" />
                    </button>
                    
                    {/* Popover Menu */}
                    {showMenu && (
                        <div className="absolute top-10 right-2 w-64 bg-[#E0E7FF] dark:bg-[#2d3347] rounded-lg shadow-xl border border-[#A5B4FC] dark:border-[#4a5568] z-50 overflow-hidden text-sm animate-in fade-in zoom-in-95 duration-100">
                            {showDeleteConfirm ? (
                                <div className="p-3">
                                    <p className="text-[#191918] dark:text-white font-medium mb-3">Excluir lista e todos os cartões?</p>
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => {
                                                onDeleteList(list.id);
                                                resetMenu();
                                            }}
                                            className="flex-1 px-2 py-1.5 bg-red-500 hover:bg-red-600 text-[#191918] dark:text-white rounded text-xs font-semibold"
                                        >
                                            Confirmar
                                        </button>
                                        <button 
                                            onClick={() => setShowDeleteConfirm(false)}
                                            className="flex-1 px-2 py-1.5 bg-[#C7D2FE] hover:bg-[#A5B4FC] text-[#191918] dark:text-white rounded text-xs font-semibold"
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
                                            className="text-[#6366F1] dark:text-[#94a3b8] hover:text-[#191918] dark:hover:text-white"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                        <p className="text-[#191918] dark:text-white font-semibold text-xs border-b border-[#A5B4FC] dark:border-[#4a5568] flex-1 pb-1">Mover Lista</p>
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
                                                        : "text-[#37352F] dark:text-[#cbd5e1] hover:bg-[#C7D2FE] dark:hover:bg-[#3d4a60]"
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
                                        className="w-full text-left px-2 py-1.5 hover:bg-[#C7D2FE] dark:hover:bg-[#3d4a60] text-[#191918] dark:text-white rounded"
                                    >
                                        Adicionar cartão
                                    </button>
                                    <button 
                                        onClick={() => setShowMoveSubmenu(true)}
                                        className="w-full text-left px-2 py-1.5 hover:bg-[#C7D2FE] dark:hover:bg-[#3d4a60] text-[#191918] dark:text-white rounded flex items-center justify-between"
                                    >
                                        <span>Mover lista</span>
                                    </button>
                                    <div className="h-px bg-[#C7D2FE] dark:bg-[#3d4a60] my-1 mx-2" />
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
            <div
                ref={setDroppableRef}
                className="flex-1 flex flex-col gap-2 px-2 overflow-y-auto pb-1 min-h-[60px]"
            >
                <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
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
                </SortableContext>
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
                        className="flex items-center gap-1.5 w-full px-3 py-2 rounded-lg text-sm text-[#6366F1] dark:text-[#94a3b8] hover:text-[#191918] dark:hover:text-white hover:bg-[#E0E7FF] dark:hover:bg-[#2d3347]/60 transition-colors"
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
            onCancel(); // Fecha apÃ³s adiÃ§Ã£o
        }
    }

    return (
        <div className="w-[280px] min-w-[280px] rounded-xl bg-[#EEF2FF] dark:bg-[#1e2536] p-3 shrink-0 space-y-2">
            <input
                ref={ref}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter") handleSubmit();
                    if (e.key === "Escape") onCancel();
                }}
                placeholder="Insira o título da lista..."
                className="w-full bg-[#F7F7F5] dark:bg-[#0f1829] border-2 border-brand-400 rounded-lg px-3 py-2 text-sm text-[#191918] dark:text-white placeholder:text-[#6366F1] dark:text-[#94a3b8] outline-none"
            />
            <div className="flex items-center gap-2">
                <button
                    onClick={handleSubmit}
                    className="px-3 py-1.5 rounded-lg bg-brand-500 text-[#191918] dark:text-white text-sm font-semibold hover:bg-brand-600 transition-colors"
                >
                    Adicionar lista
                </button>
                <button
                    onClick={onCancel}
                    className="p-1.5 rounded-lg text-[#6366F1] dark:text-[#94a3b8] hover:text-[#191918] dark:hover:text-white hover:bg-[#E0E7FF] dark:hover:bg-[#2d3347] transition-colors"
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

    // DnD: activeCard para o DragOverlay, snapshot pra rollback em caso de erro.
    const [activeCard, setActiveCard] = useState<TaskCard | null>(null);
    const dragSnapshotRef = useRef<TaskList[] | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
    );

    const findListIdOfCard = useCallback((cardId: string, source: TaskList[]): string | null => {
        for (const list of source) {
            if (list.cards.some((c) => c.id === cardId)) return list.id;
        }
        return null;
    }, []);

    const handleDragStart = useCallback((event: DragStartEvent) => {
        const id = event.active.id as string;
        const list = lists.find((l) => l.cards.some((c) => c.id === id));
        const card = list?.cards.find((c) => c.id === id) || null;
        setActiveCard(card);
        dragSnapshotRef.current = lists;
    }, [lists]);

    const handleDragOver = useCallback((event: DragOverEvent) => {
        const { active, over } = event;
        if (!over) return;
        const activeId = active.id as string;
        const overId = over.id as string;

        setLists((prev) => {
            const sourceListId = findListIdOfCard(activeId, prev);
            if (!sourceListId) return prev;

            let destListId: string | null = null;
            if (overId.startsWith("list-")) {
                destListId = overId.replace("list-", "");
            } else {
                destListId = findListIdOfCard(overId, prev);
            }
            if (!destListId) return prev;
            if (sourceListId === destListId) return prev;

            const sourceList = prev.find((l) => l.id === sourceListId);
            const destList = prev.find((l) => l.id === destListId);
            if (!sourceList || !destList) return prev;

            const activeIdx = sourceList.cards.findIndex((c) => c.id === activeId);
            if (activeIdx === -1) return prev;

            const [moved] = sourceList.cards.slice(activeIdx, activeIdx + 1);
            const newSourceCards = sourceList.cards.filter((c) => c.id !== activeId);

            let overIdx = destList.cards.findIndex((c) => c.id === overId);
            if (overIdx === -1) overIdx = destList.cards.length;

            const newDestCards = [...destList.cards];
            newDestCards.splice(overIdx, 0, { ...moved, listId: destListId });

            return prev.map((l) => {
                if (l.id === sourceListId) return { ...l, cards: newSourceCards };
                if (l.id === destListId) return { ...l, cards: newDestCards };
                return l;
            });
        });
    }, [findListIdOfCard]);

    const handleDragEnd = useCallback(async (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveCard(null);
        if (!over) {
            dragSnapshotRef.current = null;
            return;
        }

        const activeId = active.id as string;
        const overId = over.id as string;

        // Estado atual já reflete a movimentação entre listas (handleDragOver).
        // Aqui só precisamos resolver reordenação dentro da lista de destino.
        setLists((prev) => {
            const destListId = findListIdOfCard(activeId, prev);
            if (!destListId) return prev;
            const destList = prev.find((l) => l.id === destListId);
            if (!destList) return prev;

            const oldIdx = destList.cards.findIndex((c) => c.id === activeId);
            let newIdx = oldIdx;
            if (!overId.startsWith("list-")) {
                const overIdx = destList.cards.findIndex((c) => c.id === overId);
                if (overIdx !== -1) newIdx = overIdx;
            }
            if (oldIdx === newIdx) return prev;

            return prev.map((l) => {
                if (l.id !== destListId) return l;
                return { ...l, cards: arrayMove(l.cards, oldIdx, newIdx) };
            });
        });

        // Persistir: pega o estado depois do setState sync com setTimeout 0.
        // Cobre tanto cross-list (handleDragOver) quanto same-list (acima).
        setTimeout(async () => {
            const snapshot = dragSnapshotRef.current;
            dragSnapshotRef.current = null;
            try {
                // Identifica listas afetadas comparando snapshot vs atual via closure.
                // Como setLists é async, leio lists via callback novamente.
                setLists((current) => {
                    const affected = new Map<string, TaskList>();
                    for (const list of current) {
                        const snapList = snapshot?.find((l) => l.id === list.id);
                        if (!snapList) continue;
                        const changed =
                            list.cards.length !== snapList.cards.length ||
                            list.cards.some((c, i) => snapList.cards[i]?.id !== c.id);
                        if (changed) affected.set(list.id, list);
                    }

                    // Fire and forget: update each affected card's position + list_id.
                    const updates: Promise<unknown>[] = [];
                    for (const list of affected.values()) {
                        list.cards.forEach((card, idx) => {
                            updates.push(moveTaskCard(card.id, list.id, idx));
                        });
                    }
                    Promise.all(updates).catch((err) => {
                        console.error("[tarefas] Erro ao persistir DnD, revertendo:", err);
                        if (snapshot) setLists(snapshot);
                    });

                    return current;
                });
            } catch (err) {
                console.error("[tarefas] Erro inesperado no dragEnd:", err);
                if (snapshot) setLists(snapshot);
            }
        }, 0);
    }, [findListIdOfCard]);

    useEffect(() => {
        Promise.all([getTaskBoard(), getUsers()])
            .then(([boardData, userData]) => {
                setLists(boardData);
                setUsers(userData);
            })
            .catch(() => {})
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
                    assignedUsers: [],
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
            console.error("[tarefas] Erro ao criar card:", err);
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
            console.error("[tarefas] Erro ao criar lista:", err);
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
        } catch (err) {
            console.error("[tarefas] Erro ao renomear lista:", err);
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
            console.error("[tarefas] Erro ao atualizar card:", err);
        }
    }

    async function handleAssignUser(cardId: string, userId: string, action: "add" | "remove") {
        const currentCard = lists.flatMap((list) => list.cards).find((card) => card.id === cardId);
        if (!currentCard) return;

        const currentAssignedUsers = currentCard.assignedUsers || (currentCard.assignedUser ? [currentCard.assignedUser] : []);
        const selectedUser = users.find((user) => user.id === userId);

        let nextAssignedUsers = currentAssignedUsers;
        if (action === "add" && selectedUser) {
            const alreadyAssigned = currentAssignedUsers.some((user) => user.id === userId);
            nextAssignedUsers = alreadyAssigned ? currentAssignedUsers : [...currentAssignedUsers, selectedUser];
        }

        if (action === "remove") {
            nextAssignedUsers = currentAssignedUsers.filter((user) => user.id !== userId);
        }

        const nextAssignedUserIds = nextAssignedUsers.map((user) => user.id);

        setLists((prev) =>
            prev.map((list) => ({
                ...list,
                cards: list.cards.map((card) =>
                    card.id === cardId
                        ? {
                            ...card,
                            assignedUsers: nextAssignedUsers,
                            assignedUser: nextAssignedUsers[0] || null,
                            assignedUserId: nextAssignedUserIds[0] || null,
                        }
                        : card
                ),
            }))
        );

        try {
            await assignMultipleTaskCard(cardId, nextAssignedUserIds);
        } catch (err) {
            console.error("[tarefas] Erro ao atribuir usuario:", err);
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
            console.error("[tarefas] Erro ao deletar card:", err);
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
        } catch (err) {
            console.error("[tarefas] Erro ao deletar lista:", err);
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
        } catch (err) {
            console.error("[tarefas] Erro ao reordenar listas:", err);
        }
    }

    return (
        <div className="h-[calc(100vh-80px)] flex flex-col relative w-full overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 shrink-0 bento-enter pl-4 pr-4 lg:pl-0 lg:pr-8">
                <div className="px-6 py-4 rounded-xl bg-[#EEF2FF] dark:bg-[#1e2536] border-2 border-[#818CF8] dark:border-[#4a5568] shadow-sm flex flex-col gap-1 w-fit min-w-[320px]">
                    <h1 className="text-2xl font-bold text-[#191918] dark:text-white tracking-tight">
                        Tarefas
                    </h1>
                    <p className="text-sm font-medium text-[#6366F1] dark:text-[#94a3b8]">
                        Quadro de tarefas da equipe — crie listas e cartões livremente
                    </p>
                </div>
            </div>

            {loading ? (
                <div className="flex-1 flex justify-center mt-20">
                    <div className="w-8 h-8 rounded-full border-4 border-[#C7D2FE] dark:border-[#3d4a60] border-t-brand-500 animate-spin" />
                </div>
            ) : (
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCorners}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDragEnd={handleDragEnd}
                >
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
                                className="flex items-center gap-2 w-[280px] min-w-[280px] px-4 py-3 rounded-xl bg-[#EEF2FF] dark:bg-[#1e2536]/60 hover:bg-[#EEF2FF] dark:hover:bg-[#1e2536] border-2 border-dashed border-[#C7D2FE] dark:border-[#3d4a60] hover:border-brand-500/50 text-sm font-medium text-[#6366F1] dark:text-[#94a3b8] hover:text-brand-400 transition-all shrink-0"
                            >
                                <Plus className="w-4 h-4" />
                                Adicionar outra lista
                            </button>
                        )}
                    </div>

                    <DragOverlay dropAnimation={null}>
                        {activeCard ? (
                            <TrelloCard
                                card={activeCard}
                                users={users}
                                onAssignUser={handleAssignUser}
                                onUpdateTitle={handleUpdateCard}
                                onDeleteCard={handleDeleteCard}
                                isOverlay
                            />
                        ) : null}
                    </DragOverlay>
                </DndContext>
            )}
        </div>
    );
}

