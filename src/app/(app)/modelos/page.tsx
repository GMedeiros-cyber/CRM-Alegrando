import { lerSetting } from "@/lib/settings-leitura";
import { CHAVES_MENSAGEM, LINK_GOOGLE_PADRAO, type ChaveMensagem } from "@/lib/mensagem-placeholders";
import { ModelosAbas, type Aba } from "@/components/modelos/modelos-abas";
import { infoModelos, type InfoModelos } from "@/lib/modelo-contrato-storage";

/**
 * Modelos: o que sai do CRM com texto pronto — as mensagens automáticas e o
 * contrato. Configurações ficou só com a base de conhecimento (RAG).
 */
export default async function ModelosPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
    const { aba } = await searchParams;
    const textos = Object.fromEntries(
        await Promise.all(CHAVES_MENSAGEM.map(async (c) => [c, await lerSetting(c)] as const)),
    ) as Record<ChaveMensagem, string>;
    // O mesmo valor que o envio usa (cron e envio manual): a prévia mostra o link de verdade.
    const linkGoogle = process.env.GOOGLE_REVIEW_LINK || LINK_GOOGLE_PADRAO;
    // null = não consegui ler o bucket agora (a aba diz isso, e não "nenhum modelo").
    let infoContrato: InfoModelos | null = null;
    try {
        infoContrato = await infoModelos();
    } catch (e) {
        console.error("[modelos]", e instanceof Error ? e.message : e);
    }

    return (
        <div className="space-y-6 max-w-6xl">
            <div className="bento-enter">
                <h1 className="text-2xl font-bold tracking-tight text-[#191918] dark:text-white">Modelos</h1>
                <p className="text-muted-foreground mt-1">Os textos que o CRM manda e o contrato que ele gera.</p>
            </div>
            <ModelosAbas abaInicial={(aba as Aba) ?? "mensagens"} textos={textos} linkGoogle={linkGoogle} infoContrato={infoContrato} />
        </div>
    );
}
