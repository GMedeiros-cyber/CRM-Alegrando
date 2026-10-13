import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { sendWhatsAppMessage } from "@/lib/whatsapp/sender";
import { getSetting } from "@/lib/actions/settings";
import { applyPlaceholders } from "@/lib/settings_helper";
import { telefoneMascarado } from "@/lib/log-redact";
import { dentroDaJanelaFollowup } from "@/lib/hora-sao-paulo";
import { enviaAvaliacao, enviaFollowup } from "@/lib/followup-regra";
import { enviarFollowupComReserva } from "@/lib/followup-envio";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A equipe já falou com este lead nas últimas 23h?
 *
 * Trava contra mandar automático em cima de conversa humana. Procurava
 * `sender_type = 'humano'`, valor que o banco quase não tem (35 linhas, a
 * última de 09/09) — os reais são 'cliente' e 'equipe'. Na prática a trava
 * só enxergava as mensagens que o próprio cron havia gravado, e nunca as da
 * equipe: exatamente o caso que ela existe para impedir.
 */
async function equipeFalouRecentemente(
    supabase: SupabaseClient,
    telefone: string | number,
): Promise<boolean> {
    const desde = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
        .from("messages")
        .select("id")
        .eq("telefone", telefone)
        .eq("canal", "alegrando")
        .eq("sender_type", "equipe")
        .gte("created_at", desde)
        .limit(1)
        .maybeSingle();
    return !!data;
}

export async function POST(req: Request) {
    // 1. Validar token
    const authHeader = req.headers.get("authorization");
    const expectedToken = process.env.CRON_SECRET;

    if (!expectedToken) {
        console.error("[followup] CRON_SECRET não configurado");
        return NextResponse.json(
            { error: "CRON_SECRET não configurado" },
            { status: 500 }
        );
    }

    if (authHeader !== `Bearer ${expectedToken}`) {
        return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    // Defesa em profundidade: se o trigger veio do Vercel Cron, valida o header
    // adicional. Em produção sempre tem; em dev/manual fica ausente — não exige.
    const isVercelProd = process.env.VERCEL_ENV === "production";
    const hasVercelCronHeader = req.headers.get("x-vercel-cron") !== null;
    if (isVercelProd && !hasVercelCronHeader) {
        console.warn("[followup] Em prod sem header x-vercel-cron — possível trigger manual");
    }

    const supabase = createServerSupabaseClient();
    const googleReviewLink =
        process.env.GOOGLE_REVIEW_LINK || "https://g.page/alegrando";

    // Buscar templates configuráveis
    const [followupTemplate, avaliacaoTemplate] = await Promise.all([
        getSetting("followup_mensagem"),
        getSetting("avaliacao_mensagem"),
    ]);

    // 2. Buscar leads elegíveis (followup só existe no canal alegrando)
    const { data: leads, error } = await supabase
        .from("Clientes _WhatsApp")
        .select(
            "id, telefone, nome, ultimo_passeio, followup_dias, followup_enviado, followup_enviado_em, followup_hora"
        )
        .eq("canal", "alegrando")
        .eq("followup_ativo", true)
        .eq("followup_enviado", false)
        .not("ultimo_passeio", "is", null);

    if (error) {
        console.error("[followup] Erro ao buscar leads:", error.message);
        return NextResponse.json({ error: "Falha ao buscar leads" }, { status: 500 });
    }

    if (!leads || leads.length === 0) {
        return NextResponse.json({
            success: true,
            processed: 0,
            message: "Nenhum lead elegível",
        });
    }

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    let avaliacaoEnviadas = 0;
    let followupsEnviados = 0;
    let erros = 0;

    for (const lead of leads) {
        try {
            const telefone = String(lead.telefone);
            const nome = lead.nome || "Olá";
            const ultimoPasseio = new Date(lead.ultimo_passeio);
            ultimoPasseio.setHours(0, 0, 0, 0);

            const diffMs = hoje.getTime() - ultimoPasseio.getTime();
            const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            const followupDias = lead.followup_dias ?? 45;

            // Hora certa para este lead? `followup_hora` é horário de Brasília,
            // e a comparação também — antes era a hora do runtime (UTC na
            // Vercel) e nada saía. Ver lib/hora-sao-paulo.ts.
            if (!dentroDaJanelaFollowup(lead.followup_hora || "09:00", new Date())) {
                continue;
            }

            if (enviaAvaliacao(diffDias)) {
                // Idempotência: se já houve mensagem da equipe pra esse lead
                // nas últimas 23h, pulamos. Cobre o re-disparo do cron (a
                // Vercel retenta em falha de rede) e a conversa humana em
                // andamento.
                if (await equipeFalouRecentemente(supabase, lead.telefone)) {
                    console.log(`[followup] D+1 skip dedup para ${telefoneMascarado(telefone)} — equipe falou nas últimas 23h`);
                    continue;
                }

                const mensagem = applyPlaceholders(avaliacaoTemplate, {
                    nome,
                    link_google: googleReviewLink,
                });

                const result = await sendWhatsAppMessage(telefone, mensagem);

                if (result.success) {
                    avaliacaoEnviadas++;
                    console.log(
                        `[followup] D+1 avaliação enviada para ${telefoneMascarado(telefone)}`
                    );

                    // Salvar no histórico de chat (cron só atende canal alegrando)
                    await supabase.from("messages").insert({
                        telefone: lead.telefone,
                        canal: "alegrando",
                        sender_type: "equipe",
                        sender_name: "Alegrando",
                        content: mensagem,
                    });
                } else {
                    erros++;
                    console.error(
                        `[followup] Erro D+1 para ${telefone}: ${result.error}`
                    );
                }
            }

            // Do vencimento até 7 dias depois, se ainda não foi — ver lib/followup-regra.ts.
            if (enviaFollowup(diffDias, followupDias, lead.followup_enviado)) {
                // O mesmo guard do D+1: antes este ramo não tinha nenhum, e o
                // follow-up saía em cima de conversa que a equipe acabara de ter.
                if (await equipeFalouRecentemente(supabase, lead.telefone)) {
                    console.log(`[followup] D+${followupDias} skip dedup para ${telefoneMascarado(telefone)} — equipe falou nas últimas 23h`);
                    continue;
                }

                const mensagem = applyPlaceholders(followupTemplate, {
                    nome,
                    link_google: googleReviewLink,
                });

                // Reserva → envia → desfaz se falhar: ver lib/followup-envio.ts.
                const resultado = await enviarFollowupComReserva(
                    supabase,
                    lead,
                    mensagem,
                    () => sendWhatsAppMessage(telefone, mensagem),
                );
                if (resultado === "enviado") {
                    followupsEnviados++;
                    console.log(`[followup] D+${diffDias} follow-up enviado para ${telefoneMascarado(telefone)} (vencia D+${followupDias})`);
                } else if (resultado === "ja-reservado") {
                    console.log(`[followup] Follow-up de ${telefoneMascarado(telefone)} já reservado por outra execução — pulando`);
                } else {
                    erros++;
                }
            }
        } catch (err) {
            erros++;
            console.error(
                `[followup] Erro inesperado no lead ${lead.telefone}:`,
                err
            );
        }
    }

    const resumo = {
        success: true,
        leadsAnalisados: leads.length,
        avaliacaoEnviadas,
        followupsEnviados,
        erros,
    };

    console.log("[followup] Resumo:", resumo);
    return NextResponse.json(resumo);
}
