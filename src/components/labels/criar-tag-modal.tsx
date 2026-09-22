"use client";

import { useEffect, useState } from "react";
import { Loader2, Pencil, Tag, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { createLabel, updateLabel } from "@/lib/actions/labels";
import { COR_TAG_PADRAO, type Label } from "@/lib/types/labels";
import { ColorPicker } from "./color-picker";
import { LabelBadge } from "./label-badge";

/**
 * "Criar tag" do cabeçalho de Conversas: cria E edita (nome e cor) as tags
 * existentes, com o mesmo `ColorPicker` do picker do lead — um caminho só para
 * cor. Apagar fica FORA de propósito: tag apagada some dos leads que a usam,
 * e isso é decisão de outra rodada.
 */
export function CriarTagModal({ availableLabels, onClose, onCreated, onUpdated, onToast }: {
    availableLabels: Label[];
    onClose: () => void;
    onCreated: (label: Label) => void;
    onUpdated: (labelId: string, updates: Partial<Label>) => void;
    onToast: (t: { type: "success" | "error"; text: string }) => void;
}) {
    // `null` = criando; id = editando aquela tag.
    const [editandoId, setEditandoId] = useState<string | null>(null);
    const [name, setName] = useState("");
    const [color, setColor] = useState(COR_TAG_PADRAO);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        function onEsc(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
        document.addEventListener("keydown", onEsc);
        return () => document.removeEventListener("keydown", onEsc);
    }, [onClose]);

    function abrirEdicao(l: Label) {
        setEditandoId(l.id);
        setName(l.name);
        setColor(l.color);
    }
    function voltarParaCriar() {
        setEditandoId(null);
        setName("");
        setColor(COR_TAG_PADRAO);
    }

    async function salvar() {
        const nome = name.trim();
        if (!nome || busy) return;
        setBusy(true);
        if (editandoId) {
            const anterior = availableLabels.find((l) => l.id === editandoId);
            onUpdated(editandoId, { name: nome, color });
            const res = await updateLabel({ id: editandoId, name: nome, color });
            setBusy(false);
            if (!res.ok) {
                if (anterior) onUpdated(editandoId, { name: anterior.name, color: anterior.color });
                onToast({ type: "error", text: res.error });
                return;
            }
            onToast({ type: "success", text: "Tag atualizada!" });
            voltarParaCriar();
            return;
        }
        const res = await createLabel({ name: nome, color });
        setBusy(false);
        if (!res.ok) { onToast({ type: "error", text: res.error }); return; }
        onCreated(res.label);
        onToast({ type: "success", text: "Tag criada!" });
        voltarParaCriar();
    }

    const editando = editandoId ? availableLabels.find((l) => l.id === editandoId) : null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#191918]/30 dark:bg-black/60 backdrop-blur-sm animate-in fade-in p-4">
            <div role="dialog" aria-label="Tags" className="bg-[#F7F7F5] dark:bg-[#0f1829] border-2 border-[#C7D2FE] dark:border-[#3d4a60] rounded-2xl shadow-2xl w-[420px] max-w-full max-h-[85vh] flex flex-col animate-in zoom-in-95">
                <div className="flex items-center justify-between px-6 pt-6 pb-4">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-brand-500/20 flex items-center justify-center">
                            <Tag className="w-4 h-4 text-brand-400" />
                        </div>
                        <h3 className="font-display text-base font-bold text-[#191918] dark:text-white">
                            {editando ? `Editar tag` : "Criar tag"}
                        </h3>
                    </div>
                    <button onClick={onClose} aria-label="Fechar" className="p-1.5 rounded-lg hover:bg-[#EEF2FF] dark:hover:bg-[#1e2536] text-[#6366F1] dark:text-[#94a3b8] hover:text-[#191918] dark:hover:text-white transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="px-6 overflow-y-auto">
                    <input
                        autoFocus
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") void salvar(); }}
                        placeholder="Nome da tag"
                        maxLength={40}
                        aria-label="Nome da tag"
                        className="w-full mb-3 px-3 py-2 rounded-lg text-sm bg-[#EEF2FF] dark:bg-[#1e2536] border border-[#A5B4FC] dark:border-[#4a5568] text-[#191918] dark:text-white placeholder:text-[#6366F1] dark:placeholder:text-[#94a3b8] focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/20 outline-none"
                    />
                    <ColorPicker value={color} onChange={setColor} nomePrevia={name} />
                    <div className="flex gap-2 mt-4">
                        {editando ? (
                            <button type="button" onClick={voltarParaCriar} className="flex-1 px-3 py-2 rounded-xl text-sm border border-[#A5B4FC] dark:border-[#4a5568] text-[#37352F] dark:text-[#cbd5e1] hover:bg-[#EEF2FF] dark:hover:bg-[#1e2536]">Cancelar edição</button>
                        ) : (
                            <button type="button" onClick={onClose} className="flex-1 px-3 py-2 rounded-xl text-sm border border-[#A5B4FC] dark:border-[#4a5568] text-[#37352F] dark:text-[#cbd5e1] hover:bg-[#EEF2FF] dark:hover:bg-[#1e2536]">Fechar</button>
                        )}
                        <button type="button" onClick={salvar} disabled={busy || !name.trim()} className="flex-1 px-3 py-2 rounded-xl text-sm font-semibold bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-40">
                            {busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : editando ? "Salvar" : "Criar"}
                        </button>
                    </div>

                    {/* Existentes: clicar abre para edição. Sem apagar aqui (ver cabeçalho). */}
                    <div className="mt-5 mb-6">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#6366F1] dark:text-[#94a3b8] mb-2">
                            Tags existentes · {availableLabels.length}
                        </p>
                        {availableLabels.length === 0 && (
                            <p className="text-xs italic text-[#6366F1] dark:text-[#94a3b8]">Nenhuma tag criada ainda.</p>
                        )}
                        <div className="flex flex-wrap gap-1.5">
                            {availableLabels.map((l) => (
                                <button
                                    key={l.id}
                                    type="button"
                                    onClick={() => abrirEdicao(l)}
                                    title={`Editar ${l.name}`}
                                    aria-label={`Editar tag ${l.name}`}
                                    aria-pressed={l.id === editandoId}
                                    className={cn(
                                        "group/tag inline-flex items-center gap-1 rounded-full p-0.5 pr-1.5 border-2 transition-colors",
                                        l.id === editandoId ? "border-brand-500" : "border-transparent hover:border-[#C7D2FE] dark:hover:border-[#3d4a60]",
                                    )}
                                >
                                    <LabelBadge name={l.name} color={l.color} />
                                    <Pencil className="w-3 h-3 text-[#6366F1] dark:text-[#94a3b8] opacity-60 group-hover/tag:opacity-100" />
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
