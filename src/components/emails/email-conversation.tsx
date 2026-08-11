"use client";

import { useState, useTransition } from "react";
import {
    AlertTriangle,
    CalendarClock,
    CheckCircle2,
    ChevronDown,
    Clock,
    CornerDownLeft,
    Loader2,
    Quote,
    Send,
    Trash2,
    X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { markEmailRepliesRead, replyToEmailReply } from "@/lib/actions/emails";
import { separarCitacao } from "@/lib/email/format";
import { isEditorEmpty } from "@/lib/email/editor";
import { AttachmentTray } from "./attachment-tray";
import { TextoComLinks } from "./texto-com-links";
import { EmailBodyEditor } from "./email-body-editor";
import { useEmailAttachments } from "./use-email-attachments";
import type { EmailConversation, EmailThreadMessage } from "@/lib/types/email";

const STATUS_UI = {
    sent: { icon: <CheckCircle2 className="w-3 h-3" />, text: "Enviado", className: "text-emerald-500 dark:text-emerald-400" },
    failed: { icon: <X className="w-3 h-3" />, text: "Falhou", className: "text-red-500 dark:text-red-400" },
    pending: { icon: <Clock className="w-3 h-3" />, text: "Na fila", className: "text-amber-500 dark:text-amber-400" },
    scheduled: { icon: <CalendarClock className="w-3 h-3" />, text: "Programado", className: "text-brand-500 dark:text-brand-400" },
} as const;

function formatarData(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export interface EmailConversationItemProps {
    conversa: EmailConversation;
    /** Marca as respostas como lidas no estado local, sem refetch. */
    onRead: (replyIds: string[]) => void;
    onDelete: (sendIds: string[]) => void;
    onReplied: () => void;
    onToast: (toast: { type: "success" | "error"; text: string }) => void;
}

/**
 * Uma conversa de e-mail: recolhida vira uma linha; expandida mostra a troca
 * inteira em ordem e o campo de responder no fim.
 *
 * A resposta acontece AQUI dentro, e não num modal: dentro de uma conversa em
 * andamento o destinatário e o assunto já estão decididos, então abrir a
 * composição inteira só afastaria a resposta do que se está lendo.
 */
export function EmailConversationItem({
    conversa,
    onRead,
    onDelete,
    onReplied,
    onToast,
}: EmailConversationItemProps) {
    const [aberta, setAberta] = useState(false);
    const [jaAbriu, setJaAbriu] = useState(false);
    const [confirmando, setConfirmando] = useState(false);

    const status = STATUS_UI[conversa.status] ?? STATUS_UI.pending;
    const recebidas = conversa.messages.filter((m) => m.direcao === "recebido");
    const temNaoLida = conversa.unreadCount > 0;

    function alternar() {
        const abrindo = !aberta;
        setAberta(abrindo);
        if (abrindo) setJaAbriu(true);

        // Abrir é o gesto de ler.
        if (abrindo && temNaoLida) {
            const ids = recebidas.filter((m) => m.readAt === null).map((m) => m.id);
            onRead(ids);
            void markEmailRepliesRead(ids);
        }
    }

    if (confirmando) {
        const agendado = conversa.status === "scheduled";
        return (
            <div className="px-2 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30">
                <p className="text-[10px] font-medium text-red-500 dark:text-red-400 leading-snug">
                    {agendado
                        ? "Cancelar este envio agendado? Ele não será mais disparado."
                        : "Remover esta conversa do histórico?"}
                </p>
                {!agendado && (
                    <p className="mt-0.5 text-[9px] text-[#6366F1] dark:text-[#94a3b8] leading-snug">
                        Apaga só o registro aqui no CRM — o que já foi entregue continua
                        na caixa de quem recebeu.
                    </p>
                )}
                <div className="flex gap-1.5 mt-1.5">
                    <button
                        type="button"
                        onClick={() => {
                            setConfirmando(false);
                            onDelete(
                                conversa.messages
                                    .filter((m) => m.direcao === "enviado")
                                    .map((m) => m.id),
                            );
                        }}
                        className="flex-1 px-2 py-1 rounded-md bg-red-500 text-white text-[10px] font-semibold hover:bg-red-600 transition-colors"
                    >
                        {agendado ? "Cancelar envio" : "Remover"}
                    </button>
                    <button
                        type="button"
                        onClick={() => setConfirmando(false)}
                        className="flex-1 px-2 py-1 rounded-md bg-[#E0E7FF] dark:bg-[#2d3347] text-[10px] font-semibold text-[#191918] dark:text-white hover:bg-[#C7D2FE] dark:hover:bg-[#3d4a60] transition-colors"
                    >
                        Voltar
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div
            className={cn(
                "rounded-lg border transition-colors",
                temNaoLida
                    ? "border-emerald-500/50 bg-emerald-500/5"
                    : "border-[#C7D2FE] dark:border-[#3d4a60]/60 bg-[#EEF2FF] dark:bg-[#1e2536]/60",
            )}
        >
            {/* ---- cabeçalho da conversa ---- */}
            <div className="group/conversa flex items-start gap-1.5 px-2 py-1.5">
                <button
                    type="button"
                    onClick={alternar}
                    aria-expanded={aberta}
                    className="flex flex-1 min-w-0 items-start gap-1.5 text-left"
                >
                    <ChevronDown
                        className={cn(
                            "mt-0.5 h-3 w-3 shrink-0 text-[#6366F1] dark:text-[#94a3b8] transition-transform",
                            aberta && "rotate-180",
                        )}
                    />
                    <div className="min-w-0 flex-1">
                        <p
                            className={cn(
                                "truncate text-[11px] text-[#191918] dark:text-white",
                                temNaoLida ? "font-bold" : "font-medium",
                            )}
                        >
                            {conversa.subject}
                        </p>
                        <p className="truncate text-[10px] text-[#6366F1] dark:text-[#94a3b8]">
                            {conversa.recipientEmail}
                            {recebidas.length > 0 && (
                                <span className="ml-1 whitespace-nowrap">
                                    · {recebidas.length}{" "}
                                    {recebidas.length === 1 ? "resposta" : "respostas"}
                                </span>
                            )}
                        </p>
                        {conversa.status === "failed" && conversa.error && (
                            <p className="text-[9px] text-red-400/90 leading-snug break-words">
                                {conversa.error}
                            </p>
                        )}
                    </div>
                </button>

                <div className="shrink-0 flex items-center gap-1">
                    <div className="text-right">
                        <span
                            className={cn(
                                "flex items-center justify-end gap-1 text-[10px] font-semibold",
                                status.className,
                            )}
                        >
                            {status.icon}
                            {status.text}
                        </span>
                        <span className="text-[9px] text-[#9B9A97] dark:text-[#64748b]">
                            {formatarData(conversa.lastActivityAt)}
                        </span>
                    </div>
                    {temNaoLida && (
                        <span className="min-w-[16px] rounded-full bg-emerald-500 px-1 text-center text-[10px] font-bold leading-4 text-white">
                            {conversa.unreadCount}
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={() => setConfirmando(true)}
                        title="Remover conversa"
                        aria-label="Remover conversa"
                        className="p-1 rounded text-[#9B9A97] dark:text-[#64748b] opacity-0 transition-opacity hover:text-red-500 group-hover/conversa:opacity-100 focus:opacity-100"
                    >
                        <Trash2 className="w-3 h-3" />
                    </button>
                </div>
            </div>

            {/* ---- a troca ----
                Uma vez aberta, a conversa fica MONTADA e só some da tela. É o
                que salva o rascunho: o corpo do editor é contentEditable, então
                desmontar leva junto o texto digitado, e recolher a conversa sem
                querer apagaria uma resposta pela metade. */}
            {jaAbriu && (
                <div
                    className={cn(
                        "border-t border-[#C7D2FE] dark:border-[#3d4a60]/60 px-2 py-2 space-y-1.5",
                        !aberta && "hidden",
                    )}
                >
                    {conversa.messages.map((msg) => (
                        <MensagemDaThread key={`${msg.direcao}-${msg.id}`} msg={msg} />
                    ))}

                    {conversa.replyTargetId ? (
                        <RespostaInline
                            replyId={conversa.replyTargetId}
                            onReplied={onReplied}
                            onToast={onToast}
                        />
                    ) : (
                        <p className="pt-1 text-[10px] italic text-[#9B9A97] dark:text-[#64748b]">
                            Sem resposta da escola ainda — quando ela responder, dá pra
                            responder por aqui.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

function MensagemDaThread({ msg }: { msg: EmailThreadMessage }) {
    const [mostrarCitacao, setMostrarCitacao] = useState(false);
    const enviada = msg.direcao === "enviado";

    // O corpo recebido vem de fora — é a escola que escreve. Só texto: HTML de
    // terceiro renderizado no painel abriria uma porta de XSS.
    const { principal, citacao } = (() => {
        if (enviada) return { principal: "", citacao: "" };
        const texto = msg.bodyText?.trim() || "";
        // Rede de segurança pras respostas ingeridas antes do corte existir.
        return separarCitacao(texto);
    })();

    return (
        <div
            className={cn(
                "rounded-md border px-2 py-1.5",
                msg.devolucao
                    ? "border-red-500/40 bg-red-500/10"
                    : enviada
                      ? "border-[#C7D2FE] dark:border-[#3d4a60]/60 bg-background/60"
                      : msg.readAt === null
                        ? "border-emerald-500/40 bg-emerald-500/10"
                        : "border-emerald-500/25 bg-emerald-500/5",
            )}
        >
            <div className="flex items-baseline gap-1.5">
                {msg.devolucao ? (
                    <AlertTriangle className="h-3 w-3 shrink-0 self-center text-red-500 dark:text-red-400" />
                ) : enviada ? (
                    <Send className="h-3 w-3 shrink-0 self-center text-orange-500" />
                ) : (
                    <CornerDownLeft className="h-3 w-3 shrink-0 self-center text-emerald-600 dark:text-emerald-400" />
                )}
                <span
                    className={cn(
                        "truncate text-[10px] font-bold",
                        msg.devolucao
                            ? "text-red-600 dark:text-red-400"
                            : "text-[#191918] dark:text-white",
                    )}
                >
                    {msg.devolucao ? "Não entregue" : msg.autor}
                </span>
                <span className="ml-auto shrink-0 text-[9px] text-[#9B9A97] dark:text-[#64748b]">
                    {formatarData(msg.at)}
                </span>
            </div>

            <TextoComLinks
                texto={(enviada ? msg.bodyText : principal) || "(sem conteúdo)"}
                className="mt-0.5 text-[11px] leading-snug text-[#191918] dark:text-[#cbd5e1]"
            />

            {/* Estado do envio como nota de rodapé, e não no lugar do texto:
                antes o corpo do que a equipe mandou nem aparecia, e a conversa
                ficava com metade das falas em branco. */}
            {enviada && msg.status !== "sent" && (
                <p className="mt-0.5 text-[9px] italic text-[#6366F1] dark:text-[#94a3b8]">
                    {msg.status === "failed"
                        ? msg.error || "Falha no envio"
                        : msg.status === "scheduled"
                          ? "Programado"
                          : "Na fila de envio"}
                </p>
            )}

            {!enviada && (citacao || msg.bodyTextFull) && (
                <>
                    <button
                        type="button"
                        onClick={() => setMostrarCitacao((v) => !v)}
                        className="mt-1 flex items-center gap-1 rounded px-1 py-0.5 text-[9px] font-semibold text-[#6366F1] dark:text-[#94a3b8] hover:bg-black/5 dark:hover:bg-white/5"
                    >
                        <Quote className="h-2.5 w-2.5" />
                        {mostrarCitacao ? "Ocultar" : "Ver"} mensagem completa
                    </button>
                    {mostrarCitacao && (
                        <div className="mt-1 max-h-40 overflow-y-auto border-l-2 border-[#C7D2FE] dark:border-[#3d4a60] pl-2">
                            <TextoComLinks
                                texto={msg.bodyTextFull || citacao}
                                className="text-[10px] leading-snug text-[#9B9A97] dark:text-[#64748b]"
                            />
                        </div>
                    )}
                </>
            )}

            {msg.attachments.length > 0 && (
                <div className="mt-1 -mx-2 -mb-1.5">
                    <AttachmentTray
                        attachments={msg.attachments}
                        uploading={[]}
                        onRemove={() => {}}
                        somenteLeitura
                    />
                </div>
            )}

            {/* Sem isto, anexo que falhou some sem deixar rastro e quem lê a
                conversa nem sabe que havia arquivo. Discreto de propósito: é
                aviso, não alarme. */}
            {msg.attachmentsMissing > 0 && (
                <p className="mt-1 flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    {msg.attachmentsMissing === 1
                        ? "1 anexo não pôde ser carregado"
                        : `${msg.attachmentsMissing} anexos não puderam ser carregados`}
                </p>
            )}
        </div>
    );
}

/**
 * O campo de responder, com a mesma caixa de escrita do e-mail novo.
 *
 * Usa o `EmailBodyEditor` — o mesmo do modal — em vez de um campo próprio:
 * anexo, Drive, colar arquivo, lightbox e os acertos de foco/portal do Radix
 * já foram pagos uma vez ali, e um segundo editor os reintroduziria.
 */
function RespostaInline({
    replyId,
    onReplied,
    onToast,
}: {
    replyId: string;
    onReplied: () => void;
    onToast: (toast: { type: "success" | "error"; text: string }) => void;
}) {
    const [aberto, setAberto] = useState(false);
    const [corpo, setCorpo] = useState("");
    const [erro, setErro] = useState("");
    const [enviando, startEnviando] = useTransition();
    const anexos = useEmailAttachments(setErro);
    // Remonta o editor a cada envio: o conteúdo dele é contentEditable, então
    // sem trocar a chave o texto anterior continuaria na tela.
    const [rodada, setRodada] = useState(0);

    const temRascunho = !isEditorEmpty(corpo) || anexos.attachments.length > 0;
    const podeEnviar = !isEditorEmpty(corpo) && !anexos.uploading && !enviando;

    function enviar() {
        if (!podeEnviar) return;
        setErro("");

        startEnviando(async () => {
            const res = await replyToEmailReply({
                replyId,
                body: corpo,
                attachments: anexos.attachments,
            });
            if (!res.ok) {
                setErro(res.error);
                return;
            }
            setCorpo("");
            anexos.limpar();
            setRodada((n) => n + 1);
            setAberto(false);
            onToast({ type: "success", text: "Resposta enviada" });
            onReplied();
        });
    }

    function cancelar() {
        setErro("");
        setCorpo("");
        anexos.limpar();
        setRodada((n) => n + 1);
        setAberto(false);
    }

    return (
        <div className="pt-1">
            {!aberto && (
                <button
                    type="button"
                    onClick={() => setAberto(true)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#C7D2FE] dark:border-[#3d4a60] bg-background px-3 py-1.5 text-[11px] font-semibold text-[#6366F1] dark:text-[#94a3b8] transition-colors hover:border-brand-500/50 hover:text-brand-500 dark:hover:text-brand-400"
                >
                    <CornerDownLeft className="h-3.5 w-3.5" />
                    Responder
                    {/* Recolher não joga o texto fora, mas some com ele da
                        tela — sem este aviso a resposta pela metade parece
                        perdida. */}
                    {temRascunho && (
                        <span className="rounded-full bg-brand-500 px-1.5 text-[9px] font-bold text-white">
                            rascunho
                        </span>
                    )}
                </button>
            )}

            {/* Escondido, e não desmontado: o corpo é contentEditable, então
                desmontar apagaria o que já foi digitado. */}
            <div className={cn("space-y-1.5", !aberto && "hidden")}>
                <EmailBodyEditor
                    key={rodada}
                    anexos={anexos}
                    onChange={setCorpo}
                    onError={setErro}
                    placeholder="Responder nesta conversa..."
                    containerClassName="max-h-[320px]"
                    bodyClassName="min-h-[56px]"
                />

                {erro && (
                    <p className="rounded-md bg-red-500/10 px-2 py-1 text-[10px] leading-snug text-red-500 dark:text-red-400">
                        {erro}
                    </p>
                )}

                {/* Secundários agrupados à esquerda e o primário empurrado pra
                    direita: além de caber, mantém "Descartar" longe do botão
                    de enviar. Quebra em duas linhas quando o painel aperta —
                    antes a linha estourava a largura e o "Descartar" saía. */}
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={() => setAberto(false)}
                            disabled={enviando}
                            title="Recolher sem apagar o que já foi escrito"
                            className="rounded-lg border border-[#C7D2FE] dark:border-[#3d4a60] px-2 py-1.5 text-[11px] font-semibold text-[#6366F1] dark:text-[#94a3b8] transition-colors hover:bg-[#E0E7FF] dark:hover:bg-[#2d3347] disabled:opacity-40"
                        >
                            Recolher
                        </button>
                        {temRascunho && (
                            <button
                                type="button"
                                onClick={cancelar}
                                disabled={enviando}
                                title="Descartar o rascunho"
                                aria-label="Descartar o rascunho"
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-[#9B9A97] dark:text-[#64748b] transition-colors hover:bg-red-500/10 hover:text-red-500 disabled:opacity-40"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={enviar}
                        disabled={!podeEnviar}
                        className="ml-auto flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-40"
                    >
                        {enviando ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <Send className="h-3.5 w-3.5" />
                        )}
                        {enviando ? "Enviando..." : "Responder"}
                    </button>
                </div>
            </div>
        </div>
    );
}
