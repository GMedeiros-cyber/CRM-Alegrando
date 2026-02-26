"use client";

import { useState, useRef, useEffect } from "react";
import { Plus, X, MoreHorizontal, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

// =============================================
// Types
// =============================================

interface TaskCard {
    id: string;
    title: string;
    description?: string;
    position: number;
}

interface TaskList {
    id: string;
    name: string;
    position: number;
    cards: TaskCard[];
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

function TrelloCard({ card }: { card: TaskCard }) {
    return (
        <div className="bg-slate-700/90 hover:bg-slate-600/90 rounded-lg border border-slate-600/50 hover:border-slate-500/60 px-3 py-2.5 cursor-pointer transition-all duration-150 group shadow-sm hover:shadow-md">
            <p className="text-[13px] text-slate-200 leading-snug">
                {card.title}
            </p>
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
}: {
    list: TaskList;
    onAddCard: (listId: string, title: string) => void;
    onRenameList: (listId: string, name: string) => void;
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
                    <TrelloCard key={card.id} card={card} />
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
// Page
// =============================================

export default function TarefasPage() {
    const [lists, setLists] = useState<TaskList[]>(INITIAL_LISTS);
    const [addingList, setAddingList] = useState(false);

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
        </div>
    );
}
