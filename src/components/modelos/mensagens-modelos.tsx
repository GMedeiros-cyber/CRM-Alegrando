"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { updateSetting } from "@/lib/actions/settings";
import { SETTING_DEFAULTS } from "@/lib/settings_helper";
import { catalogoDaMensagem, validarMensagem, type ChaveMensagem } from "@/lib/mensagem-placeholders";
import { EditorMensagem } from "./editor-mensagem";

type Selo = { tipo: "automatico" | "manual" | "inativo"; rotulo: string; detalhe: string };

/**
 * "Quando sai" de cada mensagem, MEDIDO no código de envio em 19/10/2026 —
 * não suposto. Se o envio mudar, este texto tem de mudar junto:
 * - follow-up e avaliação: `api/cron/followup` (janela no horário do lead,
 *   `followup_hora`, só com `followup_ativo`) e `sendManualFollowup` (botão
 *   "Enviar Follow-up Agora": até 1 dia após o passeio manda a avaliação,
 *   depois o follow-up);
 * - pós-passeio: `sendPosPasseio`, botão "Enviar Link" no painel do lead;
 * - aniversário: o disparo ainda não subiu.
 */
const MENSAGENS: Array<{ chave: ChaveMensagem; titulo: string; selo: Selo }> = [
    {
        chave: "aniversario_mensagem",
        titulo: "Aniversário",
        selo: { tipo: "inativo", rotulo: "Ainda não ativo", detalhe: "O envio automático do aniversário ainda não está no ar." },
    },
    {
        chave: "followup_mensagem",
        titulo: "Follow-up",
        selo: {
            tipo: "automatico",
            rotulo: "Automático",
            detalhe: "N dias após o passeio (definido no lead, padrão 45), no horário do lead (padrão 09:00), se o follow-up estiver ativo. Também pelo botão “Enviar Follow-up Agora”, no painel do lead.",
        },
    },
    {
        chave: "avaliacao_mensagem",
        titulo: "Avaliação no Google",
        selo: {
            tipo: "automatico",
            rotulo: "Automático",
            detalhe: "1 dia após o passeio, no horário do lead (padrão 09:00), se o follow-up estiver ativo. Também pelo botão “Enviar Follow-up Agora” até 1 dia após o passeio.",
        },
    },
    {
        chave: "pos_passeio_mensagem",
        titulo: "Pós-passeio",
        selo: { tipo: "manual", rotulo: "Manual", detalhe: "Botão “Enviar Link” no painel do lead, com o link colado na hora do envio." },
    },
];

const COR_SELO: Record<Selo["tipo"], string> = {
    automatico: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    manual: "bg-[#EEF2FF] text-[#4338CA] dark:bg-[#6366F1]/15 dark:text-[#c7d2fe] border-[#A5B4FC] dark:border-[#6366F1]/40",
    inativo: "bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/40",
};

export function MensagensModelos({ textos, linkGoogle }: { textos: Record<ChaveMensagem, string>; linkGoogle: string }) {
    return (
        <div className="space-y-6">
            {MENSAGENS.map((m, i) => (
                <CartaoMensagem
                    key={m.chave}
                    {...m}
                    inicial={textos[m.chave]}
                    linkGoogle={linkGoogle}
                    atraso={i}
                />
            ))}
        </div>
    );
}

function CartaoMensagem({ chave, titulo, selo, inicial, linkGoogle, atraso }: {
    chave: ChaveMensagem;
    titulo: string;
    selo: Selo;
    inicial: string;
    linkGoogle: string;
    atraso: number;
}) {
    const catalogo = catalogoDaMensagem(chave, linkGoogle);
    const [valor, setValor] = useState(inicial);
    const [salvo, setSalvo] = useState(inicial);
    const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
    const [salvando, startSalvar] = useTransition();
    const idTitulo = `titulo-${chave}`;

    function salvar() {
        // A tela avisa já; o servidor confere de novo (updateSetting) e é quem manda.
        const erro = validarMensagem(valor, catalogo);
        if (erro) { setAviso({ tipo: "erro", texto: erro }); return; }
        startSalvar(async () => {
            try {
                const r = await updateSetting(chave, valor);
                if (!r.success) { setAviso({ tipo: "erro", texto: r.error }); return; }
                setSalvo(valor);
                setAviso({ tipo: "ok", texto: "Salvo." });
            } catch {
                setAviso({ tipo: "erro", texto: "Não foi possível salvar. Tente de novo." });
            }
        });
    }

    function restaurar() {
        setValor(SETTING_DEFAULTS[chave] ?? "");
        setAviso({ tipo: "ok", texto: "Texto padrão de volta na caixa. Salve para gravar." });
    }

    const alterado = valor !== salvo;

    return (
        <section aria-labelledby={idTitulo} className="rounded-xl border bg-card p-4 sm:p-6 space-y-4 bento-enter" style={{ animationDelay: `${150 + atraso * 50}ms` }}>
            <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                    <h2 id={idTitulo} className="text-lg font-semibold text-[#191918] dark:text-white">{titulo}</h2>
                    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold", COR_SELO[selo.tipo])}>
                        {selo.rotulo}
                    </span>
                </div>
                <p className="text-sm text-muted-foreground">{selo.detalhe}</p>
            </div>

            <EditorMensagem
                valor={valor}
                onChange={(v) => { setValor(v); if (aviso?.tipo === "erro") setAviso(null); }}
                placeholders={catalogo}
                rotuloId={idTitulo}
                invalido={aviso?.tipo === "erro"}
            />

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <button
                    type="button"
                    onClick={restaurar}
                    className="h-10 md:h-9 px-3 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6366F1]/50"
                >
                    Restaurar padrão
                </button>
                <span role="status" aria-live="polite" className={cn("text-sm font-medium min-w-0", aviso?.tipo === "erro" ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400")}>
                    {aviso?.texto ?? (alterado ? <span className="text-muted-foreground font-normal">Alterações não salvas.</span> : null)}
                </span>
                <button
                    type="button"
                    onClick={salvar}
                    disabled={salvando || !alterado}
                    className="ml-auto h-10 md:h-9 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6366F1]/50"
                >
                    {salvando ? "Salvando..." : "Salvar"}
                </button>
            </div>
        </section>
    );
}
