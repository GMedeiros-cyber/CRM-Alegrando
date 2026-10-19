import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { contentDisposition } from "@/lib/content-disposition";
import { dadosDoContrato, gerarContratoDocx, nomeArquivoContrato } from "@/lib/contrato-docx";
import { DOCX_MIME, lerModelo } from "@/lib/modelo-contrato-storage";

/**
 * Gera o contrato em Word de UMA linha de `contratos`, na hora, a partir do
 * modelo atual. O arquivo não é guardado em lugar nenhum.
 *
 * Fora da lista pública do `src/proxy.ts`: quem chama é a pessoa logada, então
 * o Clerk protege; a conferência abaixo é o segundo cadeado. Nenhum dado de
 * lead vai para o log — só o id do contrato.
 */
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const numero = (v: string | number | null) => (v === null || v === undefined ? null : Number(v));

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
    const { userId } = await auth();
    if (!userId) return texto("Não autorizado.", 401);
    const { id } = await ctx.params;
    if (!UUID.test(id)) return texto("Contrato inválido.", 400);

    const db = createServerSupabaseClient();
    const { data: c } = await db
        .from("contratos")
        .select("lead_id, data_passeio, destino, qtd_alunos, qtd_professores, valor_por_aluno, valor_total, forma_pagamento, observacoes")
        .eq("id", id)
        .maybeSingle();
    if (!c) return texto("Contrato não encontrado.", 404);
    const { data: lead } = await db
        .from("Clientes _WhatsApp")
        .select("nome, cnpj, endereco, responsavel, diretora_nome, coordenadora_nome")
        .eq("id", c.lead_id)
        .maybeSingle();
    if (!lead) return texto("O lead deste contrato não foi encontrado.", 404);

    const modelo = await lerModelo("atual");
    if (!modelo) return texto("Nenhum modelo de contrato foi enviado ainda. Envie em Modelos › Contrato.", 409);

    let docx: Buffer;
    try {
        docx = gerarContratoDocx(modelo, dadosDoContrato(lead, {
            ...c,
            valor_por_aluno: numero(c.valor_por_aluno),
            valor_total: numero(c.valor_total),
        }, new Date()));
    } catch {
        console.error(`[contrato-docx] falha ao gerar o contrato ${id}`);
        return texto("O modelo de contrato tem um problema. Envie uma versão corrigida em Modelos › Contrato.", 500);
    }

    return new NextResponse(new Uint8Array(docx), {
        headers: {
            "Content-Type": DOCX_MIME,
            "Content-Disposition": contentDisposition(nomeArquivoContrato(lead.nome, c.data_passeio)),
            // Contrato é dado de lead: nada de cache compartilhado.
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    });
}

function texto(mensagem: string, status: number) {
    return new NextResponse(mensagem, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
