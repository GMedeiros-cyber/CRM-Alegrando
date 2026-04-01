import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import type { LeadMessage } from "@/lib/actions/leads";

export function useLeadMessages(telefone: string) {
    const [messages, setMessages] = useState<LeadMessage[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;

        async function fetchInitial() {
            try {
                setLoading(true);
                // Busca inicial via server action (ainda usa leadId internamente por enquanto)
                // TODO: refatorar getLeadMessages para aceitar telefone quando o backend estiver pronto
                const data = await getLeadMessagesByPhone(telefone);
                if (isMounted) {
                    setMessages(data);
                }
            } catch (err) {
                console.error("[messages] Erro ao carregar mensagens:", err);
            } finally {
                if (isMounted) setLoading(false);
            }
        }

        fetchInitial();

        // Inscreve no Supabase Realtime para a tabela messages filtrado pelo telefone
        const channel = supabase
            .channel(`public:messages:telefone_${telefone}`)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "messages",
                    filter: `telefone=eq.${telefone}`,
                },
                (payload) => {
                    const newMsg = payload.new;
                    const formattedMsg: LeadMessage = {
                        id: newMsg.id,
                        senderType: newMsg.sender_type,
                        senderName: newMsg.sender_name,
                        content: newMsg.content,
                        mediaType: newMsg.media_type || "text",
                        createdAt: newMsg.created_at ? new Date(newMsg.created_at) : null,
                        createdBy: newMsg.created_by ?? null,
                    };

                    if (isMounted) {
                        setMessages((prev) => {
                            if (prev.some(m => m.id === formattedMsg.id)) return prev;

                            // Remove optimistic placeholder when the real humano message arrives
                            let base = prev;
                            if (formattedMsg.senderType === "humano") {
                                const sixtySecondsAgo = Date.now() - 60000;
                                const fiveSecondsAgo = Date.now() - 5000;

                                // Evita duplicata: CRM salva direto (created_by != null) e o
                                // webhook fromMe do ZAPI pode chegar logo depois (created_by = null).
                                // Se já existe "humano" com mesmo conteúdo nos últimos 60s, descarta.
                                const isDuplicate = prev.some(m => {
                                    if (m.id.startsWith("optimistic-")) return false;
                                    if (m.senderType !== "humano") return false;
                                    if (m.content !== formattedMsg.content) return false;
                                    const msgTime = m.createdAt ? new Date(m.createdAt).getTime() : 0;
                                    return msgTime > sixtySecondsAgo;
                                });
                                if (isDuplicate) return prev;

                                base = prev.filter(m => {
                                    if (!m.id.startsWith("optimistic-")) return true;
                                    if (m.content !== formattedMsg.content) return true;
                                    const ts = parseInt(m.id.replace("optimistic-", ""), 10);
                                    return ts < fiveSecondsAgo;
                                });
                            }

                            const next = [...base, formattedMsg].sort((a, b) => {
                                const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                                const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                                return dateA - dateB;
                            });
                            return next;
                        });
                    }
                }
            )
            .subscribe();

        return () => {
            isMounted = false;
            supabase.removeChannel(channel);
        };
    }, [telefone]);

    const addOptimisticMessage = useCallback((content: string) => {
        const optimistic: LeadMessage = {
            id: `optimistic-${Date.now()}`,
            senderType: "humano",
            senderName: "Alegrando",
            content,
            mediaType: "text",
            createdAt: new Date(),
            createdBy: "optimistic",
            _optimistic: true,
        };
        setMessages((prev) => [...prev, optimistic]);
    }, []);

    return { messages, loading, addOptimisticMessage };
}

/**
 * Busca mensagens diretamente pelo telefone via Supabase client (SELECT only).
 */
async function getLeadMessagesByPhone(telefone: string): Promise<LeadMessage[]> {
    const { data, error } = await supabase
        .from("messages")
        .select("id, sender_type, sender_name, content, media_type, created_at, created_by")
        .eq("telefone", telefone)
        .order("created_at", { ascending: true });

    if (error) {
        return [];
    }

    return (data || []).map((row: Record<string, unknown>) => ({
        id: row.id as string,
        senderType: row.sender_type as string,
        senderName: (row.sender_name as string) || null,
        content: row.content as string,
        mediaType: (row.media_type as "text" | "audio" | "image" | "document") || "text",
        createdAt: row.created_at ? new Date(row.created_at as string) : null,
        createdBy: (row.created_by as string) ?? null,
    }));
}
