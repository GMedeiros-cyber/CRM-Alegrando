"use client";

import { memo } from "react";
import type { RefObject } from "react";
import { FileText, X } from "lucide-react";
import type { EditState } from "./image-editor";

/**
 * Item da bandeja de anexos do chat.
 *
 * É união discriminada porque o arquivo do Drive chega **sem `File`**: o
 * `attachDriveFile` já o republicou no R2, então o que existe é `path` + `url`.
 * Forçar um `File` ali significaria baixar e re-subir o mesmo arquivo.
 *
 * - `local`  → veio do clipe, do Ctrl+V ou do editor. Sobe no envio.
 * - `remote` → já está no R2, no prefixo `chat-<canal>/<telefone>/`. Só envia.
 */
export type AttachmentBase = {
    id: string;
    caption: string;
    preview: string | null;
};

export type LocalAttachment = AttachmentBase & {
    kind: "local";
    file: File;
    /** Arquivo antes de qualquer edição — permite reabrir o editor sem degradar. */
    original?: File;
    edits?: EditState | null;
};

export type RemoteAttachment = AttachmentBase & {
    kind: "remote";
    path: string;
    url: string;
    name: string;
    mime: string;
    size: number;
};

export type ChatAttachment = LocalAttachment | RemoteAttachment;

/** Nome e mime sem repetir o discriminante em cada uso. */
export const nomeDe = (a: ChatAttachment) => (a.kind === "local" ? a.file.name : a.name);
export const mimeDe = (a: ChatAttachment) => (a.kind === "local" ? a.file.type : a.mime);
export const ehImagem = (a: ChatAttachment) => mimeDe(a).startsWith("image/");
export const ehVideo = (a: ChatAttachment) => mimeDe(a).startsWith("video/");

interface AttachmentPreviewProps {
    attachments: ChatAttachment[];
    firstCaptionRef: RefObject<HTMLTextAreaElement | null>;
    onRemove: (id: string) => void;
    onCaptionChange: (id: string, caption: string) => void;
    onSend: () => void;
}

const AttachmentPreviewInner = function AttachmentPreview({
    attachments,
    firstCaptionRef,
    onRemove,
    onCaptionChange,
    onSend,
}: AttachmentPreviewProps) {
    return (
        <div className="px-5 py-3 border-t border-border/50 bg-[#F7F7F5] dark:bg-[#0f1829]/80">
            <div className="flex gap-3 overflow-x-auto pb-2">
                {attachments.map((att, idx) => (
                    <div key={att.id}
                        className="group/att relative shrink-0 w-52 rounded-xl border border-[#C7D2FE] dark:border-[#3d4a60] bg-[#EEF2FF] dark:bg-[#1e2536]/80 overflow-hidden flex flex-col">
                        <button
                            onClick={() => onRemove(att.id)}
                            title="Remover"
                            className="absolute top-1.5 right-1.5 z-10 w-5 h-5 rounded-full bg-[#191918]/30 text-[#191918] dark:text-white flex items-center justify-center hover:bg-black/80 transition-colors">
                            <X className="w-3 h-3" />
                        </button>

                        {att.preview && ehImagem(att) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={att.preview} alt={nomeDe(att)}
                                className="w-full h-28 object-cover" />
                        ) : att.preview && ehVideo(att) ? (
                            <video src={att.preview} muted
                                className="w-full h-28 object-cover" />
                        ) : (
                            <div className="w-full h-28 flex flex-col items-center justify-center gap-1 bg-[#F7F7F5] dark:bg-[#0f1829]/60">
                                <FileText className="w-8 h-8 text-brand-400" />
                                <p className="text-[10px] text-[#6366F1] dark:text-[#94a3b8] px-2 text-center truncate w-full">{nomeDe(att)}</p>
                            </div>
                        )}
                        <textarea
                            ref={idx === 0 ? firstCaptionRef : undefined}
                            rows={2}
                            value={att.caption}
                            onChange={(e) => {
                                const el = e.currentTarget;
                                el.style.height = "auto";
                                el.style.height = el.scrollHeight + "px";
                                onCaptionChange(att.id, e.target.value);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    onSend();
                                }
                            }}
                            placeholder="Adicionar legenda... (Enter para enviar)"
                            className="w-full px-2 py-1.5 text-xs bg-transparent text-[#37352F] dark:text-[#cbd5e1] placeholder:text-[#6366F1] dark:text-[#94a3b8] outline-none border-t border-[#C7D2FE] dark:border-[#3d4a60]/50 resize-none leading-relaxed" />
                    </div>
                ))}
            </div>
            <p className="text-[10px] text-[#6366F1] dark:text-[#94a3b8] mt-1">
                {attachments.length} arquivo{attachments.length !== 1 ? "s" : ""} — Enter na legenda ou clique em enviar
            </p>
        </div>
    );
};

export const AttachmentPreview = memo(AttachmentPreviewInner);
