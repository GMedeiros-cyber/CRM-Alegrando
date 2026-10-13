"use client";

import { useEffect, useState, useTransition } from "react";
import { FileText, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    createContrato,
    deleteContrato,
    listContratos,
    updateContrato,
    type CamposContrato,
    type Contrato,
} from "@/lib/actions/contratos";
import { STATUS_CONTRATO, type StatusContrato } from "@/lib/contratos-status";

/**
 * Contratos do lead: um por passeio.
 *
 * Em arquivo próprio, e não dentro do painel de 1300 linhas, para o bloco
 * caber numa tela e o diff do painel ficar em quatro linhas.
 *
 * Escrita por server action (`lib/actions/contratos.ts`): a policy da tabela
 * só dá SELECT a `authenticated`, então gravar pelo cliente tomaria RLS.
 */

type Rascunho = {
    dataPasseio: string;
    destino: string;
    qtdAlunos: string;
    qtdProfessores: string;
    valorPorAluno: string;
    valorTotal: string;
    formaPagamento: string;
    observacoes: string;
    status: StatusContrato;
};

const VAZIO: Rascunho = {
    dataPasseio: "", destino: "", qtdAlunos: "", qtdProfessores: "",
    valorPorAluno: "", valorTotal: "", formaPagamento: "", observacoes: "",
    status: "rascunho",
};

const ROTULO_STATUS: Record<StatusContrato, string> = {
    rascunho: "Rascunho",
    enviado: "Enviado",
    assinado: "Assinado",
};

const CLASSE_STATUS: Record<StatusContrato, string> = {
    rascunho: "bg-[#E0E7FF] dark:bg-[#2d3347] text-[#37352F] dark:text-[#cbd5e1] border-[#A5B4FC] dark:border-[#4a5568]",
    enviado: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40",
    assinado: "bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/40",
};

const campo =
    "w-full rounded-lg h-8 px-3 text-sm bg-[#EEF2FF] dark:bg-[#1e2536] border border-[#A5B4FC] dark:border-[#4a5568] text-[#191918] dark:text-white placeholder:text-[#6366F1] dark:placeholder:text-[#64748b] outline-none focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/20";

/** `"12,50"` e `"12.50"` viram 12.5; vazio vira null. */
function paraNumero(v: string): number | null {
    const t = v.replace(/\s/g, "").replace(",", ".");
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
}

function paraInteiro(v: string): number | null {
    const t = v.trim();
    if (t === "") return null;
    const n = Number.parseInt(t, 10);
    return Number.isFinite(n) ? n : null;
}

const moeda = (n: number | null) =>
    n === null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dataBr = (iso: string | null) =>
    iso ? new Date(iso + "T00:00:00").toLocaleDateString("pt-BR") : "Sem data";

function rascunhoDe(c: Contrato): Rascunho {
    return {
        dataPasseio: c.dataPasseio ?? "",
        destino: c.destino ?? "",
        qtdAlunos: c.qtdAlunos?.toString() ?? "",
        qtdProfessores: c.qtdProfessores?.toString() ?? "",
        valorPorAluno: c.valorPorAluno?.toString() ?? "",
        valorTotal: c.valorTotal?.toString() ?? "",
        formaPagamento: c.formaPagamento ?? "",
        observacoes: c.observacoes ?? "",
        status: c.status,
    };
}

function camposDe(r: Rascunho): CamposContrato {
    return {
        dataPasseio: r.dataPasseio.trim() === "" ? null : r.dataPasseio,
        destino: r.destino.trim() || null,
        qtdAlunos: paraInteiro(r.qtdAlunos),
        qtdProfessores: paraInteiro(r.qtdProfessores),
        valorPorAluno: paraNumero(r.valorPorAluno),
        valorTotal: paraNumero(r.valorTotal),
        formaPagamento: r.formaPagamento.trim() || null,
        observacoes: r.observacoes.trim() || null,
        status: r.status,
    };
}

