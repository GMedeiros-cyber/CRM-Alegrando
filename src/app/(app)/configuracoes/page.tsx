import Link from "next/link";
import { PasseiosPanel } from "@/components/configuracoes/passeios-panel";

/**
 * Configurações ficou só com a base de conhecimento do assistente (RAG). As
 * mensagens automáticas e o contrato foram para Modelos (19/10/2026).
 */
export default function ConfiguracoesPage() {
    return (
        <div className="space-y-8 max-w-6xl">
            <div className="bento-enter">
                <h1 className="text-2xl font-bold tracking-tight text-[#191918] dark:text-white">
                    Configurações
                </h1>
                <p className="text-muted-foreground mt-1">
                    A base de conhecimento do assistente. As mensagens automáticas e o contrato ficam em{" "}
                    <Link href="/modelos" className="font-medium text-[#4338CA] dark:text-[#c7d2fe] underline underline-offset-2">
                        Modelos
                    </Link>
                    .
                </p>
            </div>

            <PasseiosPanel />
        </div>
    );
}
