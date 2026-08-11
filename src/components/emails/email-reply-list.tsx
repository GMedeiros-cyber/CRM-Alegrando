"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CornerDownLeft, Quote, Reply } from "lucide-react";
import { cn } from "@/lib/utils";
import { markEmailReplyRead } from "@/lib/actions/emails";
import { htmlParaTexto, separarCitacao } from "@/lib/email/format";
import type { EmailReplyRecord } from "@/lib/types/email";

/**
 * É um aviso de que a mensagem não foi entregue?
 *
 * O Gmail devolve o bounce DENTRO da conversa, então ele chega aqui como
 * qualquer outra resposta — e é bom que chegue: sem isso, um e-mail errado de
 * escola falharia em silêncio e a equipe acharia que a proposta chegou. Mas
 * não pode aparecer como se alguém tivesse escrito de volta.
 */
function ehDevolucao(reply: EmailReplyRecord): boolean {
    const de = reply.fromEmail.toLowerCase();
    return (
        de.startsWith("mailer-daemon@") ||
        de.startsWith("postmaster@") ||
        /delivery status notification|undeliverable|returned mail/i.test(reply.subject || "")
    );
}

export interface EmailReplyListProps {
    replies: EmailReplyRecord[];
    /** Marca a linha como lida no estado local, sem recarregar o histórico. */
    onRead: (replyId: string) => void;
    onReply: (reply: EmailReplyRecord) => void;
}

/**
 * As respostas de uma conversa, logo abaixo do e-mail que as originou.
 *
 * A barra verde à esquerda e o recuo existem pra separar de relance o que
 * ENTROU do que a equipe mandou — no painel estreito do lead, cor e alinhamento
 * fazem esse trabalho melhor do que qualquer rótulo.
 */
export function EmailReplyList({ replies, onRead, onReply }: EmailReplyListProps) {
    if (replies.length === 0) return null;

    return (
        <div className="mt-1.5 space-y-1 border-l-2 border-emerald-500/50 pl-2">
            {replies.map((reply) => (
                <ReplyRow key={reply.id} reply={reply} onRead={onRead} onReply={onReply} />
            ))}
        </div>
    );
}

function ReplyRow({
    reply,
    onRead,
    onReply,
}: {
    reply: EmailReplyRecord;
    onRead: (replyId: string) => void;
    onReply: (reply: EmailReplyRecord) => void;
}) {
    const [aberta, setAberta] = useState(false);
    const [mostrarCitacao, setMostrarCitacao] = useState(false);

    const naoLida = reply.readAt === null;
    const devolucao = ehDevolucao(reply);

    // O corpo vem de fora — é a escola que escreve. Por isso ele é sempre
    // reduzido a TEXTO: renderizar HTML de terceiro no painel abriria uma
    // porta de XSS por um caminho que não controlamos.
    const { principal, citacao } = useMemo(() => {
        const texto = reply.bodyText?.trim()
            ? reply.bodyText
            : htmlParaTexto(reply.bodyHtml || "");
        return separarCitacao(texto || reply.snippet || "");
    }, [reply.bodyText, reply.bodyHtml, reply.snippet]);

    const data = new Date(reply.receivedAt);
    const quando = Number.isNaN(data.getTime())
        ? ""
        : data.toLocaleString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
          });

    function alternar() {
        const abrindo = !aberta;
        setAberta(abrindo);
        // Abrir é o gesto de ler. Só dispara na primeira vez.
        if (abrindo && naoLida) {
            onRead(reply.id);
            void markEmailReplyRead(reply.id);
        }
    }

    return (
        <div
            className={cn(
                "rounded-lg border px-2 py-1.5 transition-colors",
                devolucao
                    ? "border-red-500/40 bg-red-500/10"
                    : naoLida
                      ? "border-emerald-500/40 bg-emerald-500/10"
                      : "border-[#C7D2FE] dark:border-[#3d4a60]/60 bg-[#EEF2FF] dark:bg-[#1e2536]/40",
            )}
        >
            <button
                type="button"
                onClick={alternar}
                aria-expanded={aberta}
                className="flex w-full items-start gap-1.5 text-left"
            >
                {devolucao ? (
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-red-500 dark:text-red-400" />
                ) : (
                    <CornerDownLeft className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
                )}
                <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5">
                        <span
                            className={cn(
                                "truncate text-[11px]",
                                devolucao
                                    ? "font-bold text-red-600 dark:text-red-400"
                                    : "text-[#191918] dark:text-white",
                                !devolucao && (naoLida ? "font-bold" : "font-medium"),
                            )}
                        >
                            {devolucao
                                ? "Não entregue"
                                : reply.fromName || reply.fromEmail}
                        </span>
                        {quando && (
                            <span className="ml-auto shrink-0 text-[9px] text-[#9B9A97] dark:text-[#64748b]">
                                {quando}
                            </span>
                        )}
                    </div>
                    {!aberta && (
                        <p className="truncate text-[10px] text-[#6366F1] dark:text-[#94a3b8]">
                            {reply.snippet || principal || "(sem conteúdo)"}
                        </p>
                    )}
                </div>
            </button>

            {aberta && (
                <div className="mt-1.5 space-y-1.5">
                    <p className="whitespace-pre-wrap break-words text-[11px] leading-snug text-[#191918] dark:text-[#cbd5e1]">
                        {principal || "(sem conteúdo)"}
                    </p>

                    {citacao && (
                        <>
                            <button
                                type="button"
                                onClick={() => setMostrarCitacao((v) => !v)}
                                className="flex items-center gap-1 rounded px-1 py-0.5 text-[9px] font-semibold text-[#6366F1] dark:text-[#94a3b8] hover:bg-black/5 dark:hover:bg-white/5"
                            >
                                <Quote className="h-2.5 w-2.5" />
                                {mostrarCitacao ? "Ocultar" : "Mostrar"} mensagem citada
                            </button>
                            {mostrarCitacao && (
                                <p className="whitespace-pre-wrap break-words border-l-2 border-[#C7D2FE] dark:border-[#3d4a60] pl-2 text-[10px] leading-snug text-[#9B9A97] dark:text-[#64748b]">
                                    {citacao}
                                </p>
                            )}
                        </>
                    )}

                    <div className="flex items-center justify-between gap-2 pt-0.5">
                        <span className="truncate text-[9px] text-[#9B9A97] dark:text-[#64748b]">
                            {reply.fromEmail}
                        </span>
                        {/* Responder ao mailer-daemon não leva a lugar nenhum:
                            o que resolve é corrigir o e-mail do lead. */}
                        {!devolucao && (
                            <button
                                type="button"
                                onClick={() => onReply(reply)}
                                className="flex shrink-0 items-center gap-1 rounded-md bg-brand-500 px-2 py-1 text-[10px] font-semibold text-white transition-colors hover:bg-brand-600"
                            >
                                <Reply className="h-3 w-3" />
                                Responder
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
