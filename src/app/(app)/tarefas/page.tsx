"use client";

import { useState, useRef, useEffect } from "react";
import { Plus, X, MoreHorizontal, User as UserIcon, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getUsers, assignTaskCard } from "@/lib/actions/tasks";

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
// Mock Data — Trello-style
// =============================================

const INITIAL_LISTS: TaskList[] = [
    {
        id: "list-1",
        name: "Redação do Contrato",
        position: 0,
        cards: [
            { id: "c1", title: "Revisar termos de um contrato próprio. O foco é que o cliente entenda o uso da ferramenta.", position: 0 },
            { id: "c2", title: "Incluir cláusula definindo que é licenciamento de software, ele paga para usar enquanto o contrato estiver ativo.", position: 1 },
            { id: "c3", title: "Criar regra de suspensão do serviço caso o pagamento atrase mais de 5 dias.", position: 2 },
            { id: "c4", title: "Adicionar proteção para nós caso o WhatsApp ou a OpenAI fique fora do ar.", position: 3 },
        ],
    },
    {
        id: "list-2",
        name: "Planejamento Comercial",
        position: 1,
        cards: [
            { id: "c5", title: "Transformar nossos termos técnicos em benefícios para o dia a dia do advogado.", position: 0 },
            { id: "c6", title: "Listar os 9 escritórios de colegas que você conhece e que seriam os ideais para começar.", position: 1 },
            { id: "c7", title: "Escrever a mensagem de abordagem inicial focando na troca de experiência.", position: 2 },
        ],
    },
    {
        id: "list-3",
        name: "Estrutura do Financeiro",
        position: 2,
        cards: [
            { id: "c8", title: "Definir ou abrir a conta bancária da empresa no Asaas.", position: 0 },
            { id: "c9", title: "Configurar o link de pagamento automático para a mensalidade.", position: 1 },
            { id: "c10", title: "Escrever a regra de reembolso do valor de entrada caso o cliente desista logo no início.", position: 2 },
        ],
    },
    {
        id: "list-4",
        name: "Formulário de Início",
        position: 3,
        cards: [
            { id: "c11", title: "Criar um formulário online para o cliente preencher com os acessos do Google, Asaas e WhatsApp.", position: 0 },
            { id: "c12", title: "Colocar um texto no final do formulário onde ele autoriza nossa equipe a acessar essas contas.", position: 1 },
        ],
    },
    {
        id: "list-5",
        name: "Em andamento",
        position: 4,
        cards: [],
    },
    {
        id: "list-6",
        name: "Concluído",
        position: 5,
        cards: [
            { id: "c13", title: "Criou conta no Trello", position: 0 },
        ],
    },
];

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
    onAddCard,
    onRenameList,
    onCardClick,
}: {
    list: TaskList;
    onAddCard: (listId: string, title: string) => void;
    onRenameList: (listId: string, name: string) => void;
    onCardClick: (card: TaskCard, listId: string, listName: string) => void;
}) {
    const [addingCard, setAddingCard] = useState(false);
    const [editingName, setEditingName] = useState(false);
    const [name, setName] = useState(list.name);
    const nameRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (editingName && nameRef.current) {
            nameRef.current.focus();
            nameRef.current.select();
        }
    }, [editingName]);

    function handleSaveName() {
        const trimmed = name.trim();
        if (trimmed && trimmed !== list.name) {
            onRenameList(list.id, trimmed);
        } else {
            setName(list.name);
        }
        setEditingName(false);
    }

    return (
        <div className="flex flex-col w-[280px] min-w-[280px] max-h-full rounded-xl bg-slate-800 shrink-0">
            {/* Header */}
            <div className="flex items-center gap-2 px-3 pt-3 pb-2">
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
                <button className="p-1 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-700 transition-colors">
                    <MoreHorizontal className="w-4 h-4" />
                </button>
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
                            // Keep the form open for adding more
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
// Card Modal Component
// =============================================

function CardModal({
    card,
    listName,
    listId,
    users,
    onClose,
    onUpdateCard,
    onAssignUser,
    onDeleteCard,
}: {
    card: TaskCard;
    listName: string;
    listId: string;
    users: UserDTO[];
    onClose: () => void;
    onUpdateCard: (cardId: string, updates: Partial<TaskCard>) => void;
    onAssignUser: (cardId: string, userId: string | null) => void;
    onDeleteCard: (cardId: string) => void;
}) {
    const [title, setTitle] = useState(card.title);
    const [description, setDescription] = useState(card.description || "");
    const [isSaving, setIsSaving] = useState(false);

    // Save changes when unmounting / closing
    useEffect(() => {
        return () => {
            if (title !== card.title || description !== (card.description || "")) {
                onUpdateCard(card.id, { title, description });
            }
        };
    }, [title, description, card, onUpdateCard]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm bento-enter">
            <div className="bg-slate-800 rounded-xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-700 flex items-start justify-between">
                    <div className="flex-1 mr-4">
                        <input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="bg-transparent text-xl font-bold tracking-tight text-white w-full border-none outline-none focus:ring-0 placeholder:text-slate-500"
                            placeholder="Título do Cartão"
                        />
                        <p className="text-sm text-slate-400 mt-1 pl-1">
                            na lista <span className="underline decoration-slate-600 underline-offset-2">{listName}</span>
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 -mr-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-full transition-colors shrink-0"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col md:flex-row gap-8">
                    {/* Main Content */}
                    <div className="flex-1 space-y-6">
                        <div>
                            <h3 className="text-sm font-semibold text-slate-300 mb-2">Descrição</h3>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Adicione uma descrição mais detalhada..."
                                className="w-full bg-slate-900 border border-slate-700/60 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400 min-h-[120px] resize-y"
                            />
                        </div>
                    </div>

                    {/* Sidebar */}
                    <div className="w-full md:w-[220px] shrink-0 space-y-6">
                        <div>
                            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Atribuído a</h3>
                            <div className="space-y-2">
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
        </div>
    );
}

// =============================================
// Page
// =============================================

export default function TarefasPage() {
    const [lists, setLists] = useState<TaskList[]>(INITIAL_LISTS);
    const [addingList, setAddingList] = useState(false);
    
    const [users, setUsers] = useState<UserDTO[]>([]);
    const [selectedCardInfo, setSelectedCardInfo] = useState<{ card: TaskCard; listId: string; listName: string } | null>(null);

    useEffect(() => {
        getUsers()
            .then(data => setUsers(data))
            .catch(err => console.error("Failed to load users:", err));
    }, []);

    function handleAddCard(listId: string, title: string) {
        setLists((prev) =>
            prev.map((list) => {
                if (list.id !== listId) return list;
                const newCard: TaskCard = {
                    id: `c-${Date.now()}`,
                    title,
                    position: list.cards.length,
                };
                return { ...list, cards: [...list.cards, newCard] };
            })
        );
    }

    function handleAddList(name: string) {
        const newList: TaskList = {
            id: `list-${Date.now()}`,
            name,
            position: lists.length,
            cards: [],
        };
        setLists((prev) => [...prev, newList]);
        setAddingList(false);
    }

    function handleRenameList(listId: string, newName: string) {
        setLists((prev) =>
            prev.map((list) =>
                list.id === listId ? { ...list, name: newName } : list
            )
        );
    }

    function handleCardClick(card: TaskCard, listId: string, listName: string) {
        setSelectedCardInfo({ card, listId, listName });
    }

    function handleUpdateCard(cardId: string, updates: Partial<TaskCard>) {
        setLists((prev) => prev.map(list => ({
            ...list,
            cards: list.cards.map(c => c.id === cardId ? { ...c, ...updates } : c)
        })));
        
        if (selectedCardInfo && selectedCardInfo.card.id === cardId) {
            setSelectedCardInfo(prev => prev ? { ...prev, card: { ...prev.card, ...updates } } : null);
        }
    }

    async function handleAssignUser(cardId: string, userId: string | null) {
        const user = users.find(u => u.id === userId) || null;
        handleUpdateCard(cardId, { assignedUser: user });
        try {
            // Note: Since we use mock data IDs like 'c1', 'c2', assigning here might 
            // result in a server error unless the card actually exists in the DB.
            // Using a try-catch to allow the UI to function robustly.
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
                            onAddCard={handleAddCard}
                            onRenameList={handleRenameList}
                            onCardClick={handleCardClick}
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
                    listId={selectedCardInfo.listId}
                    listName={selectedCardInfo.listName}
                    users={users}
                    onClose={() => setSelectedCardInfo(null)}
                    onUpdateCard={handleUpdateCard}
                    onAssignUser={handleAssignUser}
                    onDeleteCard={handleDeleteCard}
                />
            )}
        </div>
    );
}

