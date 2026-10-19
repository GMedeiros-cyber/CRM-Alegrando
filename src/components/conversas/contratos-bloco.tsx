"use client";

import { useEffect, useState, useTransition } from "react";
import { FileDown, FileText, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
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
import { formatarInteiroBR, formatarMoedaBR, lerInteiroBR, lerNumeroBR } from "@/lib/numero-br";

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

/**
 * Os quatro campos numéricos, lidos em pt-BR (lib/numero-br.ts). Antes
 * "3.420" virava 3,42 e "1.200 alunos" virava 1, calados. Agora o que não é
 * número não salva: o campo fica marcado e o aviso diz qual (SKILL §8, item 1).
 */
type CampoNumerico = "qtdAlunos" | "qtdProfessores" | "valorPorAluno" | "valorTotal";
const NUMERICOS: Record<CampoNumerico, { rotulo: string; inteiro: boolean; exemplo: string }> = {
    qtdAlunos: { rotulo: "Alunos", inteiro: true, exemplo: "1.200" },
    qtdProfessores: { rotulo: "Professores", inteiro: true, exemplo: "4" },
    valorPorAluno: { rotulo: "Valor por aluno", inteiro: false, exemplo: "90,00" },
    valorTotal: { rotulo: "Valor total", inteiro: false, exemplo: "3.420,00" },
};
const lerCampo = (c: CampoNumerico, texto: string) => (NUMERICOS[c].inteiro ? lerInteiroBR(texto) : lerNumeroBR(texto));
const formatarCampo = (c: CampoNumerico, n: number | null) =>
    n === null ? "" : NUMERICOS[c].inteiro ? formatarInteiroBR(n) : formatarMoedaBR(n);
const erroDoCampo = (c: CampoNumerico, texto: string) =>
    `${NUMERICOS[c].rotulo}: “${texto.trim()}” não é um número. Exemplo: ${NUMERICOS[c].exemplo}.`;
/** Valor do campo, ou null se vazio OU inválido — só para a sugestão do total. */
const valorOuNull = (c: CampoNumerico, texto: string) => { const r = lerCampo(c, texto); return r.ok ? r.valor : null; };

type Invalido = { campo: CampoNumerico; erro: string } | null;

const moeda = (n: number | null) => (n === null ? "—" : formatarMoedaBR(n));

const dataBr = (iso: string | null) =>
    iso ? new Date(iso + "T00:00:00").toLocaleDateString("pt-BR") : "Sem data";

function rascunhoDe(c: Contrato): Rascunho {
    return {
        dataPasseio: c.dataPasseio ?? "",
        destino: c.destino ?? "",
        // Já formatados: antes o valor salvo voltava como "3420.5", ponto do JS.
        qtdAlunos: formatarCampo("qtdAlunos", c.qtdAlunos),
        qtdProfessores: formatarCampo("qtdProfessores", c.qtdProfessores),
        valorPorAluno: formatarCampo("valorPorAluno", c.valorPorAluno),
        valorTotal: formatarCampo("valorTotal", c.valorTotal),
        formaPagamento: c.formaPagamento ?? "",
        observacoes: c.observacoes ?? "",
        status: c.status,
    };
}

function camposDe(r: Rascunho): { ok: true; campos: CamposContrato } | { ok: false; invalido: NonNullable<Invalido> } {
    const numeros = {} as Record<CampoNumerico, number | null>;
    for (const c of Object.keys(NUMERICOS) as CampoNumerico[]) {
        const lido = lerCampo(c, r[c]);
        if (!lido.ok) return { ok: false, invalido: { campo: c, erro: erroDoCampo(c, r[c]) } };
        numeros[c] = lido.valor;
    }
    return {
        ok: true,
        campos: {
            dataPasseio: r.dataPasseio.trim() === "" ? null : r.dataPasseio,
            destino: r.destino.trim() || null,
            ...numeros,
            formaPagamento: r.formaPagamento.trim() || null,
            observacoes: r.observacoes.trim() || null,
            status: r.status,
        },
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

    const [invalido, setInvalido] = useState<Invalido>(null);

    function abrirNovo() { setRascunho(VAZIO); setInvalido(null); setEditando("novo"); }
    function abrirEdicao(c: Contrato) { setRascunho(rascunhoDe(c)); setInvalido(null); setEditando(c.id); }
    function fechar() { setEditando(null); setRascunho(VAZIO); setInvalido(null); }

    /** Ao sair do campo: número válido aparece formatado; inválido já fica marcado. */
    function sair(c: CampoNumerico) {
        const lido = lerCampo(c, rascunho[c]);
        if (!lido.ok) { setInvalido({ campo: c, erro: erroDoCampo(c, rascunho[c]) }); return; }
        if (lido.valor !== null) setRascunho({ ...rascunho, [c]: formatarCampo(c, lido.valor) });
    }

    function editar(r: Rascunho) {
        if (invalido && r[invalido.campo] !== rascunho[invalido.campo]) setInvalido(null);
        setRascunho(r);
    }

    function salvar() {
        const lido = camposDe(rascunho);
        if (!lido.ok) { setInvalido(lido.invalido); return; }
        const campos = lido.campos;
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

    const [gerando, setGerando] = useState<string | null>(null);

    /**
     * Baixa o .docx do contrato. fetch, e não <a href>: sem modelo enviado, um
     * link abriria a página de erro em texto puro; assim o erro vira toast.
     */
    async function gerarDocx(c: Contrato) {
        setGerando(c.id);
        try {
            const r = await fetch(`/api/contratos/${c.id}/docx`);
            if (!r.ok) { onToast({ type: "error", text: await r.text() }); return; }
            const cab = r.headers.get("Content-Disposition") ?? "";
            const nome = decodeURIComponent(cab.match(/filename\*=UTF-8''([^;]+)/)?.[1] ?? "Contrato.docx");
            const url = URL.createObjectURL(await r.blob());
            const a = document.createElement("a");
            a.href = url;
            a.download = nome;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 10_000);
        } catch {
            onToast({ type: "error", text: "Não foi possível gerar o contrato agora. Tente de novo." });
        } finally {
            setGerando(null);
        }
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
        const por = valorOuNull("valorPorAluno", rascunho.valorPorAluno);
        const qtd = valorOuNull("qtdAlunos", rascunho.qtdAlunos);
        return por !== null && qtd !== null ? Math.round(por * qtd * 100) / 100 : null;
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
                        rascunho={rascunho} setRascunho={editar} sugestao={sugestao} invalido={invalido} onSair={sair}
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
                        <button type="button" onClick={() => gerarDocx(c)} disabled={gerando === c.id}
                            className="w-full inline-flex items-center justify-center gap-1.5 h-10 md:h-7 mt-1 rounded-md border border-[#A5B4FC] dark:border-[#4a5568] text-[11px] font-semibold text-[#4338CA] dark:text-[#c7d2fe] hover:bg-[#E0E7FF] dark:hover:bg-[#2d3347] transition-colors disabled:opacity-60">
                            {gerando === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileDown className="w-3 h-3" />}
                            Gerar contrato (.docx)
                        </button>
                    </div>
                )
            ))}

            {editando === "novo" && (
                <Formulario
                    rascunho={rascunho} setRascunho={editar} sugestao={sugestao} invalido={invalido} onSair={sair}
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

function Formulario({ rascunho, setRascunho, sugestao, invalido, onSair, salvando, onSalvar, onCancelar }: {
    rascunho: Rascunho;
    setRascunho: (r: Rascunho) => void;
    sugestao: number | null;
    invalido: Invalido;
    onSair: (c: CampoNumerico) => void;
    salvando: boolean;
    onSalvar: () => void;
    onCancelar: () => void;
}) {
    const set = (p: Partial<Rascunho>) => setRascunho({ ...rascunho, ...p });
    /** Props comuns dos campos numéricos: marcação de inválido e formatação ao sair. */
    const numerico = (c: CampoNumerico) => ({
        value: rascunho[c],
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => set({ [c]: e.target.value }),
        onBlur: () => onSair(c),
        "aria-invalid": invalido?.campo === c || undefined,
        "aria-describedby": invalido?.campo === c ? "contrato-erro-numero" : undefined,
        className: cn(campo, "aria-invalid:border-red-500 dark:aria-invalid:border-red-400"),
    });
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
                <input inputMode="numeric" aria-label="Quantidade de alunos" placeholder="Alunos" {...numerico("qtdAlunos")} />
                <input inputMode="numeric" aria-label="Quantidade de professores" placeholder="Professores" {...numerico("qtdProfessores")} />
            </div>

            <div className="grid grid-cols-2 gap-1.5">
                <input inputMode="decimal" aria-label="Valor por aluno" placeholder="R$ por aluno" {...numerico("valorPorAluno")} />
                <input inputMode="decimal" aria-label="Valor total" placeholder="R$ total" {...numerico("valorTotal")} />
            </div>

            {invalido && (
                <p id="contrato-erro-numero" role="alert" className="text-[11px] font-medium text-red-600 dark:text-red-400">
                    {invalido.erro} Nada foi salvo.
                </p>
            )}

            {/* O total é digitado. A sugestão é um atalho, nunca escreve sozinha:
                desconto e professor isento fazem o produto não fechar. */}
            {sugestao !== null && valorOuNull("valorTotal", rascunho.valorTotal) !== sugestao && (
                <button type="button" onClick={() => set({ valorTotal: formatarMoedaBR(sugestao) })}
                    className="text-[10px] text-brand-500 dark:text-brand-400 hover:underline">
                    Usar sugestão: {moeda(sugestao)} ({rascunho.qtdAlunos} × {moeda(valorOuNull("valorPorAluno", rascunho.valorPorAluno))})
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
