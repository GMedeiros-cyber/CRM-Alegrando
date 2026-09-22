"use client";

import { useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Trash2, X, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    createRespostaRapida,
    deleteRespostaRapida,
    listRespostasRapidas,
    updateRespostaRapida,
} from "@/lib/actions/respostas-rapidas";
import type { RespostaRapida } from "@/lib/respostas-rapidas";

type Form = { atalho: string; titulo: string; conteudo: string; ativo: boolean };
const FORM_VAZIO: Form = { atalho: "/", titulo: "", conteudo: "", ativo: true };

/**
 * Gestão das respostas rápidas. Um modal, dois caminhos até ele (botão do
 * cabeçalho e "Gerenciar respostas" no menu da "/"). Lista + formulário
 * inline: com 10–15 itens não precisa de mais.
 */
export function RespostasRapidasModal({ onClose, onChanged, onToast }: {
    onClose: () => void;
    /** Chamado após qualquer escrita — o menu da "/" recarrega a lista. */
    onChanged: () => void;
    onToast: (t: { type: "success" | "error"; text: string }) => void;
}) {
    const [itens, setItens] = useState<RespostaRapida[] | null>(null);
    const [editando, setEditando] = useState<string | "nova" | null>(null);
    const [form, setForm] = useState<Form>(FORM_VAZIO);
    const [busy, setBusy] = useState(false);
    const [apagando, setApagando] = useState<RespostaRapida | null>(null);

    useEffect(() => {
        let vivo = true;
        listRespostasRapidas(true).then(r => { if (vivo) setItens(r); });
        return () => { vivo = false; };
    }, []);

    useEffect(() => {
        function onEsc(e: KeyboardEvent) {
            if (e.key !== "Escape") return;
            if (apagando) setApagando(null);
            else if (editando) setEditando(null);
            else onClose();
        }
        document.addEventListener("keydown", onEsc);
        return () => document.removeEventListener("keydown", onEsc);
    }, [apagando, editando, onClose]);

    function abrirNova() { setForm(FORM_VAZIO); setEditando("nova"); }
    function abrirEdicao(r: RespostaRapida) {
        setForm({ atalho: r.atalho, titulo: r.titulo, conteudo: r.conteudo, ativo: r.ativo });
        setEditando(r.id);
    }

    async function salvar() {
        if (!editando) return;
        setBusy(true);
        const res = editando === "nova"
            ? await createRespostaRapida(form)
            : await updateRespostaRapida({ id: editando, ...form });
        setBusy(false);
        if (!res.ok) { onToast({ type: "error", text: res.error }); return; }
        setItens(prev => {
            const lista = prev ?? [];
            const existe = lista.some(i => i.id === res.resposta.id);
            const nova = existe ? lista.map(i => (i.id === res.resposta.id ? res.resposta : i)) : [...lista, res.resposta];
            return nova.sort((a, b) => a.ordem - b.ordem || a.titulo.localeCompare(b.titulo, "pt-BR"));
        });
        setEditando(null);
        onChanged();
        onToast({ type: "success", text: editando === "nova" ? "Resposta criada." : "Resposta atualizada." });
    }

    async function confirmarApagar() {
        if (!apagando) return;
        setBusy(true);
        const res = await deleteRespostaRapida(apagando.id);
        setBusy(false);
        if (!res.ok) { onToast({ type: "error", text: res.error }); return; }
        setItens(prev => (prev ?? []).filter(i => i.id !== apagando.id));
        setApagando(null);
        onChanged();
        onToast({ type: "success", text: "Resposta apagada." });
    }

    const campo = "w-full px-3 py-2 rounded-lg text-sm bg-[#EEF2FF] dark:bg-[#1e2536] border border-[#A5B4FC] dark:border-[#4a5568] text-[#191918] dark:text-white placeholder:text-[#6366F1] dark:placeholder:text-[#94a3b8] focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/20 outline-none";

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#191918]/30 dark:bg-black/60 backdrop-blur-sm animate-in fade-in p-4">
            <div
                role="dialog"
                aria-label="Respostas rápidas"
                className="bg-[#F7F7F5] dark:bg-[#0f1829] border-2 border-[#C7D2FE] dark:border-[#3d4a60] rounded-2xl shadow-2xl w-[560px] max-w-full max-h-[85vh] flex flex-col animate-in zoom-in-95"
            >
                <div className="flex items-center justify-between px-5 pt-5 pb-3">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-brand-500/20 flex items-center justify-center">
                            <Zap className="w-4 h-4 text-brand-400" />
                        </div>
                        <h3 className="font-display text-base font-bold text-[#191918] dark:text-white">Respostas rápidas</h3>
                    </div>
                    <button onClick={onClose} aria-label="Fechar" className="p-1.5 rounded-lg hover:bg-[#EEF2FF] dark:hover:bg-[#1e2536] text-[#6366F1] dark:text-[#94a3b8] hover:text-[#191918] dark:hover:text-white transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <p className="px-5 pb-3 text-xs text-[#6366F1] dark:text-[#94a3b8]">
                    Digite <span className="font-mono">/</span> na caixa vazia do chat para usar. <span className="font-mono">{"{nome}"}</span> vira o primeiro nome do lead e <span className="font-mono">{"{atendente}"}</span> o seu — o texto entra na caixa para você revisar antes de enviar.
                </p>

                <div className="flex-1 overflow-y-auto px-5 pb-2 space-y-1.5">
                    {itens === null && <div className="py-6 text-center text-sm text-[#6366F1] dark:text-[#94a3b8]"><Loader2 className="w-4 h-4 animate-spin inline" /></div>}
                    {itens?.map(r => (
                        editando === r.id
                            ? <Formulario key={r.id} form={form} setForm={setForm} busy={busy} onSalvar={salvar} onCancelar={() => setEditando(null)} campo={campo} />
                            : (
                                <div key={r.id} className={cn("group/item flex items-start gap-3 rounded-xl px-3 py-2 border border-transparent hover:border-[#C7D2FE] dark:hover:border-[#3d4a60] hover:bg-[#EEF2FF]/60 dark:hover:bg-[#1e2536]/60 transition-colors", !r.ativo && "opacity-50")}>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono text-[11px] text-brand-500 dark:text-brand-400">{r.atalho}</span>
                                            <span className="text-sm font-medium text-[#191918] dark:text-white truncate">{r.titulo}</span>
                                            {!r.ativo && <span className="text-[10px] uppercase font-semibold text-[#6366F1] dark:text-[#94a3b8]">inativa</span>}
                                        </div>
                                        <p className="text-xs text-[#37352F] dark:text-[#cbd5e1] whitespace-pre-line line-clamp-2">{r.conteudo}</p>
                                    </div>
                                    {/* Ações sempre visíveis: toque não tem hover (SKILL §3). */}
                                    <div className="flex items-center gap-0.5 shrink-0">
                                        <button type="button" onClick={() => abrirEdicao(r)} title="Editar" aria-label={`Editar ${r.titulo}`} className="p-1.5 rounded-lg text-[#6366F1] dark:text-[#94a3b8] hover:bg-brand-500/15 hover:text-brand-500 transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                                        <button type="button" onClick={() => setApagando(r)} title="Apagar" aria-label={`Apagar ${r.titulo}`} className="p-1.5 rounded-lg text-[#6366F1] dark:text-[#94a3b8] hover:bg-rose-500/15 hover:text-rose-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                                    </div>
                                </div>
                            )
                    ))}
                    {editando === "nova" && <Formulario form={form} setForm={setForm} busy={busy} onSalvar={salvar} onCancelar={() => setEditando(null)} campo={campo} />}
                </div>

                <div className="px-5 py-3 border-t border-[#C7D2FE] dark:border-[#3d4a60]">
                    <button
                        type="button"
                        onClick={abrirNova}
                        disabled={editando === "nova"}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-40 transition-colors"
                    >
                        <Plus className="w-4 h-4" /> Nova resposta
                    </button>
                </div>
            </div>

            {apagando && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setApagando(null)}>
                    <div role="alertdialog" onClick={e => e.stopPropagation()} className="bg-[#F7F7F5] dark:bg-[#0f1829] border-2 border-[#C7D2FE] dark:border-[#3d4a60] rounded-2xl shadow-2xl w-[360px] max-w-full p-5">
                        <p className="text-sm text-[#191918] dark:text-white">Apagar <b>{apagando.atalho}</b> — {apagando.titulo}?</p>
                        <p className="text-xs text-[#6366F1] dark:text-[#94a3b8] mt-1">Se for só esconder por um tempo, prefira desmarcar “Ativa” na edição.</p>
                        <div className="flex gap-2 mt-4">
                            <button type="button" onClick={() => setApagando(null)} className="flex-1 px-3 py-2 rounded-xl text-sm border border-[#A5B4FC] dark:border-[#4a5568] text-[#37352F] dark:text-[#cbd5e1] hover:bg-[#EEF2FF] dark:hover:bg-[#1e2536]">Cancelar</button>
                            <button type="button" onClick={confirmarApagar} disabled={busy} className="flex-1 px-3 py-2 rounded-xl text-sm font-semibold bg-rose-500/20 border border-rose-500/30 text-rose-600 dark:text-rose-300 hover:bg-rose-500/30 disabled:opacity-40">
                                {busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Apagar"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function Formulario({ form, setForm, busy, onSalvar, onCancelar, campo }: {
    form: Form; setForm: (f: Form) => void; busy: boolean;
    onSalvar: () => void; onCancelar: () => void; campo: string;
}) {
    return (
        <div className="rounded-xl border-2 border-brand-500/40 bg-[#EEF2FF]/40 dark:bg-[#1e2536]/40 p-3 space-y-2">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2">
                <input
                    autoFocus
                    value={form.atalho}
                    onChange={e => setForm({ ...form, atalho: e.target.value })}
                    placeholder="/atalho"
                    maxLength={31}
                    aria-label="Atalho"
                    className={cn(campo, "font-mono")}
                />
                <input
                    value={form.titulo}
                    onChange={e => setForm({ ...form, titulo: e.target.value })}
                    placeholder="Título"
                    maxLength={60}
                    aria-label="Título"
                    className={campo}
                />
            </div>
            <textarea
                value={form.conteudo}
                onChange={e => setForm({ ...form, conteudo: e.target.value })}
                placeholder="Texto da resposta — use {nome} e {atendente}"
                rows={4}
                maxLength={4000}
                aria-label="Conteúdo"
                className={cn(campo, "resize-y min-h-20")}
            />
            <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-xs text-[#37352F] dark:text-[#cbd5e1]">
                    <input type="checkbox" checked={form.ativo} onChange={e => setForm({ ...form, ativo: e.target.checked })} className="accent-brand-500" />
                    Ativa (aparece no menu da /)
                </label>
                <div className="flex gap-1.5">
                    <button type="button" onClick={onCancelar} className="px-3 py-1.5 rounded-lg text-xs border border-[#A5B4FC] dark:border-[#4a5568] text-[#37352F] dark:text-[#cbd5e1] hover:bg-[#EEF2FF] dark:hover:bg-[#1e2536]">Cancelar</button>
                    <button type="button" onClick={onSalvar} disabled={busy || !form.titulo.trim() || !form.conteudo.trim()} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-40">
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Salvar"}
                    </button>
                </div>
            </div>
        </div>
    );
}
