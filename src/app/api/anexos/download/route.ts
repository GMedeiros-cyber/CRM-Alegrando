import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Baixa um anexo do R2 forçando o "salvar como".
 *
 * Existe por um detalhe do HTML que não dá pra contornar no cliente: o atributo
 * `download` de uma âncora é IGNORADO quando a URL é de outra origem. Os anexos
 * moram no bucket público do R2 (`pub-….r2.dev`), então `<a download>` apontado
 * direto pra lá só abriria o arquivo em outra aba — um botão "Baixar" que não
 * baixa. Passando por aqui a URL vira same-origin e quem manda no comportamento
 * é o `Content-Disposition` que devolvemos.
 *
 * Por que proxy e não URL assinada com `response-content-disposition`: a
 * assinatura de GET exigiria que a credencial do R2 tivesse permissão de
 * LEITURA, e o projeto só usa (e só comprova) a de escrita — `objectExistsInR2`
 * inclusive trata 403 de token write-only como caso esperado. O proxy usa a URL
 * pública, a mesma que o `<img>` da miniatura já carrega: nenhuma credencial
 * nova no caminho.
 *
 * NÃO está na lista de rotas públicas do `src/proxy.ts` de propósito: quem chama
 * é a pessoa logada, então o Clerk já protege. A conferência abaixo é o segundo
 * cadeado.
 */

// Sem barra no final, igual ao `r2-client.ts`.
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL ?? "").replace(/\/+$/, "");

/**
 * Storage público do projeto Supabase ANTIGO (`mtzlpogvcyhhjaagmlxn`).
 *
 * A mídia do WhatsApp só passou a subir pro R2 em 23/07/2026; tudo que entrou
 * antes disso mora aqui e continua sendo servido — o projeto velho segue de pé.
 * Medido no banco: das 159 imagens do chat, **69 ainda apontam pra cá**. Sem
 * esta segunda base, o botão "Baixar" erraria em quase metade das imagens da
 * conversa, e só se descobriria clicando numa mensagem antiga.
 *
 * Constante e não variável de ambiente de propósito: é um fato histórico do
 * acervo, não configuração — não existe cenário em que este endereço mude. E
 * não é segredo: está no `content` de centenas de linhas de `messages` e num
 * bucket público.
 *
 * O prefixo de caminho é parte da chave: `/storage/v1/object/public/` limita a
 * rota ao que já é público. Sem ele, a allowlist liberaria a API inteira do
 * projeto antigo pra qualquer caminho.
 */
const STORAGE_LEGADO = "https://mtzlpogvcyhhjaagmlxn.supabase.co/storage/v1/object/public/";

/**
 * Origens que a rota aceita buscar, com o prefixo de caminho exigido em cada
 * uma. Lista, e não string única, porque o acervo tem duas casas (ver acima).
 */
function basesPermitidas(): URL[] {
    const bases: URL[] = [];
    // Barra no fim é obrigatória: é ela que faz o `startsWith` do pathname
    // comparar um segmento inteiro.
    if (R2_PUBLIC_URL) bases.push(new URL(`${R2_PUBLIC_URL}/`));
    bases.push(new URL(STORAGE_LEGADO));
    return bases;
}

/** Erro em texto puro: esta resposta é lida por gente, numa aba do navegador. */
function erro(mensagem: string, status: number) {
    return new NextResponse(mensagem, {
        status,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
}

/**
 * `Content-Disposition` com nome de arquivo acentuado.
 *
 * Dois campos de propósito (RFC 6266/5987): `filename` em ASCII puro pro
 * navegador antigo e `filename*` percent-encoded pro nome de verdade — sem ele,
 * "Proposta Excursão.pdf" chega como "Proposta Excurso.pdf". O encode também é
 * o que impede injeção de cabeçalho por nome com quebra de linha.
 */
function contentDisposition(nome: string): string {
    const ascii = nome.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
    return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nome)}`;
}

export async function GET(req: Request) {
    const { userId } = await auth();
    if (!userId) return erro("Não autorizado.", 401);

    const params = new URL(req.url).searchParams;
    const alvo = (params.get("url") ?? "").trim();
    const nome = (params.get("nome") ?? "").trim().slice(0, 200) || "anexo";

    if (!alvo) return erro("Falta o endereço do anexo.", 400);

    // Allowlist de host: sem isto a rota vira um proxy pra qualquer endereço,
    // inclusive a rede interna da Vercel (SSRF). Compara origem E prefixo de
    // caminho, e não `startsWith` na string crua — `…r2.dev.outrodominio.com`
    // passaria por uma comparação ingênua.
    let destino: URL;
    try {
        destino = new URL(alvo);
    } catch {
        return erro("Endereço de anexo inválido.", 400);
    }
    const permitido = basesPermitidas().some(
        (base) => destino.origin === base.origin && destino.pathname.startsWith(base.pathname),
    );
    if (!permitido) {
        // `r2_configurado` no log separa "endereço realmente estranho" de
        // "R2_PUBLIC_URL faltando no ambiente" — que produzem a mesma recusa e
        // exigem correções opostas.
        console.warn(
            `[anexo-download] recusado: fora da allowlist (${destino.origin}) | r2_configurado=${Boolean(R2_PUBLIC_URL)}`,
        );
        return erro("Este anexo não está num endereço que o CRM possa baixar.", 400);
    }

    let upstream: Response;
    try {
        upstream = await fetch(destino, { cache: "no-store" });
    } catch (err) {
        console.error("[anexo-download] falha de rede ao buscar no R2:", err);
        return erro("Não foi possível alcançar o arquivo agora. Tente de novo.", 502);
    }

    if (!upstream.ok || !upstream.body) {
        // Sem este log, "o botão de baixar não faz nada" fica indistinguível de
        // arquivo apagado, bucket errado e queda do R2.
        console.error(`[anexo-download] R2 respondeu ${upstream.status} em ${destino.pathname}`);
        return erro(
            upstream.status === 404
                ? "Este anexo não está mais disponível."
                : "Não foi possível baixar este anexo agora. Tente de novo em instantes.",
            upstream.status === 404 ? 404 : 502,
        );
    }

    const headers = new Headers({
        "Content-Type": upstream.headers.get("content-type") || "application/octet-stream",
        "Content-Disposition": contentDisposition(nome),
        // Anexo é dado de lead: não pode ficar em cache compartilhado.
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
    });
    const tamanho = upstream.headers.get("content-length");
    if (tamanho) headers.set("Content-Length", tamanho);

    // Repassa o corpo em streaming: um anexo pode ter até 25 MB (o teto do
    // Gmail) e bufferizar isso na função estouraria o limite de resposta.
    return new NextResponse(upstream.body, { status: 200, headers });
}
