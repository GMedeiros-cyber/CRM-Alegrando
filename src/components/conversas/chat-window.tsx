"use client";

import { useEffect, useRef } from "react";
import { useLeadMessages } from "@/hooks/useLeadMessages";
import type { LeadMessage } from "@/lib/actions/leads";
import { MessageSquare, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatWindowProps {
    telefone: string;
}

// =============================================
// MESSAGE CONTENT — renderização condicional de mídia
// =============================================
function MessageContent({ message, isSelf }: { message: LeadMessage; isSelf: boolean }) {
    if (message.mediaType === "audio") {
        return (
            <div className="flex items-center gap-2.5 px-1 py-0.5">
                <div className={`
                    flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium
                    ${isSelf
                        ? "bg-white/15 text-white/80"
                        : "bg-slate-700/60 text-slate-300"
                    }
                `}>
                    <span className="text-base">🎵</span>
                    <span>Áudio enviado no WhatsApp</span>
                </div>
            </div>
        );
    }

    if (message.mediaType === "image") {
        return (
            <div className="flex items-center gap-2.5 px-1 py-0.5">
                <div className={`
                    flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium
                    ${isSelf
                        ? "bg-white/15 text-white/80"
                        : "bg-slate-700/60 text-slate-300"
                    }
                `}>
                    <span className="text-base">🖼️</span>
                    <span>Imagem enviada no WhatsApp</span>
                </div>
            </div>
        );
    }

    // Texto padrão
    return <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>;
}

// =============================================
// CHAT WINDOW
// =============================================
export function ChatWindow({ telefone }: ChatWindowProps) {
    const { messages, loading } = useLeadMessages(telefone);
    const chatEndRef = useRef<HTMLDivElement>(null);

    // Scroll to bottom
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center bg-[#0b1120]">
                <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
            </div>
        );
    }

    if (messages.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-8 bg-[#0b1120]">
                <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center mb-4">
                    <MessageSquare className="w-8 h-8 text-slate-600" />
                </div>
                <p className="text-sm font-medium text-slate-500">Nenhuma mensagem ainda</p>
                <p className="text-xs text-slate-600 mt-1 max-w-[250px]">
                    Nenhuma mensagem recebida ou enviada via WhatsApp até o momento.
                </p>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-[#0b1120]">
            {messages.map((msg) => {
                const isClient = msg.senderType === "cliente" || msg.senderType === "lead";
                const isSelf = msg.senderType === "ia" || msg.senderType === "humano";

                return (
                    <div
                        key={msg.id}
                        className={cn(
                            "flex",
                            isClient ? "justify-start" : "justify-end"
                        )}
                    >
                        <div
                            className={cn(
                                "max-w-[70%] px-4 py-2.5 text-sm leading-relaxed",
                                isClient
                                    ? "bg-slate-800 border border-slate-700 text-slate-200 rounded-2xl rounded-bl-sm"
                                    : msg.senderType === "ia"
                                        ? "bg-violet-500/20 text-violet-200 border border-violet-500/30 rounded-2xl rounded-br-sm"
                                        : "bg-[#005c4b] text-[#e9edef] rounded-2xl rounded-br-sm shadow-sm"
                            )}
                        >
                            {!isClient && (
                                <p
                                    className={cn(
                                        "text-[10px] font-bold mb-0.5",
                                        msg.senderType === "ia"
                                            ? "text-violet-400"
                                            : "text-green-300"
                                    )}
                                >
                                    {msg.senderType === "ia" ? "🤖 IA" : msg.senderName || "Equipe"}
                                </p>
                            )}

                            {isClient && msg.senderName && (
                                <p className="text-[10px] font-bold mb-0.5 text-slate-400">
                                    {msg.senderName}
                                </p>
                            )}

                            <MessageContent message={msg} isSelf={isSelf} />

                            <p
                                className={cn(
                                    "text-[10px] mt-1 text-right",
                                    isClient ? "text-slate-500" : "text-white/50"
                                )}
                            >
                                {msg.createdAt
                                    ? new Date(msg.createdAt).toLocaleTimeString("pt-BR", {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                    })
                                    : ""}
                            </p>
                        </div>
                    </div>
                );
            })}
            <div ref={chatEndRef} />
        </div>
    );
}
