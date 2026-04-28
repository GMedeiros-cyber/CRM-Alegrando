"use client";

import { useState, useEffect, useMemo, useTransition, useRef } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Plus,
    Pencil,
    Trash2,
    AlertCircle,
    Loader2,
    Check,
    X,
    Search,
    Sparkles,
    FileUp,
    ArrowDownAZ,
    ArrowUpAZ,
    FileText,
} from "lucide-react";
import {
    getPasseios,
    createPasseio,
    updatePasseio,
    deletePasseio,
    getCategorias,
    upsertCategoria,
    deleteCategoria,
    convertToMarkdown,
    type Passeio,
    type PasseioForm,
    type Categoria,
} from "@/lib/actions/documents";
import { cn } from "@/lib/utils";

const EMPTY_FORM: PasseioForm = { nome: "", categoria: "outro", content: "" };
const PAGE_SIZE = 10;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

function normalizeText(s: string): string {
    return s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "");
}

async function fileToBase64(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}

export function PasseiosPanel() {
    const [passeios, setPasseios] = useState<Passeio[]>([]);
    const [categorias, setCategorias] = useState<Categoria[]>([]);
    const [loading, setLoading] = useState(true);

    // Filtros / paginação
    const [searchTerm, setSearchTerm] = useState("");
    const [filterCat, setFilterCat] = useState<string>("todas");
    const [sortOrder, setSortOrder] = useState<"az" | "za">("az");
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

    // Modal
    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [form, setForm] = useState<PasseioForm>(EMPTY_FORM);
    const [saving, startSaving] = useTransition();
    const [feedback, setFeedback] = useState<{ kind: "ok" | "warn" | "err"; msg: string } | null>(null);

    // Conversão Markdown
    const [activeTab, setActiveTab] = useState<"texto" | "arquivo">("texto");
    const [rawText, setRawText] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const [generating, setGenerating] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    // Categorias inline
    const [showCategorias, setShowCategorias] = useState(false);

    async function reload() {
        const [p, c] = await Promise.all([getPasseios(), getCategorias()]);
        setPasseios(p);
        setCategorias(c);
        setLoading(false);
    }

    useEffect(() => {
        async function load() {
            const [p, c] = await Promise.all([getPasseios(), getCategorias()]);
            setPasseios(p);
            setCategorias(c);
            setLoading(false);
        }
        load();
    }, []);

    const catMap = useMemo(
        () => Object.fromEntries(categorias.map((c) => [c.slug, c])),
        [categorias]
    );

    const filteredPasseios = useMemo(() => {
        const search = normalizeText(searchTerm.trim());
        let list = passeios;

        if (search) {
            list = list.filter((p) => normalizeText(p.nome).includes(search));
        }
        if (filterCat !== "todas") {
            list = list.filter((p) => (p.categoria || "outro") === filterCat);
        }
        list = [...list].sort((a, b) => {
            const cmp = a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });
            return sortOrder === "az" ? cmp : -cmp;
        });

        return list;
    }, [passeios, searchTerm, filterCat, sortOrder]);

    const visiblePasseios = filteredPasseios.slice(0, visibleCount);
    const hasMore = filteredPasseios.length > visibleCount;

    function openCreate() {
        setEditingId(null);
        setForm(EMPTY_FORM);
        setActiveTab("texto");
        setRawText("");
        setFile(null);
        setFeedback(null);
        setModalOpen(true);
    }

    function openEdit(p: Passeio) {
        setEditingId(p.id);
        setForm({
            nome: p.nome,
            categoria: p.categoria || "outro",
            content: p.content,
        });
        setActiveTab("texto");
        setRawText("");
        setFile(null);
        setFeedback(null);
        setModalOpen(true);
    }

    async function handleGenerate() {
        if (!form.nome.trim()) {
            setFeedback({ kind: "err", msg: "Informe o nome do passeio antes de gerar." });
            return;
        }

        const hasText = activeTab === "texto" && rawText.trim().length > 0;
        const hasFile = activeTab === "arquivo" && !!file;
        if (!hasText && !hasFile) {
            setFeedback({
                kind: "err",
                msg: activeTab === "texto" ? "Cole o texto do passeio." : "Anexe um arquivo PDF ou imagem.",
            });
            return;
        }

        setFeedback(null);
        setGenerating(true);

        try {
            const payload: Parameters<typeof convertToMarkdown>[0] = { nome: form.nome };
            if (hasText) {
                payload.text = rawText;
            }
            if (hasFile && file) {
                if (file.size > MAX_FILE_SIZE) {
                    setFeedback({ kind: "err", msg: "Arquivo muito grande (máx 10 MB)." });
                    setGenerating(false);
                    return;
                }
                payload.fileBase64 = await fileToBase64(file);
                payload.fileMimeType = file.type;
                payload.fileName = file.name;
            }

            const result = await convertToMarkdown(payload);
            if (!result.success) {
                setFeedback({ kind: "err", msg: result.error || "Falha na conversão." });
                return;
            }

            setForm((f) => ({ ...f, content: result.markdown! }));
            setFeedback({ kind: "ok", msg: "Markdown gerado! Revise abaixo e ajuste se quiser." });
        } catch (err) {
            setFeedback({ kind: "err", msg: err instanceof Error ? err.message : "Erro inesperado." });
        } finally {
            setGenerating(false);
        }
    }

    function handleSave() {
        if (!form.nome.trim()) {
            setFeedback({ kind: "err", msg: "Informe o nome do passeio." });
            return;
        }
        if (!form.content.trim()) {
            setFeedback({ kind: "err", msg: "Conteúdo vazio. Cole texto ou anexe arquivo e gere o Markdown primeiro." });
            return;
        }
        setFeedback(null);
        startSaving(async () => {
            const result = editingId == null
                ? await createPasseio(form)
                : await updatePasseio(editingId, form);

            if (!result.success) {
                setFeedback({ kind: "err", msg: result.error || "Erro ao salvar." });
                return;
            }

            if (!result.embeddingGerado) {
                setFeedback({
                    kind: "warn",
                    msg: "Salvo. Embedding será gerado pelo n8n na próxima execução do workflow RAG.",
                });
            } else {
                setFeedback({ kind: "ok", msg: "Salvo com embedding!" });
            }

            await reload();
            setTimeout(() => setModalOpen(false), 700);
        });
    }

    async function handleDelete(p: Passeio) {
        if (!window.confirm(`Excluir "${p.nome}"? Esta ação não pode ser desfeita.`)) return;
        const result = await deletePasseio(p.id);
        if (!result.success) {
            alert(result.error || "Erro ao excluir.");
            return;
        }
        await reload();
    }

    return (
        <div className="space-y-6">
            <div className="rounded-xl border bg-card p-6 space-y-5 bento-enter [animation-delay:400ms]">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <h2 className="text-lg font-semibold text-[#191918] dark:text-white">
                            Passeios da Base de Conhecimento
                        </h2>
                        <p className="text-sm text-muted-foreground mt-1">
                            {loading
                                ? "Carregando..."
                                : `Mostrando ${visiblePasseios.length} de ${filteredPasseios.length}${
                                      filteredPasseios.length !== passeios.length ? ` (${passeios.length} total)` : ""
                                  }.`}{" "}
                            Usados pela IA para responder dúvidas dos leads.
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => setShowCategorias((v) => !v)}>
                            {showCategorias ? "Ocultar categorias" : "Categorias"}
                        </Button>
                        <Button onClick={openCreate} size="sm">
                            <Plus className="size-4" /> Novo Passeio
                        </Button>
                    </div>
                </div>

                {showCategorias && (
                    <CategoriasManager
                        categorias={categorias}
                        passeios={passeios}
                        onChange={reload}
                    />
                )}

                {/* Barra de filtros */}
                <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative flex-1 min-w-[200px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                        <Input
                            value={searchTerm}
                            onChange={(e) => {
                                setSearchTerm(e.target.value);
                                setVisibleCount(PAGE_SIZE);
                            }}
                            placeholder="Buscar passeio..."
                            className="pl-9"
                        />
                    </div>
                    <Select value={filterCat} onValueChange={(v) => { setFilterCat(v); setVisibleCount(PAGE_SIZE); }}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Categoria" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="todas">Todas as categorias</SelectItem>
                            {categorias.map((c) => (
                                <SelectItem key={c.slug} value={c.slug}>
                                    <span className="mr-1">{c.icone}</span> {c.nome}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSortOrder((o) => (o === "az" ? "za" : "az"))}
                        title={sortOrder === "az" ? "A → Z" : "Z → A"}
                    >
                        {sortOrder === "az" ? <ArrowDownAZ className="size-4" /> : <ArrowUpAZ className="size-4" />}
                        {sortOrder === "az" ? "A → Z" : "Z → A"}
                    </Button>
                </div>

                {/* Lista */}
                <div className="space-y-2">
                    {loading && (
                        <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                            <Loader2 className="size-4 animate-spin mr-2" /> Carregando passeios...
                        </div>
                    )}

                    {!loading && filteredPasseios.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground text-sm">
                            {passeios.length === 0
                                ? "Nenhum passeio cadastrado ainda. Clique em Novo Passeio para começar."
                                : "Nenhum passeio encontrado com esses filtros."}
                        </div>
                    )}

                    {!loading && visiblePasseios.map((p) => {
                        const cat = p.categoria ? catMap[p.categoria] : null;
                        return (
                            <div
                                key={p.id}
                                className="group flex items-center gap-3 p-3 rounded-lg border border-[#E0E7FF] dark:border-[#3d4a60] bg-[#F9FAFC] dark:bg-[#1e2536]/50 hover:bg-[#F0F4FF] dark:hover:bg-[#1e2536] transition-colors"
                            >
                                <div className="text-2xl shrink-0">{cat?.icone || "📍"}</div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <p className="text-sm font-semibold text-[#191918] dark:text-white truncate">
                                            {p.nome}
                                        </p>
                                        {!p.temEmbedding && (
                                            <span
                                                title="Sem embedding — RAG não consegue buscar"
                                                className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-orange-200 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200 border border-orange-400/50"
                                            >
                                                <AlertCircle className="size-3" />
                                                sem embedding
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {cat ? cat.nome : p.categoria || "sem categoria"}
                                    </p>
                                </div>
                                <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                                    <Button variant="ghost" size="sm" onClick={() => openEdit(p)} aria-label="Editar">
                                        <Pencil className="size-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleDelete(p)}
                                        aria-label="Excluir"
                                        className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                                    >
                                        <Trash2 className="size-4" />
                                    </Button>
                                </div>
                            </div>
                        );
                    })}

                    {hasMore && (
                        <div className="flex justify-center pt-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                            >
                                Ver mais {Math.min(PAGE_SIZE, filteredPasseios.length - visibleCount)} ({filteredPasseios.length - visibleCount} restantes)
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            {/* Modal */}
            <Dialog open={modalOpen} onOpenChange={setModalOpen}>
                <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>
                            {editingId == null ? "Novo Passeio" : "Editar Passeio"}
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-4">
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium">Nome do passeio *</label>
                                <Input
                                    value={form.nome}
                                    onChange={(e) => setForm({ ...form, nome: e.target.value })}
                                    placeholder="Ex: Aldeia Nakana — Folclore"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium">Categoria</label>
                                <Select
                                    value={form.categoria}
                                    onValueChange={(v) => setForm({ ...form, categoria: v })}
                                >
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Escolher" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {categorias.map((c) => (
                                            <SelectItem key={c.slug} value={c.slug}>
                                                <span className="mr-1">{c.icone}</span> {c.nome}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Tabs de input */}
                        <div className="space-y-2">
                            <div className="flex gap-1 border-b border-border">
                                <button
                                    type="button"
                                    onClick={() => setActiveTab("texto")}
                                    className={cn(
                                        "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
                                        activeTab === "texto"
                                            ? "border-brand-500 text-[#191918] dark:text-white"
                                            : "border-transparent text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    Colar texto
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveTab("arquivo")}
                                    className={cn(
                                        "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
                                        activeTab === "arquivo"
                                            ? "border-brand-500 text-[#191918] dark:text-white"
                                            : "border-transparent text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    Anexar PDF/Imagem
                                </button>
                            </div>

                            {activeTab === "texto" && (
                                <Textarea
                                    value={rawText}
                                    onChange={(e) => setRawText(e.target.value)}
                                    rows={8}
                                    placeholder="Cole aqui o texto livre do passeio (descrição, roteiro, valores etc.). A IA vai estruturar automaticamente em Markdown."
                                />
                            )}

                            {activeTab === "arquivo" && (
                                <div className="space-y-2">
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="application/pdf,image/jpeg,image/png,image/jpg"
                                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                                        className="hidden"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        className="w-full border-2 border-dashed border-[#C7D2FE] dark:border-[#3d4a60] bg-[#F0F4FF]/50 dark:bg-[#1e2536]/30 rounded-lg p-6 text-center hover:bg-[#F0F4FF] dark:hover:bg-[#1e2536]/50 transition-colors"
                                    >
                                        <FileUp className="size-8 mx-auto text-muted-foreground mb-2" />
                                        {file ? (
                                            <p className="text-sm font-medium text-[#191918] dark:text-white">
                                                <FileText className="inline size-4 mr-1" />
                                                {file.name}
                                                <span className="text-muted-foreground ml-2 text-xs">
                                                    ({(file.size / 1024).toFixed(0)} KB) — clique para trocar
                                                </span>
                                            </p>
                                        ) : (
                                            <>
                                                <p className="text-sm font-medium text-[#191918] dark:text-white">
                                                    Clique para selecionar
                                                </p>
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    PDF, JPG ou PNG (máx 10 MB)
                                                </p>
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}

                            <Button
                                type="button"
                                onClick={handleGenerate}
                                disabled={generating || saving}
                                className="w-full"
                                variant="default"
                            >
                                {generating ? (
                                    <>
                                        <Loader2 className="size-4 animate-spin" /> Gerando Markdown...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="size-4" /> Gerar Markdown estruturado
                                    </>
                                )}
                            </Button>
                        </div>

                        {/* Markdown final */}
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium">Markdown final {editingId == null ? "(gerado pela IA — revise antes de salvar)" : "(conteúdo atual — pode ajustar ou re-gerar)"}</label>
                            <Textarea
                                value={form.content}
                                onChange={(e) => setForm({ ...form, content: e.target.value })}
                                rows={16}
                                className="font-mono text-xs"
                                placeholder="O Markdown gerado aparecerá aqui. Você pode ajustar manualmente antes de salvar."
                            />
                        </div>

                        {feedback && (
                            <div
                                className={cn(
                                    "rounded-md p-3 text-sm flex items-start gap-2",
                                    feedback.kind === "ok" && "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200",
                                    feedback.kind === "warn" && "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200",
                                    feedback.kind === "err" && "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200",
                                )}
                            >
                                {feedback.kind === "ok" && <Check className="size-4 shrink-0 mt-0.5" />}
                                {feedback.kind === "warn" && <AlertCircle className="size-4 shrink-0 mt-0.5" />}
                                {feedback.kind === "err" && <X className="size-4 shrink-0 mt-0.5" />}
                                <span className="whitespace-pre-wrap">{feedback.msg}</span>
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving || generating}>
                            Cancelar
                        </Button>
                        <Button onClick={handleSave} disabled={saving || generating}>
                            {saving ? (
                                <>
                                    <Loader2 className="size-4 animate-spin" /> Salvando...
                                </>
                            ) : (
                                "Salvar passeio"
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

// =============================================
// CategoriasManager (sub-componente)
// =============================================

function CategoriasManager({
    categorias,
    passeios,
    onChange,
}: {
    categorias: Categoria[];
    passeios: Passeio[];
    onChange: () => Promise<void>;
}) {
    const [adding, setAdding] = useState(false);
    const [editingSlug, setEditingSlug] = useState<string | null>(null);
    const [draftNome, setDraftNome] = useState("");
    const [draftIcone, setDraftIcone] = useState("📍");
    const [busy, startBusy] = useTransition();
    const [error, setError] = useState("");

    function startAdd() {
        setAdding(true);
        setEditingSlug(null);
        setDraftNome("");
        setDraftIcone("📍");
        setError("");
    }

    function startEdit(c: Categoria) {
        setAdding(false);
        setEditingSlug(c.slug);
        setDraftNome(c.nome);
        setDraftIcone(c.icone);
        setError("");
    }

    function cancel() {
        setAdding(false);
        setEditingSlug(null);
        setError("");
    }

    function save() {
        setError("");
        startBusy(async () => {
            const result = await upsertCategoria(draftNome, draftIcone, editingSlug || undefined);
            if (!result.success) {
                setError(result.error || "Erro ao salvar.");
                return;
            }
            await onChange();
            cancel();
        });
    }

    async function handleDelete(c: Categoria) {
        const count = passeios.filter((p) => p.categoria === c.slug).length;
        const confirmMsg =
            count > 0
                ? `Excluir categoria "${c.nome}"? ${count} passeio(s) serão movidos para "Outro".`
                : `Excluir categoria "${c.nome}"?`;
        if (!window.confirm(confirmMsg)) return;
        const result = await deleteCategoria(c.slug);
        if (!result.success) {
            alert(result.error || "Erro ao excluir.");
            return;
        }
        await onChange();
    }

    return (
        <div className="rounded-lg border border-dashed border-[#C7D2FE] dark:border-[#3d4a60] bg-[#F0F4FF]/50 dark:bg-[#1e2536]/30 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-[#191918] dark:text-white">
                    Gerenciar Categorias
                </h3>
                {!adding && !editingSlug && (
                    <Button variant="outline" size="sm" onClick={startAdd}>
                        <Plus className="size-3.5" /> Nova
                    </Button>
                )}
            </div>

            <div className="space-y-1.5">
                {categorias.map((c) => {
                    const isEditing = editingSlug === c.slug;
                    const count = passeios.filter((p) => p.categoria === c.slug).length;
                    if (isEditing) {
                        return (
                            <CategoriaEditRow
                                key={c.slug}
                                draftNome={draftNome}
                                draftIcone={draftIcone}
                                setDraftNome={setDraftNome}
                                setDraftIcone={setDraftIcone}
                                onSave={save}
                                onCancel={cancel}
                                busy={busy}
                                error={error}
                            />
                        );
                    }
                    return (
                        <div
                            key={c.slug}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-card transition-colors"
                        >
                            <span className="text-lg">{c.icone}</span>
                            <span className="flex-1 text-sm font-medium text-[#191918] dark:text-white">
                                {c.nome}
                            </span>
                            <span className="text-xs text-muted-foreground">{count} passeio{count !== 1 ? "s" : ""}</span>
                            <Button variant="ghost" size="sm" onClick={() => startEdit(c)} aria-label="Editar">
                                <Pencil className="size-3.5" />
                            </Button>
                            {c.slug !== "outro" && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDelete(c)}
                                    aria-label="Excluir"
                                    className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                                >
                                    <Trash2 className="size-3.5" />
                                </Button>
                            )}
                        </div>
                    );
                })}

                {adding && (
                    <CategoriaEditRow
                        draftNome={draftNome}
                        draftIcone={draftIcone}
                        setDraftNome={setDraftNome}
                        setDraftIcone={setDraftIcone}
                        onSave={save}
                        onCancel={cancel}
                        busy={busy}
                        error={error}
                    />
                )}
            </div>
        </div>
    );
}

function CategoriaEditRow({
    draftNome,
    draftIcone,
    setDraftNome,
    setDraftIcone,
    onSave,
    onCancel,
    busy,
    error,
}: {
    draftNome: string;
    draftIcone: string;
    setDraftNome: (v: string) => void;
    setDraftIcone: (v: string) => void;
    onSave: () => void;
    onCancel: () => void;
    busy: boolean;
    error: string;
}) {
    return (
        <div className="flex flex-col gap-2 px-2 py-2 rounded-md bg-card border border-[#C7D2FE] dark:border-[#3d4a60]">
            <div className="flex items-center gap-2">
                <Input
                    value={draftIcone}
                    onChange={(e) => setDraftIcone(e.target.value)}
                    placeholder="📍"
                    className="w-16 text-center text-lg"
                    maxLength={4}
                />
                <Input
                    value={draftNome}
                    onChange={(e) => setDraftNome(e.target.value)}
                    placeholder="Nome da categoria"
                    className="flex-1"
                    autoFocus
                />
                <Button size="sm" onClick={onSave} disabled={busy}>
                    {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                </Button>
                <Button variant="outline" size="sm" onClick={onCancel} disabled={busy}>
                    <X className="size-3.5" />
                </Button>
            </div>
            {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>
    );
}
