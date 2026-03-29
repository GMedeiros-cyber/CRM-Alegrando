"use client";

import { useState, useEffect, useTransition } from "react";
import { getSetting, updateSetting } from "@/lib/actions/settings";
import { SETTING_DEFAULTS } from "@/lib/settings_helper";

export default function ConfiguracoesPage() {
    const [followupMsg, setFollowupMsg] = useState("");
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState("");
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        async function load() {
            try {
                const followup = await getSetting("followup_mensagem");
                setFollowupMsg(followup);
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
                await updateSetting("followup_mensagem", followupMsg);
                setSaved(true);
                setTimeout(() => setSaved(false), 3000);
            } catch (err) {
                setError(err instanceof Error ? err.message : "Erro ao salvar");
            }
        });
    }

    function handleReset() {
        const defaultValue = SETTING_DEFAULTS.followup_mensagem || "";
        setFollowupMsg(defaultValue);
    }

    return (
        <div className="space-y-8 max-w-4xl">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-white">
                    Configurações
                </h1>
                <p className="text-muted-foreground mt-1">
                    Personalize as mensagens automáticas do CRM.
                </p>
            </div>

            <div className="rounded-xl border bg-card p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-white">
                            Mensagem de Follow-up
                        </h2>
                        <p className="text-sm text-muted-foreground">
                            Enviada automaticamente após o número de dias configurado no lead.
                        </p>
                    </div>
                    <button
                        onClick={handleReset}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors underline"
                    >
                        Restaurar padrão
                    </button>
                </div>
                <textarea
                    value={followupMsg}
                    onChange={(e) => setFollowupMsg(e.target.value)}
                    rows={7}
                    className="w-full rounded-lg border bg-background px-4 py-3 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-primary/50 text-white"
                    placeholder="Mensagem de follow-up..."
                />
            </div>

            <div className="rounded-xl border border-dashed bg-muted/30 p-5">
                <h3 className="text-sm font-semibold mb-2 text-white">
                    Variáveis disponíveis
                </h3>
                <div className="flex flex-wrap gap-3 text-sm">
                    <code className="rounded bg-muted px-2 py-1 font-mono text-xs">
                        {"{{nome}}"}
                    </code>
                    <span className="text-muted-foreground">→ Nome do cliente</span>
                </div>
            </div>

            <div className="flex items-center gap-4">
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
