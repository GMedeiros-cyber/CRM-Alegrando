/**
 * Envio do follow-up: RESERVA o lead, envia, e desfaz a reserva se o envio
 * falhar.
 *
 * Antes marcava `followup_enviado` DEPOIS de enviar. Com a tolerância de 7
 * dias (lib/followup-regra.ts), se essa marca falhasse o lead continuava
 * elegível no dia seguinte, e a trava de 23h não segura uma mensagem de 24h:
 * reenvio. Marcando antes, o pior caso passa a ser um lead SEM mensagem (a
 * reserva ficou e o envio não saiu), nunca mensagem repetida. De quebra, duas
 * execuções simultâneas não mandam em dobro: só uma ganha o `UPDATE`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { telefoneMascarado } from "./log-redact";

export type LeadFollowup = {
    id: string;
    telefone: string | number;
    followup_enviado: boolean;
    followup_enviado_em: string | null;
};

export type ResultadoEnvio = "enviado" | "ja-reservado" | "erro";

const TABELA = "Clientes _WhatsApp";

export async function enviarFollowupComReserva(
    db: SupabaseClient,
    lead: LeadFollowup,
    mensagem: string,
    enviar: () => Promise<{ success: boolean; error?: string }>,
): Promise<ResultadoEnvio> {
    const quem = `lead ${lead.id} (${telefoneMascarado(String(lead.telefone))})`;

    // 1. Reserva atômica: só marca se ainda não estiver marcado. Medido em
    //    13/10/2026: nenhum `followup_enviado` NULL no banco (392 false, 4
    //    true), e a consulta da rota também filtra `= false` — por isso o
    //    filtro aqui é o mesmo, e não `IS NULL OR false`.
    const { data: reservado, error: errReserva } = await db
        .from(TABELA)
        .update({ followup_enviado: true, followup_enviado_em: new Date().toISOString() })
        .eq("id", lead.id)
        .eq("followup_enviado", false)
        .select("id");
    if (errReserva) {
        console.error(`[followup] Reserva falhou para ${quem}, nada enviado: ${errReserva.message}`);
        return "erro";
    }
    if (!reservado?.length) return "ja-reservado"; // outra execução pegou, ou já foi

    // 2. Envio. Exceção conta como falha.
    let resultado: { success: boolean; error?: string };
    try {
        resultado = await enviar();
    } catch (err) {
        resultado = { success: false, error: String(err) };
    }

    // 3. Falhou: devolve o lead ao estado de antes, para a próxima execução.
    if (!resultado.success) {
        console.error(`[followup] Envio do follow-up falhou para ${quem}: ${resultado.error}`);
        try {
            const { data: desfeito, error: errDesfaz } = await db
                .from(TABELA)
                .update({ followup_enviado: lead.followup_enviado, followup_enviado_em: lead.followup_enviado_em })
                .eq("id", lead.id)
                .select("id");
            if (errDesfaz || !desfeito?.length) throw new Error(errDesfaz?.message ?? "0 linhas");
        } catch (err) {
            // Pior caso aceito: o lead fica reservado e sem mensagem.
            console.error(`[followup] Reserva NÃO desfeita para ${quem} — fica sem follow-up até alguém desmarcar: ${err instanceof Error ? err.message : err}`);
        }
        return "erro";
    }

    // 4. Saiu. A reserva fica mesmo que o histórico não grave.
    const { error: errMsg } = await db.from("messages").insert({
        telefone: lead.telefone,
        canal: "alegrando",
        sender_type: "equipe",
        sender_name: "Alegrando",
        content: mensagem,
    });
    if (errMsg) {
        console.error(`[followup] Follow-up ENVIADO para ${quem}, mas não gravado em messages: ${errMsg.message}`);
    }
    return "enviado";
}
