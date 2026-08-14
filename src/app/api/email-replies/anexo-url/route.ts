import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { presignedPutUrl, r2PublicUrl } from "@/lib/whatsapp/r2-client";
import { motivoRecusa } from "@/lib/email/attachments";

/** Comparação de tamanho constante, pra não vazar o segredo por tempo. */
function conferirSegredo(recebido: string, esperado: string): boolean {
    const a = Buffer.from(recebido);
    const b = Buffer.from(esperado);
    return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * URL assinada pro worker do n8n subir um anexo de resposta direto no R2.
 *
 * Existe porque só o n8n tem a credencial do Gmail (é ele quem consegue baixar
 * o anexo) e só o CRM tem a do R2. Em vez de duplicar segredo de um lado ou do
 * outro, o n8n pede a URL aqui e faz o PUT sozinho.
 *
 * O PUT vai direto pro R2, e não por esta rota, porque um anexo de escola pode
 * ter vários MB — o corpo de uma route handler na Vercel para em 4,5MB. É o
 * mesmo motivo pelo qual o envio já usa URL assinada.
 *
 * AUTENTICAÇÃO — migração em duas fases, em andamento.
 *
 * Historicamente esta rota conferia o bearer contra a própria
 * `SUPABASE_SERVICE_ROLE_KEY`, porque era o único segredo que os dois lados já
 * tinham. Funciona, mas o raio de estrago é péssimo: para pedir uma URL de
 * upload, o n8n precisa guardar a chave que lê, escreve e apaga o banco inteiro.
 * Se ela vazar de um log ou de um histórico de execução, o prêmio é o banco.
 *
 * **Fase A (aqui):** aceita `ANEXO_URL_SECRET` **ou** a service key. Nada quebra
 * enquanto o n8n ainda manda a chave antiga. Fase única abriria uma janela em
 * que anexo de resposta falha CALADO — a classe de bug mais cara deste projeto.
 *
 * **Fase B:** remover a aceitação da service key. O gatilho para avançar não é
 * palpite: o log abaixo diz qual credencial cada chamada usou, então dá para
 * confirmar que o n8n já migrou antes de cortar.
 */
export async function POST(req: Request) {
    const dedicado = process.env.ANEXO_URL_SECRET;
    const servico = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!dedicado && !servico) {
        console.error("[anexo-url] nenhum segredo configurado (ANEXO_URL_SECRET ou SUPABASE_SERVICE_ROLE_KEY)");
        return NextResponse.json({ error: "Servidor mal configurado" }, { status: 500 });
    }

    const recebido = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");

    // Sem curto-circuito: as duas comparações rodam sempre, em tempo constante.
    const bateDedicado = Boolean(dedicado) && conferirSegredo(recebido, dedicado!);
    const bateServico = Boolean(servico) && conferirSegredo(recebido, servico!);

    if (!recebido || (!bateDedicado && !bateServico)) {
        return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    // É este log que autoriza a Fase B: enquanto aparecer "service-key", o n8n
    // ainda não migrou e cortar o antigo quebraria a ingestão de anexo.
    console.log(`[anexo-url] autenticado por: ${bateDedicado ? "segredo-dedicado" : "service-key"}`);

    let corpo: { filename?: unknown; mimeType?: unknown; size?: unknown };
    try {
        corpo = await req.json();
    } catch {
        return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }

    const filename = typeof corpo.filename === "string" ? corpo.filename.trim() : "";
    const mimeType =
        typeof corpo.mimeType === "string" && corpo.mimeType
            ? corpo.mimeType
            : "application/octet-stream";
    const size = Number(corpo.size) || 0;

    if (!filename) {
        return NextResponse.json({ error: "filename é obrigatório" }, { status: 400 });
    }

    // Mesmas regras do envio: o que o Gmail recusaria mandar, não guardamos.
    const recusa = motivoRecusa({ name: filename, size });
    if (recusa) {
        return NextResponse.json({ error: recusa }, { status: 422 });
    }

    const safeName = filename.replace(/[^0-9A-Za-z._-]/g, "_").slice(-120);
    const path = `email-anexos/resposta-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;

    try {
        const signedUrl = await presignedPutUrl(path, mimeType);
        return NextResponse.json({ signedUrl, publicUrl: r2PublicUrl(path) });
    } catch (err) {
        console.error("[anexo-url]", err);
        return NextResponse.json({ error: "Falha ao preparar o upload." }, { status: 500 });
    }
}
