"use client";

import type { RefObject } from "react";
import { FileText, X } from "lucide-react";

export interface AttachmentItem {
    file: File;
    preview: string | null;
    caption: string;
    id: string;
}

interface AttachmentPreviewProps {
    attachments: AttachmentItem[];
    firstCaptionRef: RefObject<HTMLTextAreaElement | null>;
    onRemove: (id: string) => void;
    onCaptionChange: (id: string, caption: string) => void;
    onSend: () => void;
}

export function AttachmentPreview({
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
                        className="relative shrink-0 w-52 rounded-xl border border-[#C7D2FE] dark:border-[#3d4a60] bg-[#EEF2FF] dark:bg-[#1e2536]/80 overflow-hidden flex flex-col">
                        <button
                            onClick={() => onRemove(att.id)}
                            className="absolute top-1.5 right-1.5 z-10 w-5 h-5 rounded-full bg-[#191918]/30 text-[#191918] dark:text-white flex items-center justify-center hover:bg-black/80 transition-colors">
                            <X className="w-3 h-3" />
                        </button>
                        {att.preview ? (
                            <img src={att.preview} alt={att.file.name}
                                className="w-full h-28 object-cover" />
                        ) : (
                            <div className="w-full h-28 flex flex-col items-center justify-center gap-1 bg-[#F7F7F5] dark:bg-[#0f1829]/60">
                                <FileText className="w-8 h-8 text-brand-400" />
                                <p className="text-[10px] text-[#6366F1] dark:text-[#94a3b8] px-2 text-center truncate w-full">{att.file.name}</p>
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
}
