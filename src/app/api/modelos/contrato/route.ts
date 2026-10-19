import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { contentDisposition } from "@/lib/content-disposition";
import { DOCX_MIME, lerModelo } from "@/lib/modelo-contrato-storage";

/**
 * Baixa o modelo de contrato (`?versao=anterior` para o anterior), para a
 * equipe editar no Word e enviar de novo. Bucket privado: só passa por aqui.
 * Fora da lista pública do `src/proxy.ts` — o Clerk protege; a conferência
 * abaixo é o segundo cadeado.
 */
export const maxDuration = 60;

export async function GET(req: Request) {
    const { userId } = await auth();
    if (!userId) return texto("Não autorizado.", 401);
    const versao = new URL(req.url).searchParams.get("versao") === "anterior" ? "anterior" : "atual";
    const bytes = await lerModelo(versao);
    if (!bytes) return texto(versao === "atual" ? "Nenhum modelo de contrato foi enviado ainda." : "Não há versão anterior guardada.", 404);
    return new NextResponse(new Uint8Array(bytes), {
        headers: {
            "Content-Type": DOCX_MIME,
            "Content-Disposition": contentDisposition(`Modelo de contrato (${versao}).docx`),
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    });
}

function texto(mensagem: string, status: number) {
    return new NextResponse(mensagem, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
