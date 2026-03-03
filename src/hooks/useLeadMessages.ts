import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getLeadMessages, type LeadMessage } from "@/lib/actions/leads";

export function useLeadMessages(leadId: string) {
    const [messages, setMessages] = useState<LeadMessage[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;

        async function fetchInitial() {
            try {
                setLoading(true);
                const data = await getLeadMessages(leadId);
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

        // Inscreve no Supabase Realtime para a tabela messages filtrado pelo leadId
        const channel = supabase
            .channel(`public:messages:lead_${leadId}`)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "messages",
                    filter: `lead_id=eq.${leadId}`,
                },
                (payload) => {
                    const newMsg = payload.new;
                    // Format payload into LeadMessage structure
                    const formattedMsg: LeadMessage = {
                        id: newMsg.id,
                        senderType: newMsg.sender_type,
                        senderName: newMsg.sender_name,
                        content: newMsg.content,
                        createdAt: newMsg.created_at ? new Date(newMsg.created_at) : null,
                    };

                    if (isMounted) {
                        setMessages((prev) => {
                            // verify uniqueness to avoid double insert
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
    }, [leadId]);

    return { messages, loading };
}
