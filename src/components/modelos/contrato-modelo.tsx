"use client";

import { useRef, useState, useTransition } from "react";
import { Download, RotateCcw, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { CAMPOS_CONTRATO, LIMITE_MODELO_BYTES, type InfoModelos } from "@/lib/contrato-campos";
import { enviarModeloContrato, voltarModeloAnterior } from "@/lib/actions/modelos";

const quando = (iso: string) =>
    new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

const BOTAO = "inline-flex items-center justify-center gap-2 h-10 md:h-9 px-4 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6366F1]/50 disabled:opacity-50 disabled:pointer-events-none";

/**
 * Modelos › Contrato. O modelo é um .docx que a equipe edita no Word; o CRM
 * só troca os campos `{…}`. O contrato de cada passeio sai do bloco de
 * contratos do lead ("Gerar contrato (.docx)").
 */
export function ContratoModelo({ infoInicial }: { infoInicial: InfoModelos }) {
    const [info, setInfo] = useState(infoInicial);
    const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
    const [ocupado, startOcupado] = useTransition();
    const arquivo = useRef<HTMLInputElement>(null);

    function enviar(f: File | undefined) {
        if (arquivo.current) arquivo.current.value = "";
        if (!f) return;
        if (f.size > LIMITE_MODELO_BYTES) { setAviso({ tipo: "erro", texto: "O arquivo passa de 4 MB." }); return; }
        const form = new FormData();
        form.append("arquivo", f);
        setAviso(null);
        startOcupado(async () => {
            const r = await enviarModeloContrato(form).catch(() => ({ ok: false as const, error: "Não foi possível enviar agora. Tente de novo." }));
            if (!r.ok) { setAviso({ tipo: "erro", texto: r.error }); return; }
            setInfo(r.info);
            setAviso({ tipo: "ok", texto: "Modelo novo em uso. O anterior ficou guardado." });
        });
    }

    function voltar() {
        setAviso(null);
        startOcupado(async () => {
            const r = await voltarModeloAnterior().catch(() => ({ ok: false as const, error: "Não foi possível voltar agora. Tente de novo." }));
            if (!r.ok) { setAviso({ tipo: "erro", texto: r.error }); return; }
            setInfo(r.info);
            setAviso({ tipo: "ok", texto: "Versão anterior em uso. A que estava ficou como anterior." });
        });
    }

    return (
        <div className="space-y-6">
            <section aria-labelledby="titulo-modelo-contrato" className="rounded-xl border bg-card p-4 sm:p-6 space-y-4 bento-enter [animation-delay:150ms]">
                <div className="space-y-1.5">
                    <h2 id="titulo-modelo-contrato" className="text-lg font-semibold text-[#191918] dark:text-white">Modelo de contrato</h2>
                    <p className="text-sm text-muted-foreground">
                        {info.atual ? `Versão em uso enviada em ${quando(info.atual.atualizadoEm)}.` : "Nenhum modelo enviado ainda."}
                    </p>
                    <p className="text-sm text-muted-foreground">
                        Baixe, ajuste no Word mantendo os campos entre chaves e envie a nova versão (arquivo .docx de até
                        4 MB). O contrato de cada passeio sai do bloco de contratos do lead, em “Gerar contrato (.docx)”.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <a
                        href="/api/modelos/contrato"
                        aria-disabled={!info.atual}
                        className={cn(BOTAO, "bg-primary text-primary-foreground hover:opacity-90", !info.atual && "opacity-50 pointer-events-none")}
                    >
                        <Download className="w-4 h-4" aria-hidden /> Baixar modelo atual
                    </a>
                    <button
                        type="button"
                        onClick={() => arquivo.current?.click()}
                        disabled={ocupado}
                        className={cn(BOTAO, "border border-[#A5B4FC] dark:border-[#4a5568] bg-[#EEF2FF] dark:bg-[#1e2536] text-[#4338CA] dark:text-[#c7d2fe] hover:bg-[#E0E7FF] dark:hover:bg-[#2d3347]")}
                    >
                        <Upload className="w-4 h-4" aria-hidden /> {ocupado ? "Enviando..." : "Enviar nova versão"}
                    </button>
                    <input
                        ref={arquivo}
                        type="file"
                        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        className="sr-only"
                        tabIndex={-1}
                        aria-hidden
                        onChange={(e) => enviar(e.target.files?.[0])}
                    />
                    {/* Longe das ações principais: volta a versão em uso (SKILL §3). */}
                    <button
                        type="button"
                        onClick={voltar}
                        disabled={ocupado || !info.anterior}
                        title={info.anterior ? `Anterior enviada em ${quando(info.anterior.atualizadoEm)}` : "Não há versão anterior guardada"}
                        className={cn(BOTAO, "sm:ml-auto text-muted-foreground hover:text-foreground hover:bg-muted")}
                    >
                        <RotateCcw className="w-4 h-4" aria-hidden /> Voltar para a versão anterior
                    </button>
                </div>

                <p role="status" aria-live="polite" className={cn("text-sm font-medium", aviso?.tipo === "erro" ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400")}>
                    {aviso?.texto}
                </p>
            </section>

            <section aria-labelledby="titulo-campos-contrato" className="rounded-xl border bg-card p-4 sm:p-6 space-y-4 bento-enter [animation-delay:200ms]">
                <div className="space-y-1.5">
                    <h2 id="titulo-campos-contrato" className="text-lg font-semibold text-[#191918] dark:text-white">Campos disponíveis</h2>
                    <p className="text-sm text-muted-foreground">
                        Cada campo é trocado pelo dado do CRM. Se o dado estiver vazio, sai o marcador grifado que o próprio modelo
                        traz, para completar no Word. No modelo, um campo com marcador fica assim:
                    </p>
                    <code className="block w-full overflow-x-auto rounded-md bg-[#EEF2FF] dark:bg-[#1e2536] px-3 py-2 font-mono text-[12px] text-[#191918] dark:text-white whitespace-nowrap">
                        {"{#cnpj}{cnpj}{/cnpj}{^cnpj}[PREENCHER CNPJ]{/cnpj}"}
                    </code>
                </div>
                <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]">
                    {CAMPOS_CONTRATO.map((c) => (
                        <div key={c.chave} className="contents">
                            <dt className="font-mono text-[13px] text-[#4338CA] dark:text-[#c7d2fe] break-all">{`{${c.chave}}`}</dt>
                            <dd className="text-sm text-[#37352F] dark:text-[#cbd5e1] mb-2 sm:mb-0">{c.descricao}</dd>
                        </div>
                    ))}
                </dl>
            </section>
        </div>
    );
}
