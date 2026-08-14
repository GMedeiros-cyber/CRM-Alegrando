"use client";

import { Download } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { urlDeDownload } from "@/lib/email/attachments";

export interface ImageLightboxPreview {
    url: string;
    name: string;
}

export interface ImageLightboxProps {
    preview: ImageLightboxPreview | null;
    onClose: () => void;
}

/**
 * Imagem ampliada, com "Baixar".
 *
 * Nasceu dentro do `attachment-tray` do e-mail e foi puxado pra cá quando o
 * chat do WhatsApp passou a precisar do mesmo comportamento. Um segundo
 * visualizador copiado divergiria do primeiro no primeiro ajuste — e o mesmo
 * botão passaria a se comportar diferente em duas telas.
 *
 * Continua sendo um Dialog do Radix ANINHÁVEL: quando aberto de dentro da
 * composição de e-mail ele entra na pilha de camadas, então fechar aqui fecha só
 * o lightbox, e não a composição junto — que é o que um portal solto no body
 * faria.
 */
export function ImageLightbox({ preview, onClose }: ImageLightboxProps) {
    // `blob:` é a bolha otimista, que ainda não subiu: a rota de download não
    // alcança um endereço que só existe nesta aba. Baixar aparece só quando há
    // o que baixar de verdade.
    const baixavel = preview !== null && /^https?:/i.test(preview.url);

    return (
        <Dialog open={preview !== null} onOpenChange={(aberto) => { if (!aberto) onClose(); }}>
            <DialogContent className="sm:max-w-3xl bg-transparent border-0 shadow-none p-0">
                <DialogTitle className="sr-only">{preview?.name ?? "Imagem"}</DialogTitle>
                {preview && (
                    <div className="flex flex-col items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={preview.url}
                            alt={preview.name}
                            className="max-h-[75vh] w-auto max-w-full rounded-lg object-contain shadow-2xl"
                        />
                        <div className="flex items-center gap-2">
                            <span className="rounded-md bg-black/60 px-2 py-1 text-xs text-white">
                                {preview.name}
                            </span>
                            {baixavel && (
                                // Âncora e não `fetch`+blob: a rota devolve
                                // `Content-Disposition: attachment`, então o
                                // navegador salva sem carregar 25 MB na memória
                                // da aba. Sem `download` no atributo de
                                // propósito — quem manda no nome é o servidor.
                                <a
                                    href={urlDeDownload(preview.url, preview.name)}
                                    className="flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-xs text-white transition-colors hover:bg-black/80"
                                >
                                    <Download className="h-3.5 w-3.5" />
                                    Baixar
                                </a>
                            )}
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
