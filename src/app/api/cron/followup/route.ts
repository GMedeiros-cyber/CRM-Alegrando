import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { sendWhatsAppMessage } from "@/lib/whatsapp/sender";
import { getSetting } from "@/lib/actions/settings";
import { applyPlaceholders } from "@/lib/settings_helper";

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

    const supabase = createServerSupabaseClient();
    const googleReviewLink =
        process.env.GOOGLE_REVIEW_LINK || "https://g.page/alegrando";

    // Buscar templates configuráveis
    const [followupTemplate, avaliacaoTemplate] = await Promise.all([
        getSetting("followup_mensagem"),
        getSetting("avaliacao_mensagem"),
    ]);

    // 2. Buscar leads elegíveis
    const { data: leads, error } = await supabase
        .from("Clientes _WhatsApp")
        .select(
            "telefone, nome, ultimo_passeio, followup_dias, followup_enviado, followup_hora"
        )
        .eq("followup_ativo", true)
        .eq("followup_enviado", false)
        .not("ultimo_passeio", "is", null);

    if (error) {
        console.error("[followup] Erro ao buscar leads:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
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

            // Verificar se é a hora certa para este lead
            const followupHora = lead.followup_hora || "09:00";
            const [horaAlvo, minAlvo] = followupHora.split(":").map(Number);
            const agora = new Date();
            const horaAtual = agora.getHours();
            const minAtual = agora.getMinutes();

            // Só enviar se estiver dentro da janela de 59min do horário configurado
            if (Math.abs((horaAtual * 60 + minAtual) - (horaAlvo * 60 + minAlvo)) > 59) {
                continue;
            }

            if (diffDias === 1) {
                const mensagem = applyPlaceholders(avaliacaoTemplate, {
                    nome,
                    link_google: googleReviewLink,
                });

                const result = await sendWhatsAppMessage(telefone, mensagem);

                if (result.success) {
                    avaliacaoEnviadas++;
                    console.log(
                        `[followup] D+1 avaliação enviada para ${telefone}`
                    );

                    // Salvar no histórico de chat
                    await supabase.from("messages").insert({
                        telefone: lead.telefone,
                        sender_type: "humano",
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

            if (diffDias === followupDias) {
                const mensagem = applyPlaceholders(followupTemplate, {
                    nome,
                    link_google: googleReviewLink,
                });

                const result = await sendWhatsAppMessage(telefone, mensagem);

                if (result.success) {
                    followupsEnviados++;
                    console.log(
                        `[followup] D+${followupDias} follow-up enviado para ${telefone}`
                    );

                    // Salvar no histórico de chat
                    await supabase.from("messages").insert({
                        telefone: lead.telefone,
                        sender_type: "humano",
                        sender_name: "Alegrando",
                        content: mensagem,
                    });

                    // Marca como enviado no banco
                    await supabase
                        .from("Clientes _WhatsApp")
                        .update({
                            followup_enviado: true,
                            followup_enviado_em: new Date().toISOString(),
                        })
                        .eq("telefone", lead.telefone);
                } else {
                    erros++;
                    console.error(
                        `[followup] Erro follow-up para ${telefone}: ${result.error}`
                    );
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
