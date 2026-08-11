"use client";

import {
    AlertTriangle,
    File,
    FileArchive,
    FileSpreadsheet,
    FileText,
    Loader2,
    Presentation,
    X,
} from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
    MAX_TOTAL_BYTES,
    WARN_BYTES,
    classificar,
    formatarBytes,
    type TipoAnexo,
} from "@/lib/email/attachments";
import type { EmailAttachment } from "@/lib/types/email";

const ICONE: Record<Exclude<TipoAnexo, "imagem">, React.ElementType> = {
    pdf: FileText,
    planilha: FileSpreadsheet,
    documento: FileText,
    apresentacao: Presentation,
    compactado: FileArchive,
    texto: FileText,
    outro: File,
};

const COR: Record<Exclude<TipoAnexo, "imagem">, string> = {
    pdf: "text-red-500",
    planilha: "text-emerald-600 dark:text-emerald-400",
    documento: "text-blue-600 dark:text-blue-400",
    apresentacao: "text-orange-500",
    compactado: "text-amber-600 dark:text-amber-400",
    texto: "text-muted-foreground",
    outro: "text-muted-foreground",
};

export interface AttachmentTrayProps {
    attachments: EmailAttachment[];
    /** Arquivos ainda subindo, pra aparecerem antes de existir URL. */
    uploading: { id: string; name: string; size: number }[];
    onRemove: (url: string) => void;
    /**
     * Anexo já enviado ou recebido: sem remover e sem o "X de 25 MB".
     * O teto só faz sentido enquanto se está montando a mensagem.
     */
    somenteLeitura?: boolean;
}

/**
 * Imagem ampliada pra conferir se foi a foto certa que entrou.
 *
 * Dialog do Radix ANINHADO no da composição, de propósito: ele entra na pilha
 * de camadas, então fechar aqui fecha só o lightbox — e não a composição
 * junto, que é o que aconteceria com um portal solto no body.
 */
function Lightbox({
    preview,
    onClose,
}: {
    preview: { url: string; name: string } | null;
    onClose: () => void;
}) {
    return (
        <Dialog open={preview !== null} onOpenChange={(aberto) => { if (!aberto) onClose(); }}>
            <DialogContent className="sm:max-w-3xl bg-transparent border-0 shadow-none p-0">
                <DialogTitle className="sr-only">{preview?.name ?? "Anexo"}</DialogTitle>
                {preview && (
                    <div className="flex flex-col items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={preview.url}
                            alt={preview.name}
                            className="max-h-[75vh] w-auto max-w-full rounded-lg object-contain shadow-2xl"
                        />
                        <span className="rounded-md bg-black/60 px-2 py-1 text-xs text-white">
                            {preview.name}
                        </span>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

/**
 * Área de anexos no rodapé da composição, no espírito do Gmail: imagem
 * aparece como miniatura de verdade, o resto ganha ícone por tipo. Só é
 * renderizada quando há algo — não ocupa espaço à toa.
 */
export function AttachmentTray({
    attachments,
    uploading,
    onRemove,
    somenteLeitura = false,
}: AttachmentTrayProps) {
    const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);

    if (attachments.length === 0 && uploading.length === 0) return null;

    const total =
        attachments.reduce((soma, a) => soma + a.size, 0) +
        uploading.reduce((soma, u) => soma + u.size, 0);
    const perto = total >= WARN_BYTES;

    return (
        <div
            className={cn(
                "px-3 py-2.5",
                somenteLeitura ? "" : "border-t border-border bg-muted/25",
            )}
        >
            {/* Teto com rolagem: sem isto, muito anexo empurra a barra de
                formatação pra fora da área visível do modal. */}
            <div className="flex flex-wrap gap-2 max-h-[132px] overflow-y-auto">
                {attachments.map((anexo) => (
                    <Cartao
                        key={anexo.url}
                        nome={anexo.filename}
                        tamanho={anexo.size}
                        mimeType={anexo.mimeType}
                        url={anexo.url}
                        onRemove={somenteLeitura ? undefined : () => onRemove(anexo.url)}
                        onPreview={() => setPreview({ url: anexo.url, name: anexo.filename })}
                    />
                ))}
                {uploading.map((item) => (
                    <Cartao
                        key={item.id}
                        nome={item.name}
                        tamanho={item.size}
                        mimeType=""
                        subindo
                    />
                ))}
            </div>

            {!somenteLeitura && (
                <div className="mt-2 flex items-center gap-1.5 text-[11px]">
                    <span className={cn(perto ? "font-semibold text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
                        {formatarBytes(total)} de {formatarBytes(MAX_TOTAL_BYTES)}
                    </span>
                    {perto && (
                        <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            anexos grandes podem ser recusados pelo Gmail: a codificação do
                            e-mail aumenta o tamanho em cerca de um terço
                        </span>
                    )}
                </div>
            )}

            <Lightbox preview={preview} onClose={() => setPreview(null)} />
        </div>
    );
}

function Cartao({
    nome,
    tamanho,
    mimeType,
    url,
    subindo = false,
    onRemove,
    onPreview,
}: {
    nome: string;
    tamanho: number;
    mimeType: string;
    url?: string;
    subindo?: boolean;
    onRemove?: () => void;
    onPreview?: () => void;
}) {
    const tipo = classificar(mimeType, nome);
    const ehImagem = tipo === "imagem" && Boolean(url);
    const Icone = tipo === "imagem" ? File : ICONE[tipo];
    const cor = tipo === "imagem" ? "text-muted-foreground" : COR[tipo];

    return (
        <div
            className={cn(
                "group/anexo relative flex items-center gap-2 rounded-lg border bg-background px-2 py-1.5",
                subindo ? "border-dashed border-border" : "border-border",
            )}
        >
            {subindo ? (
                <Loader2 className="w-4 h-4 shrink-0 animate-spin text-muted-foreground" />
            ) : ehImagem ? (
                // Miniatura real do arquivo — o bucket é público, então a
                // própria URL do anexo serve de preview. Clicar amplia.
                <button
                    type="button"
                    onClick={onPreview}
                    title="Ver imagem ampliada"
                    aria-label={`Ver ${nome} ampliada`}
                    className="shrink-0 rounded focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={url}
                        alt={nome}
                        className="h-9 w-9 rounded object-cover border border-border transition-transform hover:scale-105"
                    />
                </button>
            ) : (
                <Icone className={cn("w-5 h-5 shrink-0", cor)} />
            )}

            <div className="min-w-0">
                <p className="max-w-[160px] truncate text-xs font-medium text-foreground">
                    {nome}
                </p>
                <p className="text-[10px] text-muted-foreground">
                    {subindo ? "enviando..." : formatarBytes(tamanho)}
                </p>
            </div>

            {onRemove && (
                <button
                    type="button"
                    onClick={onRemove}
                    aria-label={`Remover ${nome}`}
                    title="Remover"
                    className="ml-1 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-red-500 group-hover/anexo:opacity-100 focus:opacity-100"
                >
                    <X className="w-3.5 h-3.5" />
                </button>
            )}
        </div>
    );
}