export function ContratosBloco({ leadId, onToast }: {
    leadId: string;
    onToast: (t: { type: "success" | "error"; text: string }) => void;
}) {
    const [contratos, setContratos] = useState<Contrato[] | null>(null);
    const [editando, setEditando] = useState<string | "novo" | null>(null);
    const [rascunho, setRascunho] = useState<Rascunho>(VAZIO);
    const [apagando, setApagando] = useState<Contrato | null>(null);
    const [salvando, iniciarSalvar] = useTransition();

    // Carrega na montagem. Quem monta passa `key={cliente.id}`, então trocar de
    // lead remonta e o estado volta a `null` (carregando) sozinho — sem
    // `setState` dentro do efeito, que a regra do compilador proíbe.
    //
    // `vivo` é guarda de instância: sob StrictMode o efeito roda duas vezes, e
    // sem ela a resposta da montagem descartada sobrescreveria a lista.
    useEffect(() => {
        let vivo = true;
        listContratos(leadId).then((lista) => { if (vivo) setContratos(lista); });
        return () => { vivo = false; };
    }, [leadId]);

    function abrirNovo() { setRascunho(VAZIO); setEditando("novo"); }
    function abrirEdicao(c: Contrato) { setRascunho(rascunhoDe(c)); setEditando(c.id); }
    function fechar() { setEditando(null); setRascunho(VAZIO); }

    function salvar() {
        const campos = camposDe(rascunho);
        iniciarSalvar(async () => {
            const res = editando === "novo"
                ? await createContrato(leadId, campos)
                : await updateContrato(String(editando), campos);
            if (!res.ok) { onToast({ type: "error", text: res.error }); return; }
            setContratos((prev) => {
                const lista = prev ?? [];
                const existe = lista.some((c) => c.id === res.contrato.id);
                const nova = existe
                    ? lista.map((c) => (c.id === res.contrato.id ? res.contrato : c))
                    : [res.contrato, ...lista];
                // Mesma ordem do índice: passeio mais recente primeiro, sem data no fim.
                return [...nova].sort((a, b) => (b.dataPasseio ?? "").localeCompare(a.dataPasseio ?? ""));
            });
            onToast({ type: "success", text: editando === "novo" ? "Contrato criado!" : "Contrato atualizado!" });
            fechar();
        });
    }

    function confirmarApagar() {
        const alvo = apagando;
        if (!alvo) return;
        iniciarSalvar(async () => {
            const res = await deleteContrato(alvo.id);
            if (!res.ok) { onToast({ type: "error", text: res.error }); return; }
            setContratos((prev) => (prev ?? []).filter((c) => c.id !== alvo.id));
            setApagando(null);
            onToast({ type: "success", text: "Contrato apagado." });
        });
    }

    // Sugestão, não imposição: `valor_total` é digitado porque desconto e
    // professor isento fazem valor_por_aluno × alunos não fechar.
    const sugestao = (() => {
        const por = paraNumero(rascunho.valorPorAluno);
        const qtd = paraInteiro(rascunho.qtdAlunos);
        return por !== null && qtd !== null ? por * qtd : null;
    })();

    return (
        <div className="pt-2 border-t border-[#C7D2FE] dark:border-[#3d4a60]/60 space-y-2">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-brand-400/70" />
                    <h4 className="text-xs font-semibold text-[#37352F] dark:text-[#cbd5e1] tracking-tight">
                        Contratos{contratos?.length ? ` · ${contratos.length}` : ""}
                    </h4>
                </div>
                {editando === null && (
                    <button
                        type="button"
                        onClick={abrirNovo}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold bg-brand-500/20 text-brand-400 border border-brand-500/30 hover:bg-brand-500/30 transition-colors"
                    >
                        <Plus className="w-3 h-3" /> Novo
                    </button>
                )}
            </div>

            {contratos === null && (
                <p className="text-[11px] text-[#6366F1] dark:text-[#94a3b8] px-1">
                    <Loader2 className="w-3 h-3 animate-spin inline" /> Carregando…
                </p>
            )}

            {contratos?.length === 0 && editando === null && (
                <p className="text-[11px] italic text-[#6366F1] dark:text-[#94a3b8] px-1">
                    Nenhum contrato registrado.
                </p>
            )}

            {contratos?.map((c) => (
                editando === c.id ? (
                    <Formulario
                        key={c.id}
                        rascunho={rascunho} setRascunho={setRascunho} sugestao={sugestao}
                        salvando={salvando} onSalvar={salvar} onCancelar={fechar}
                    />
                ) : (
                    <div key={c.id} className="rounded-lg border border-[#C7D2FE] dark:border-[#3d4a60]/60 px-2.5 py-2 space-y-1">
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                                <p className="text-[12px] font-medium text-[#191918] dark:text-white truncate">
                                    {c.destino || "Sem destino"}
                                </p>
                                <p className="text-[10px] text-[#6366F1] dark:text-[#94a3b8]">
                                    {dataBr(c.dataPasseio)}
                                    {c.qtdAlunos !== null && ` · ${c.qtdAlunos} alunos`}
                                    {c.qtdProfessores !== null && ` · ${c.qtdProfessores} prof.`}
                                </p>
                            </div>
                            <div className="flex items-center gap-0.5 shrink-0">
                                <span className={cn("px-1.5 py-0.5 rounded-full border text-[9px] font-semibold uppercase", CLASSE_STATUS[c.status])}>
                                    {ROTULO_STATUS[c.status]}
                                </span>
                                {/* Sempre visíveis: toque não tem hover (SKILL §3). */}
                                <button type="button" onClick={() => abrirEdicao(c)} title="Editar" aria-label={`Editar contrato de ${c.destino || "sem destino"}`}
                                    className="p-1 rounded text-[#6366F1] dark:text-[#94a3b8] hover:bg-brand-500/15 hover:text-brand-500 transition-colors">
                                    <Pencil className="w-3 h-3" />
                                </button>
                                <button type="button" onClick={() => setApagando(c)} title="Apagar" aria-label={`Apagar contrato de ${c.destino || "sem destino"}`}
                                    className="p-1 rounded text-[#6366F1] dark:text-[#94a3b8] hover:bg-rose-500/15 hover:text-rose-500 transition-colors">
                                    <Trash2 className="w-3 h-3" />
                                </button>
                            </div>
                        </div>
                        <p className="text-[11px] text-[#37352F] dark:text-[#cbd5e1]">
                            {moeda(c.valorTotal)}
                            {c.valorPorAluno !== null && (
                                <span className="text-[#6366F1] dark:text-[#94a3b8]"> · {moeda(c.valorPorAluno)}/aluno</span>
                            )}
                            {c.formaPagamento && (
                                <span className="text-[#6366F1] dark:text-[#94a3b8]"> · {c.formaPagamento}</span>
                            )}
                        </p>
                        {c.observacoes && (
                            <p className="text-[10px] text-[#6366F1] dark:text-[#94a3b8] whitespace-pre-line line-clamp-2">{c.observacoes}</p>
                        )}
                    </div>
                )
            ))}

            {editando === "novo" && (
                <Formulario
                    rascunho={rascunho} setRascunho={setRascunho} sugestao={sugestao}
                    salvando={salvando} onSalvar={salvar} onCancelar={fechar}
                />
            )}

            {apagando && (
                <div className="rounded-lg border-2 border-rose-500/40 bg-rose-500/5 px-2.5 py-2 space-y-2">
                    <p className="text-[11px] text-[#191918] dark:text-white">
                        Apagar o contrato de <b>{apagando.destino || "sem destino"}</b> ({dataBr(apagando.dataPasseio)})?
                    </p>
                    <div className="flex gap-1.5">
                        <button type="button" onClick={() => setApagando(null)}
                            className="flex-1 px-2 py-1 rounded-lg text-[11px] border border-[#A5B4FC] dark:border-[#4a5568] text-[#37352F] dark:text-[#cbd5e1] hover:bg-[#EEF2FF] dark:hover:bg-[#1e2536]">
                            Cancelar
                        </button>
                        <button type="button" onClick={confirmarApagar} disabled={salvando}
                            className="flex-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-rose-500/20 border border-rose-500/30 text-rose-600 dark:text-rose-300 hover:bg-rose-500/30 disabled:opacity-40">
                            {salvando ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : "Apagar"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function Formulario({ rascunho, setRascunho, sugestao, salvando, onSalvar, onCancelar }: {
    rascunho: Rascunho;
    setRascunho: (r: Rascunho) => void;
    sugestao: number | null;
    salvando: boolean;
    onSalvar: () => void;
    onCancelar: () => void;
}) {
    const set = (p: Partial<Rascunho>) => setRascunho({ ...rascunho, ...p });
    return (
        <div className="rounded-lg border-2 border-brand-500/40 bg-[#EEF2FF]/40 dark:bg-[#1e2536]/40 p-2.5 space-y-2">
            <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#6366F1] dark:text-[#94a3b8]">Contrato</p>
                <button type="button" onClick={onCancelar} aria-label="Fechar" className="p-0.5 rounded text-[#6366F1] dark:text-[#94a3b8] hover:text-[#191918] dark:hover:text-white">
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
                <input type="date" aria-label="Data do passeio" value={rascunho.dataPasseio}
                    onChange={(e) => set({ dataPasseio: e.target.value })} className={campo} />
                <select aria-label="Status" value={rascunho.status}
                    onChange={(e) => set({ status: e.target.value as StatusContrato })} className={campo}>
                    {STATUS_CONTRATO.map((s) => <option key={s} value={s}>{ROTULO_STATUS[s]}</option>)}
                </select>
            </div>

            <input aria-label="Destino" placeholder="Destino" maxLength={200} value={rascunho.destino}
                onChange={(e) => set({ destino: e.target.value })} className={campo} />

            <div className="grid grid-cols-2 gap-1.5">
                <input inputMode="numeric" aria-label="Quantidade de alunos" placeholder="Alunos" value={rascunho.qtdAlunos}
                    onChange={(e) => set({ qtdAlunos: e.target.value })} className={campo} />
                <input inputMode="numeric" aria-label="Quantidade de professores" placeholder="Professores" value={rascunho.qtdProfessores}
                    onChange={(e) => set({ qtdProfessores: e.target.value })} className={campo} />
            </div>

            <div className="grid grid-cols-2 gap-1.5">
                <input inputMode="decimal" aria-label="Valor por aluno" placeholder="R$ por aluno" value={rascunho.valorPorAluno}
                    onChange={(e) => set({ valorPorAluno: e.target.value })} className={campo} />
                <input inputMode="decimal" aria-label="Valor total" placeholder="R$ total" value={rascunho.valorTotal}
                    onChange={(e) => set({ valorTotal: e.target.value })} className={campo} />
            </div>

            {/* O total é digitado. A sugestão é um atalho, nunca escreve sozinha:
                desconto e professor isento fazem o produto não fechar. */}
            {sugestao !== null && paraNumero(rascunho.valorTotal) !== sugestao && (
                <button type="button" onClick={() => set({ valorTotal: String(sugestao) })}
                    className="text-[10px] text-brand-500 dark:text-brand-400 hover:underline">
                    Usar sugestão: {moeda(sugestao)} ({rascunho.qtdAlunos} × {moeda(paraNumero(rascunho.valorPorAluno))})
                </button>
            )}

            <input aria-label="Forma de pagamento" placeholder="Forma de pagamento" maxLength={120} value={rascunho.formaPagamento}
                onChange={(e) => set({ formaPagamento: e.target.value })} className={campo} />

            <textarea aria-label="Observações" placeholder="Observações" rows={2} maxLength={4000} value={rascunho.observacoes}
                onChange={(e) => set({ observacoes: e.target.value })}
                className={cn(campo, "h-auto py-1.5 resize-y min-h-14")} />

            <div className="flex gap-1.5">
                <button type="button" onClick={onCancelar}
                    className="flex-1 px-2 py-1 rounded-lg text-[11px] border border-[#A5B4FC] dark:border-[#4a5568] text-[#37352F] dark:text-[#cbd5e1] hover:bg-[#EEF2FF] dark:hover:bg-[#1e2536]">
                    Cancelar
                </button>
                <button type="button" onClick={onSalvar} disabled={salvando}
                    className="flex-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-40">
                    {salvando ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : "Salvar"}
                </button>
            </div>
        </div>
    );
}
