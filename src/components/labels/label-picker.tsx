"use client";

import { useState, useEffect, useRef } from "react";
import { Plus, Check, Pencil, Trash2, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    LABEL_COLOR_CLASSES,
    LABEL_COLORS,
    type Label,
    type LabelColor,
} from "@/lib/types/labels";
import {
    createLabel,
    updateLabel,
    deleteLabel,
} from "@/lib/actions/labels";

interface LabelPickerProps {
    /** Tags atualmente atribuídas ao lead — controla os checkboxes "ativo". */
    assignedIds: string[];
    /** Tags disponíveis no sistema. */
    availableLabels: Label[];
    /** Chamado quando o usuário (des)atribui uma tag. */
    onToggle: (labelId: string, currentlyAssigned: boolean) => void | Promise<void>;
    /** Fechar o popover. */
    onClose: () => void;
    /** Aplica criação no state externo (optimistic). */
    onLabelCreatedLocal: (label: Label) => void;
    /** Aplica edição no state externo (optimistic). */
    onLabelUpdatedLocal: (labelId: string, updates: Partial<Label>) => void;
    /** Aplica exclusão no state externo (optimistic). */
    onLabelDeletedLocal: (labelId: string) => void;
    /** Toast handler. */
    onToast?: (toast: { type: "success" | "error"; text: string }) => void;
}

