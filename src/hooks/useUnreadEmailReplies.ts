"use client";

import { useCallback, useEffect, useState } from "react";
import { countUnreadEmailReplies } from "@/lib/actions/emails";

/**
 * De quanto em quanto tempo o contador se refaz.
 *
 * Um minuto porque o worker que traz as respostas roda de 5 em 5 minutos —
 * esse é o piso real de frescor do dado, e recontar mais rápido não mostraria
 * nada mais novo.
 */
const INTERVALO_MS = 60_000;

/**
 * Quantas respostas de e-mail ainda não foram lidas.
 *
 * Não usa Realtime de propósito. O navegador fala com o Supabase pela chave
 * anon, e `email_replies` só libera leitura pra `authenticated` (a sessão é do
 * Clerk, não do Supabase) — então o Postgres filtra o evento antes de mandar e
 * a assinatura nunca dispara. Abrir a tabela pro `anon` faria o Realtime
 * funcionar e exporia o conteúdo de todos os e-mails, porque essa chave vai no
 * pacote que o navegador baixa.
 *
 * A contagem é `head: true` (só o cabeçalho, sem trazer linha), então repetir
 * de minuto em minuto custa praticamente nada.
 */
export function useUnreadEmailReplies(): number {
    const [count, setCount] = useState(0);

    const refresh = useCallback(() => {
        countUnreadEmailReplies()
            .then(setCount)
            .catch(() => {
                // Badge é informação secundária: falha aqui não merece ruído
                // na tela nem derrubar o menu.
            });
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    useEffect(() => {
        const timer = setInterval(() => {
            if (document.visibilityState === "visible") refresh();
        }, INTERVALO_MS);

        const aoVoltar = () => {
            if (document.visibilityState === "visible") refresh();
        };
        document.addEventListener("visibilitychange", aoVoltar);

        return () => {
            clearInterval(timer);
            document.removeEventListener("visibilitychange", aoVoltar);
        };
    }, [refresh]);

    return count;
}
