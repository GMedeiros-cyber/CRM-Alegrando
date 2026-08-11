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
 * Autentica pela service key do Supabase porque é o único segredo que os dois
 * lados JÁ têm: o n8n a carrega na credencial que usa pra gravar as respostas.
 * Escolher CRON_SECRET obrigaria a copiar mais um segredo pra dentro do n8n, e
 * quem tem a service key já tem acesso total ao banco de qualquer forma — não
 * amplia exposição nenhuma.
 */
export async function POST(req: Request) {
    const esperado = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!esperado) {
        console.error("[anexo-url] SUPABASE_SERVICE_ROLE_KEY não configurada");
        return NextResponse.json({ error: "Servidor mal configurado" }, { status: 500 });
    }

    const recebido = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!recebido || !conferirSegredo(recebido, esperado)) {
        return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

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
