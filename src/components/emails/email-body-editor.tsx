"use client";

import { forwardRef, useRef } from "react";
import { Loader2, Paperclip } from "lucide-react";
import { EmojiPickerInput } from "@/components/conversas/emoji-picker-input";
import { RichTextEditor, type RichTextEditorHandle } from "./rich-text-editor";
import { AttachmentTray } from "./attachment-tray";
import { DrivePickerButton } from "./drive-picker-button";
import { ACCEPT_ATTR } from "@/lib/email/attachments";
import type { EmailAttachmentsController } from "./use-email-attachments";

export interface EmailBodyEditorProps {
    anexos: EmailAttachmentsController;
    onChange: (html: string) => void;
    onError: (msg: string) => void;
    placeholder?: string;
    /** Altura máxima do bloco — o painel do lead é bem mais estreito. */
    containerClassName?: string;
    bodyClassName?: string;
}

/**
 * O corpo do e-mail com tudo que ele precisa: formatação, anexo, Drive e emoji.
 *
 * Existe pra compor e pra responder usarem exatamente a mesma coisa. Os
 * detalhes chatos daqui — o portal da barra que o Dialog do Radix desativava, o
 * foco que o FocusScope roubava, o arquivo colado, o lightbox da miniatura — já
 * custaram caro pra acertar uma vez; montar um segundo editor pro campo de
 * resposta reintroduziria todos eles.
 */
export const EmailBodyEditor = forwardRef<RichTextEditorHandle, EmailBodyEditorProps>(
    function EmailBodyEditor(
        { anexos, onChange, onError, placeholder, containerClassName, bodyClassName },
        ref,
    ) {
        const fileInputRef = useRef<HTMLInputElement>(null);
        const editorRef = useRef<RichTextEditorHandle>(null);

        return (
            <>
                <RichTextEditor
                    ref={(instancia) => {
                        editorRef.current = instancia;
                        if (typeof ref === "function") ref(instancia);
                        else if (ref) ref.current = instancia;
                    }}
                    onChange={onChange}
                    placeholder={placeholder}
                    containerClassName={containerClassName}
                    bodyClassName={bodyClassName}
                    onPasteFiles={(files) => void anexos.handleFiles(files)}
                    attachmentSlot={
                        <AttachmentTray
                            attachments={anexos.attachments}
                            uploading={anexos.uploadingItems}
                            onRemove={anexos.remover}
                        />
                    }
                    toolbarExtras={
                        <>
                            <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => fileInputRef.current?.click()}
                                title="Anexar arquivo"
                                aria-label="Anexar arquivo"
                                className="p-1.5 rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                            >
                                {anexos.uploading ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Paperclip className="w-4 h-4" />
                                )}
                            </button>
                            <DrivePickerButton onAttach={anexos.adicionar} onError={onError} />
                            <EmojiPickerInput
                                onEmojiSelect={(emoji) => editorRef.current?.insertText(emoji)}
                            />
                        </>
                    }
                />
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={ACCEPT_ATTR}
                    hidden
                    onChange={(e) => void anexos.handleFiles(e.target.files)}
                />
            </>
        );
    },
);
