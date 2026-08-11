"use client";

import { useCallback, useState } from "react";
import { createEmailAttachmentUploadUrl } from "@/lib/actions/emails";
import {
    MAX_TOTAL_BYTES,
    formatarBytes,
    motivoRecusa,
} from "@/lib/email/attachments";
import type { EmailAttachment } from "@/lib/types/email";

/**
 * O pipeline de anexo do e-mail, num lugar só.
 *
 * Vale pros três caminhos de entrada (clipe, Drive e colar) e pros dois pontos
 * de escrita (compor um e-mail novo e responder dentro de uma conversa). Ter
 * uma cópia disso por tela era o caminho mais curto pra um aceitar o que o
 * outro recusa.
 */
export function useEmailAttachments(reportarErro: (msg: string) => void) {
    const [attachments, setAttachments] = useState<EmailAttachment[]>([]);
    const [uploading, setUploading] = useState(false);
    /** Arquivos em trânsito, pra aparecerem na bandeja antes de ter URL. */
    const [uploadingItems, setUploadingItems] = useState<
        { id: string; name: string; size: number }[]
    >([]);

    const handleFiles = useCallback(
        async (files: FileList | File[] | null) => {
            const lista = files ? Array.from(files) : [];
            if (lista.length === 0) return;

            setUploading(true);
            // Acumulador próprio: o estado do render não enxerga o que acabou
            // de entrar neste mesmo lote.
            let acumulado = attachments.reduce((soma, a) => soma + a.size, 0);

            try {
                for (const file of lista) {
                    const recusa = motivoRecusa(file);
                    if (recusa) {
                        reportarErro(recusa);
                        continue;
                    }

                    if (acumulado + file.size > MAX_TOTAL_BYTES) {
                        const excesso = acumulado + file.size - MAX_TOTAL_BYTES;
                        reportarErro(
                            `"${file.name}" passa ${formatarBytes(excesso)} do limite de ${formatarBytes(MAX_TOTAL_BYTES)} do Gmail (a soma vale pra mensagem inteira). Remova algum anexo ou mande este arquivo por link.`,
                        );
                        continue;
                    }

                    // Print colado vem com nome genérico ("image.png") ou sem
                    // nome: vários prints virariam anexos indistinguíveis.
                    const nome =
                        file.name && file.name !== "image.png"
                            ? file.name
                            : `colado-${new Date().toISOString().slice(11, 19).replace(/:/g, "")}.${file.type.split("/")[1] || "png"}`;

                    const id = `${nome}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                    setUploadingItems((prev) => [...prev, { id, name: nome, size: file.size }]);

                    try {
                        const mimeType = file.type || "application/octet-stream";
                        const prepared = await createEmailAttachmentUploadUrl(nome, mimeType);
                        if (!prepared.ok) {
                            reportarErro(`${nome}: ${prepared.error}`);
                            continue;
                        }

                        const put = await fetch(prepared.signedUrl, {
                            method: "PUT",
                            headers: { "Content-Type": mimeType },
                            body: file,
                        });
                        if (!put.ok) {
                            // Sem o status, uma falha de upload some sem deixar
                            // rastro — foi o que aconteceu com o print colado.
                            reportarErro(`Falha ao subir "${nome}" (HTTP ${put.status}). Tente de novo.`);
                            continue;
                        }

                        acumulado += file.size;
                        setAttachments((prev) => [
                            ...prev,
                            {
                                url: prepared.publicUrl,
                                filename: nome,
                                size: file.size,
                                mimeType,
                                source: "upload",
                            },
                        ]);
                    } catch (err) {
                        reportarErro(
                            `Falha ao subir "${nome}": ${err instanceof Error ? err.message : "erro de rede"}`,
                        );
                    } finally {
                        setUploadingItems((prev) => prev.filter((i) => i.id !== id));
                    }
                }
            } finally {
                setUploading(false);
            }
        },
        [attachments, reportarErro],
    );

    const adicionar = useCallback((anexo: EmailAttachment) => {
        setAttachments((prev) => (prev.some((a) => a.url === anexo.url) ? prev : [...prev, anexo]));
    }, []);

    const remover = useCallback((url: string) => {
        setAttachments((prev) => prev.filter((a) => a.url !== url));
    }, []);

    const limpar = useCallback(() => {
        setAttachments([]);
        setUploadingItems([]);
    }, []);

    return {
        attachments,
        uploading,
        uploadingItems,
        handleFiles,
        adicionar,
        remover,
        limpar,
    };
}

export type EmailAttachmentsController = ReturnType<typeof useEmailAttachments>;
