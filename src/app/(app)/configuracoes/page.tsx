"use client";

import { useState, useEffect, useTransition } from "react";
import { getSetting, updateSetting } from "@/lib/actions/settings";
import { SETTING_DEFAULTS } from "@/lib/settings_helper";

const POS_PASSEIO_DEFAULT =
    "Olá {nome}! 🎉 Foi um prazer ter você no passeio! Caso queira ver as fotos ou deixar uma avaliação, o link está aqui: {link}";

export default function ConfiguracoesPage() {
    const [followupMsg, setFollowupMsg] = useState("");
    const [posPasseioMsg, setPosPasseioMsg] = useState("");
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState("");
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        async function load() {
            try {
                const [followup, posPasseio] = await Promise.all([
                    getSetting("followup_mensagem"),
                    getSetting("pos_passeio_mensagem"),
                ]);
                setFollowupMsg(followup);
                setPosPasseioMsg(posPasseio || POS_PASSEIO_DEFAULT);
            } catch (err) {
                setError(err instanceof Error ? err.message : "Erro ao carregar configurações");
            }
        }

        load();
    }, []);

    function handleSave() {
        setSaved(false);
        setError("");

        startTransition(async () => {
            try {
                await Promise.all([
                    updateSetting("followup_mensagem", followupMsg),
                    updateSetting("pos_passeio_mensagem", posPasseioMsg),
                ]);
                setSaved(true);
                setTimeout(() => setSaved(false), 3000);
            } catch (err) {
                setError(err instanceof Error ? err.message : "Erro ao salvar");
            }
        });
    }

    function handleResetFollowup() {
        const defaultValue = SETTING_DEFAULTS.followup_mensagem || "";
        setFollowupMsg(defaultValue);
    }

    function handleResetPosPasseio() {
        setPosPasseioMsg(POS_PASSEIO_DEFAULT);
    }

    return (
        <div className="space-y-8 max-w-4xl">
            <div className="bento-enter">
                <h1 className="text-2xl font-bold tracking-tight text-[#191918]">
                    Configurações
                </h1>
                <p className="text-muted-foreground mt-1">
                    Personalize as mensagens automáticas do CRM.
                </p>
            </div>

            {/* Bloco Follow-up */}
            <div className="rounded-xl border bg-card p-6 space-y-4 bento-enter [animation-delay:150ms]">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-[#191918]">
                            Mensagem de Follow-up
                        </h2>
                        <p className="text-sm text-muted-foreground">
                            Enviada automaticamente após o número de dias configurado no lead.
                        </p>
                    </div>
                    <button
                        onClick={handleResetFollowup}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors underline"
                    >
                        Restaurar padrão
                    </button>
                </div>
                <textarea
                    value={followupMsg}
                    onChange={(e) => setFollowupMsg(e.target.value)}
                    rows={7}
                    className="w-full rounded-lg border border-[#C7D2FE] bg-[#F0F4FF] px-4 py-3 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-[#6366F1]/50 text-[#191918] font-medium placeholder:text-[#9B9A97]"
                    placeholder="Mensagem de follow-up..."
                />
            </div>

            <div className="rounded-xl border border-dashed bg-muted/30 p-5 bento-enter [animation-delay:200ms]">
                <h3 className="text-sm font-semibold mb-2 text-[#191918]">
                    Variáveis disponíveis
                </h3>
                <div className="flex flex-wrap gap-3 text-sm">
                    <code className="rounded bg-muted px-2 py-1 font-mono text-xs">
                        {"{{nome}}"}
                    </code>
                    <span className="text-muted-foreground">→ Nome do cliente</span>
                </div>
            </div>

            {/* Bloco Pós-Passeio */}
            <div className="rounded-xl border bg-card p-6 space-y-4 bento-enter [animation-delay:250ms]">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-[#191918]">
                            Mensagem de Pós-Passeio
                        </h2>
                        <p className="text-sm text-muted-foreground">
                            Enviada manualmente após cada passeio. Escreva o texto livremente — inclua o link das fotos ou de avaliação diretamente no texto onde quiser.
                        </p>
                    </div>
                    <button
                        onClick={handleResetPosPasseio}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors underline"
                    >
                        Restaurar padrão
                    </button>
                </div>
                <textarea
                    value={posPasseioMsg}
                    onChange={(e) => setPosPasseioMsg(e.target.value)}
                    rows={7}
                    className="w-full rounded-lg border border-[#C7D2FE] bg-[#F0F4FF] px-4 py-3 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-[#6366F1]/50 text-[#191918] font-medium placeholder:text-[#9B9A97]"
                    placeholder="Mensagem de pós-passeio..."
                />
            </div>

            <div className="rounded-xl border border-dashed bg-muted/30 p-5 bento-enter [animation-delay:300ms]">
                <h3 className="text-sm font-semibold mb-2 text-[#191918]">
                    Variáveis disponíveis
                </h3>
                <div className="flex flex-wrap gap-3 text-sm">
                    <div className="flex items-center gap-1.5">
                        <code className="rounded bg-muted px-2 py-1 font-mono text-xs">
                            {"{nome}"}
                        </code>
                        <span className="text-muted-foreground">→ Nome do cliente</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <code className="rounded bg-muted px-2 py-1 font-mono text-xs">
                            {"{link}"}
                        </code>
                        <span className="text-muted-foreground">→ Link que será colado na hora do envio (fotos, Drive, avaliação etc.)</span>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-4 bento-enter [animation-delay:350ms]">
                <button
                    onClick={handleSave}
                    disabled={isPending}
                    className="rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                    {isPending ? "Salvando..." : "Salvar alterações"}
                </button>
                {saved && (
                    <span className="text-sm text-green-600 font-medium animate-in fade-in">
                        Salvo com sucesso!
                    </span>
                )}
                {error && (
                    <span className="text-sm text-red-600 font-medium">
                        {error}
                    </span>
                )}
            </div>
        </div>
    );
}
