import { useEffect, useState } from "react";
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
            } catch (error) {
                console.error("Erro ao carregar historico de mensagens:", error);
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
                        createdAt: newMsg.created_at ? new Date(newMsg.created_at) : null,
                    };

                    if (isMounted) {
                        setMessages((prev) => {
                            if (prev.some(m => m.id === formattedMsg.id)) return prev;
                            const next = [...prev, formattedMsg].sort((a, b) => {
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

    return { messages, loading };
}

/**
 * Busca mensagens diretamente pelo telefone via Supabase client (SELECT only).
 */
async function getLeadMessagesByPhone(telefone: string): Promise<LeadMessage[]> {
    const { data, error } = await supabase
        .from("messages")
        .select("id, sender_type, sender_name, content, created_at")
        .eq("telefone", telefone)
        .order("created_at", { ascending: true });

    if (error) {
        console.error("Erro ao buscar mensagens por telefone:", error);
        return [];
    }

    return (data || []).map((row: Record<string, unknown>) => ({
        id: row.id as string,
        senderType: row.sender_type as string,
        senderName: (row.sender_name as string) || null,
        content: row.content as string,
        createdAt: row.created_at ? new Date(row.created_at as string) : null,
    }));
}