export function LabelPicker({
    assignedIds,
    availableLabels,
    onToggle,
    onClose,
    onLabelCreatedLocal,
    onLabelUpdatedLocal,
    onLabelDeletedLocal,
    onToast,
}: LabelPickerProps) {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState("");
    const [newColor, setNewColor] = useState<LabelColor>("blue");
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState("");
    const [editColor, setEditColor] = useState<LabelColor>("blue");
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        function onDoc(e: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                onClose();
            }
        }
        function onEsc(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
        document.addEventListener("mousedown", onDoc);
        document.addEventListener("keydown", onEsc);
        return () => {
            document.removeEventListener("mousedown", onDoc);
            document.removeEventListener("keydown", onEsc);
        };
    }, [onClose]);

    async function handleCreate() {
        const name = newName.trim();
        if (!name) return;
        setBusy(true);
        const res = await createLabel({ name, color: newColor });
        setBusy(false);
        if (res.ok) {
            // Não temos id antes da resposta do servidor; o create só fica
            // optimistic *depois* que o servidor confirma. Mas como o resto da
            // pipeline (cache invalidation, Realtime echo) não dispara reload
            // agressivo, isso já elimina o flicker.
            onLabelCreatedLocal(res.label);
            setNewName("");
            setCreating(false);
            onToast?.({ type: "success", text: "Tag criada!" });
        } else {
            onToast?.({ type: "error", text: res.error });
        }
    }

    function startEdit(l: Label) {
        setEditingId(l.id);
        setEditName(l.name);
        setEditColor(l.color);
    }

    async function handleSaveEdit() {
        if (!editingId) return;
        const name = editName.trim();
        if (!name) return;
        const previous = availableLabels.find((l) => l.id === editingId);
        if (!previous) return;

        // 1. Optimistic: aplica no state local imediatamente
        onLabelUpdatedLocal(editingId, { name, color: editColor });
        setEditingId(null);

        // 2. Persiste
        setBusy(true);
        const res = await updateLabel({ id: editingId, name, color: editColor });
        setBusy(false);

        // 3. Reverte se falhar
        if (!res.ok) {
            onLabelUpdatedLocal(editingId, { name: previous.name, color: previous.color });
            onToast?.({ type: "error", text: res.error });
        } else {
            onToast?.({ type: "success", text: "Tag atualizada!" });
        }
    }

    async function handleConfirmDelete() {
        if (!deletingId) return;
        const previous = availableLabels.find((l) => l.id === deletingId);
        if (!previous) return;

        // 1. Optimistic: tira da lista
        onLabelDeletedLocal(deletingId);
        const deletedId = deletingId;
        setDeletingId(null);

        // 2. Persiste
        setBusy(true);
        const res = await deleteLabel(deletedId);
        setBusy(false);

        // 3. Reverte se falhar — readiciona a label
        if (!res.ok) {
            onLabelCreatedLocal(previous);
            onToast?.({ type: "error", text: res.error });
        } else {
            onToast?.({ type: "success", text: "Tag excluída." });
        }
    }

    const deletingLabel = deletingId
        ? availableLabels.find((l) => l.id === deletingId)
        : null;

    return (
        <div
            ref={wrapperRef}
            className="absolute right-0 z-30 mt-1.5 w-64 rounded-xl border border-[#C7D2FE] dark:border-[#3d4a60] bg-[#EEF2FF] dark:bg-[#1e2536] shadow-xl shadow-black/10 dark:shadow-black/40 overflow-hidden animate-in fade-in-0 zoom-in-95 duration-100 origin-top-right"
        >
            <div className="px-3 pt-2 pb-1 flex items-center justify-between">
                <span className="text-[9px] font-bold uppercase tracking-wider text-[#6366F1] dark:text-[#94a3b8]">
                    Tags
                </span>
                <button
                    type="button"
                    onClick={onClose}
                    className="p-0.5 rounded text-[#6366F1] dark:text-[#94a3b8] hover:text-foreground"
                    aria-label="Fechar"
                >
                    <X className="w-3 h-3" />
                </button>
            </div>

            {/* Lista de tags */}
            <div className="max-h-64 overflow-y-auto">
                {availableLabels.length === 0 && !creating && (
                    <p className="px-3 py-3 text-[11px] italic text-[#6366F1] dark:text-[#94a3b8]">
                        Nenhuma tag criada ainda.
                    </p>
                )}
                {availableLabels.map((l) => {
                    const active = assignedIds.includes(l.id);
                    const c = LABEL_COLOR_CLASSES[l.color];
                    const isEditing = editingId === l.id;

                    if (isEditing) {
                        return (
                            <div key={l.id} className="px-2 py-2 bg-[#C7D2FE]/30 dark:bg-[#3d4a60]/30 space-y-2">
                                <input
                                    autoFocus
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    maxLength={40}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") handleSaveEdit();
                                        if (e.key === "Escape") setEditingId(null);
                                    }}
                                    className="w-full px-2 py-1 rounded-md text-[12px] bg-[#F7F7F5] dark:bg-[#0f1829] border border-[#A5B4FC] dark:border-[#4a5568] text-[#191918] dark:text-white"
                                />
                                <div className="flex flex-wrap gap-1">
                                    {LABEL_COLORS.map((col) => (
                                        <button
                                            key={col}
                                            type="button"
                                            onClick={() => setEditColor(col)}
                                            className={cn(
                                                "w-5 h-5 rounded-full border-2 transition-transform",
                                                LABEL_COLOR_CLASSES[col].dotBg,
                                                editColor === col ? "border-foreground scale-110" : "border-transparent"
                                            )}
                                            aria-label={`Cor ${col}`}
                                        />
                                    ))}
                                </div>
                                <div className="flex gap-1">
                                    <button
                                        type="button"
                                        onClick={handleSaveEdit}
                                        disabled={busy || !editName.trim()}
                                        className="flex-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-40"
                                    >
                                        {busy ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : "Salvar"}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setEditingId(null)}
                                        disabled={busy}
                                        className="px-2 py-1 rounded-md text-[11px] font-semibold border border-[#C7D2FE] dark:border-[#3d4a60] text-[#6366F1] dark:text-[#94a3b8] hover:text-foreground"
                                    >
                                        Cancelar
                                    </button>
                                </div>
                            </div>
                        );
                    }

                    return (
                        <div
                            key={l.id}
                            className={cn(
                                "group/lbl flex items-center gap-2 px-3 py-1.5 text-[12px] transition-colors",
                                active
                                    ? "bg-brand-500/15"
                                    : "hover:bg-[#C7D2FE]/40 dark:hover:bg-[#3d4a60]/50"
                            )}
                        >
                            <button
                                type="button"
                                onClick={() => onToggle(l.id, active)}
                                className="flex items-center gap-2 flex-1 min-w-0 text-left"
                            >
                                <span className={cn("rounded-full w-2.5 h-2.5 shrink-0", c.dotBg)} />
                                <span className={cn(
                                    "flex-1 truncate",
                                    active ? "text-brand-500 dark:text-brand-400 font-semibold" : "text-[#37352F] dark:text-[#cbd5e1]"
                                )}>
                                    {l.name}
                                </span>
                                {active && <Check className="w-3.5 h-3.5 shrink-0 text-brand-500 dark:text-brand-400" />}
                            </button>
                            <div className="flex items-center gap-0.5 opacity-0 group-hover/lbl:opacity-100 transition-opacity">
                                <button
                                    type="button"
                                    onClick={() => startEdit(l)}
                                    className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 text-[#6366F1] dark:text-[#94a3b8]"
                                    aria-label={`Editar tag ${l.name}`}
                                >
                                    <Pencil className="w-3 h-3" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setDeletingId(l.id)}
                                    className="p-1 rounded hover:bg-red-500/20 text-red-500"
                                    aria-label={`Excluir tag ${l.name}`}
                                >
                                    <Trash2 className="w-3 h-3" />
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Footer: criar nova */}
            <div className="border-t border-[#C7D2FE] dark:border-[#3d4a60]">
                {creating ? (
                    <div className="px-2 py-2 space-y-2">
                        <input
                            autoFocus
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="Nome da tag"
                            maxLength={40}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") handleCreate();
                                if (e.key === "Escape") { setCreating(false); setNewName(""); }
                            }}
                            className="w-full px-2 py-1 rounded-md text-[12px] bg-[#F7F7F5] dark:bg-[#0f1829] border border-[#A5B4FC] dark:border-[#4a5568] text-[#191918] dark:text-white placeholder:text-[#6366F1] dark:placeholder:text-[#94a3b8]"
                        />
                        <div className="flex flex-wrap gap-1">
                            {LABEL_COLORS.map((col) => (
                                <button
                                    key={col}
                                    type="button"
                                    onClick={() => setNewColor(col)}
                                    className={cn(
                                        "w-5 h-5 rounded-full border-2 transition-transform",
                                        LABEL_COLOR_CLASSES[col].dotBg,
                                        newColor === col ? "border-foreground scale-110" : "border-transparent"
                                    )}
                                    aria-label={`Cor ${col}`}
                                />
                            ))}
                        </div>
                        <div className="flex gap-1">
                            <button
                                type="button"
                                onClick={handleCreate}
                                disabled={busy || !newName.trim()}
                                className="flex-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-40"
                            >
                                {busy ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : "Criar"}
                            </button>
                            <button
                                type="button"
                                onClick={() => { setCreating(false); setNewName(""); }}
                                disabled={busy}
                                className="px-2 py-1 rounded-md text-[11px] font-semibold border border-[#C7D2FE] dark:border-[#3d4a60] text-[#6366F1] dark:text-[#94a3b8] hover:text-foreground"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => setCreating(true)}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-semibold text-brand-500 dark:text-brand-400 hover:bg-brand-500/10 transition-colors"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        Criar nova tag
                    </button>
                )}
            </div>

            {/* Modal de confirmação de exclusão */}
            {deletingLabel && (
                <div className="absolute inset-0 z-40 bg-[#EEF2FF]/95 dark:bg-[#1e2536]/95 backdrop-blur-sm flex items-center justify-center p-3">
                    <div className="w-full rounded-lg border border-red-500/40 bg-card p-3 space-y-2">
                        <p className="text-[12px] font-semibold text-[#191918] dark:text-white">
                            Excluir tag &quot;{deletingLabel.name}&quot;?
                        </p>
                        <p className="text-[10px] text-[#6366F1] dark:text-[#94a3b8]">
                            Será removida de todos os leads que a possuem.
                        </p>
                        <div className="flex gap-1.5 pt-1">
                            <button
                                type="button"
                                onClick={handleConfirmDelete}
                                disabled={busy}
                                className="flex-1 px-2 py-1.5 rounded-md text-[11px] font-semibold bg-red-500 text-white hover:bg-red-600 disabled:opacity-40"
                            >
                                {busy ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : "Excluir"}
                            </button>
                            <button
                                type="button"
                                onClick={() => setDeletingId(null)}
                                disabled={busy}
                                className="px-3 py-1.5 rounded-md text-[11px] font-semibold border border-[#C7D2FE] dark:border-[#3d4a60] text-[#6366F1] dark:text-[#94a3b8] hover:text-foreground"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
