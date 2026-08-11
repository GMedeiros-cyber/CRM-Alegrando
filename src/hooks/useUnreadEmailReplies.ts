"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { countUnreadEmailReplies } from "@/lib/actions/emails";

/**
 * Quantas respostas de e-mail ainda não foram lidas.
 *
 * Recontar no servidor a cada evento — em vez de somar/subtrair no cliente —
 * é de propósito: a contagem é `head: true` (só o cabeçalho, sem linhas) e o
 * volume de respostas é baixo, então o custo é irrisório perto de manter um
 * contador que dessincroniza quando duas abas marcam a mesma como lida.
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
        const channel = supabase
            .channel("email-replies-badge")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "email_replies" },
                () => refresh(),
            )
            .subscribe();

        return () => { void supabase.removeChannel(channel); };
    }, [refresh]);

    return count;
}
