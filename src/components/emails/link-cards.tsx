"use client";

import {
    ClipboardList,
    ExternalLink,
    File,
    FileSpreadsheet,
    FileText,
    Folder,
    Link2,
    Presentation,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { LinkDoCorpo, TipoLinkCorpo } from "@/lib/types/email";

const ICONE: Record<TipoLinkCorpo, React.ElementType> = {
    planilha: FileSpreadsheet,
    documento: FileText,
    apresentacao: Presentation,
    formulario: ClipboardList,
    pasta: Folder,
    pdf: FileText,
    arquivo: File,
    link: Link2,
};

// Mesmos tons dos cartões de anexo, pra planilha ser verde nos dois lugares.
const COR: Record<TipoLinkCorpo, string> = {
    planilha: "text-emerald-600 dark:text-emerald-400",
    documento: "text-blue-600 dark:text-blue-400",
    apresentacao: "text-orange-500",
    formulario: "text-violet-600 dark:text-violet-400",
    pasta: "text-amber-600 dark:text-amber-400",
    pdf: "text-red-500",
    arquivo: "text-muted-foreground",
    link: "text-muted-foreground",
};

/** De onde o link vem, na segunda linha do cartão. */
function origem(link: LinkDoCorpo): string {
    if (link.nuvem) return "Google Drive";
    try {
        return new URL(link.url).hostname.replace(/^www\./, "");
    } catch {
        return "link externo";
    }
}

export interface CartoesDeLinkProps {
    links: LinkDoCorpo[];
}

/**
 * Os links que existiam no HTML do corpo, como cartões.
 *
 * Vem de um caso real: um lead respondeu inserindo dois arquivos pelo chip do
 * Drive. Chip do Drive **não é anexo** — é um bloco HTML no corpo, com o `href`
 * na âncora e o título num `<span>` —, e a conversão pra texto guardava o
 * título e jogava o endereço fora. Na tela sobravam duas linhas de texto morto.
 *
 * Parecido com o cartão de anexo de propósito, mas **não igual**: aqui o
 * arquivo não é nosso, mora no Drive de quem mandou e o acesso depende da
 * permissão de lá. Por isso a moldura tem o acento da marca, a seta de "abre
 * fora" fica visível e **não existe "Baixar"** — prometer download de um
 * arquivo que talvez nem abra seria pior que não oferecer.
 *
 * Recebe dado estruturado, montado no servidor: nada que o remetente escreveu
 * vira marcação aqui.
 */
export function CartoesDeLink({ links }: CartoesDeLinkProps) {
    if (links.length === 0) return null;

    return (
        <div className="mt-1 flex flex-wrap gap-1.5">
            {links.map((link) => {
                const Icone = ICONE[link.tipo];
                return (
                    <a
                        key={link.url}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`${link.titulo} — abrir em nova aba`}
                        aria-label={`Abrir ${link.titulo} em nova aba`}
                        // Encolhe até caber e trunca, em vez de largura fixa: o
                        // mesmo cartão aparece na coluna de 300px do desktop e
                        // no Sheet de 320px do mobile.
                        className={cn(
                            "group/link flex max-w-full min-h-[36px] items-center gap-2 rounded-lg",
                            "border border-brand-500/30 bg-brand-500/5 px-2 py-1.5",
                            "transition-colors hover:border-brand-500/60 hover:bg-brand-500/10",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50",
                        )}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <Icone className={cn("h-4 w-4 shrink-0", COR[link.tipo])} />

                        <span className="min-w-0">
                            <span className="block max-w-[180px] truncate text-[11px] font-medium text-foreground">
                                {link.titulo}
                            </span>
                            <span className="block text-[9px] text-muted-foreground">
                                {origem(link)}
                            </span>
                        </span>

                        <ExternalLink className="ml-auto h-3 w-3 shrink-0 text-brand-500/70 dark:text-brand-400/70" />
                    </a>
                );
            })}
        </div>
    );
}
