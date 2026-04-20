import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import type { LeadMessage } from "@/lib/actions/leads";

export function useLeadMessages(telefone: string) {
    const [messages, setMessages] = useState<LeadMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [hasMore, setHasMore] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const oldestCreatedAt = useRef<string | null>(null);

    useEffect(() => {
        let isMounted = true;
        setMessages([]);
        setHasMore(false);
        oldestCreatedAt.current = null;

        async function fetchInitial() {
            try {
                setLoading(true);
                const { data, error } = await fetchMessagePage(telefone, null);
                if (isMounted && !error && data) {
                    if (data.length === 100) {
                        setHasMore(true);
                        oldestCreatedAt.current = data[data.length - 1].created_at as string;
                    } else {
                        setHasMore(false);
                    }
                    setMessages(mapRows(data).reverse());
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
                    event: "UPDATE",
                    schema: "public",
                    table: "messages",
                    filter: `telefone=eq.${telefone}`,
                },
                (payload) => {
                    const updated = payload.new;
                    const meta = updated.metadata as Record<string, unknown> | null;
                    if (isMounted) {
                        setMessages((prev) =>
                            prev.map((m) =>
                                m.id === updated.id
                                    ? {
                                        ...m,
                                        content: updated.content as string,
                                        // updated.reactions pode chegar como null quando o DB tem '{}'
                        // Não usar ?? aqui — se null, significa reações removidas (usar {})
                        reactions: (() => {
                            const incoming = updated.reactions != null
                                ? (updated.reactions as Record<string, string[]>)
                                : {};
                            const currentReactions = m.reactions ?? {};
                            const hasLocalReactions = Object.keys(currentReactions).length > 0;
                            const incomingIsEmpty = Object.keys(incoming).length === 0;
                            if (hasLocalReactions && incomingIsEmpty) return currentReactions;
                            return incoming;
                        })(),
                                        pinned: updated.pinned === true,
                                        zapiMessageId: (meta?.messageId as string) ?? m.zapiMessageId,
                                    }
                                    : m
                            )
                        );
                    }
                }
            )
            .on(
                "postgres_changes",
                {
                    event: "DELETE",
                    schema: "public",
                    table: "messages",
                    filter: `telefone=eq.${telefone}`,
                },
                (payload) => {
                    const deleted = payload.old;
                    if (isMounted && deleted?.id) {
                        setMessages((prev) => prev.filter((m) => m.id !== deleted.id));
                    }
                }
            )
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
                    const meta = newMsg.metadata as Record<string, unknown> | null;
                    const formattedMsg: LeadMessage = {
                        id: newMsg.id,
                        senderType: newMsg.sender_type,
                        senderName: newMsg.sender_name,
                        content: newMsg.content,
                        mediaType: newMsg.media_type || "text",
                        createdAt: newMsg.created_at ? new Date(newMsg.created_at) : null,
                        createdBy: newMsg.created_by ?? null,
                        zapiMessageId: (meta?.messageId as string) ?? null,
                        reactions: (newMsg.reactions as Record<string, string[]>) ?? {},
                        pinned: newMsg.pinned === true,
                        replyTo: (meta?.replyTo as { content: string; senderName: string | null }) ?? null,
                    };

                    if (isMounted) {
                        setMessages((prev) => {
                            if (prev.some(m => m.id === formattedMsg.id)) return prev;

                            // Remove optimistic placeholder when the real equipe/humano message arrives.
                            // "equipe" = mensagem enviada pela equipe (via CRM ou celular físico).
                            let base = prev;
                            const isTeamMessage = formattedMsg.senderType === "equipe" || formattedMsg.senderType === "humano";
                            if (isTeamMessage) {
                                const sixtySecondsAgo = Date.now() - 60000;
                                const fiveSecondsAgo = Date.now() - 5000;

                                // Evita duplicata: CRM salva direto (created_by != null) e o
                                // webhook fromMe do ZAPI pode chegar logo depois (created_by = null).
                                // Se já existe mensagem de equipe/humano com mesmo conteúdo nos últimos 60s, descarta.
                                const isDuplicate = prev.some(m => {
                                    if (m.id.startsWith("optimistic-")) return false;
                                    if (m.senderType !== formattedMsg.senderType) return false;
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

    const loadOlder = useCallback(async () => {
        if (!hasMore || loadingMore || !oldestCreatedAt.current) return;
        setLoadingMore(true);
        try {
            const { data, error } = await fetchMessagePage(telefone, oldestCreatedAt.current);
            if (!error && data) {
                const mapped = mapRows(data).reverse();
                setMessages((prev) => [...mapped, ...prev]);
                if (data.length === 100) {
                    oldestCreatedAt.current = data[data.length - 1].created_at as string;
                } else {
                    setHasMore(false);
                    oldestCreatedAt.current = null;
                }
            }
        } finally {
            setLoadingMore(false);
        }
    }, [telefone, hasMore, loadingMore]);

    const addOptimisticMessage = useCallback((content: string, senderName?: string) => {
        const optimistic: LeadMessage = {
            id: `optimistic-${Date.now()}`,
            senderType: "equipe",
            senderName: senderName ?? "Alegrando",
            content,
            mediaType: "text",
            createdAt: new Date(),
            createdBy: "optimistic",
            _optimistic: true,
        };
        setMessages((prev) => [...prev, optimistic]);
    }, []);

    /** Atualiza campos de uma mensagem na UI imediatamente (optimistic). */
    const updateMessageById = useCallback((id: string, updates: Partial<LeadMessage>) => {
        setMessages((prev) => prev.map((m) => m.id === id ? { ...m, ...updates } : m));
    }, []);

    /** Remove uma mensagem da UI imediatamente (optimistic). */
    const removeMessageById = useCallback((id: string) => {
        setMessages((prev) => prev.filter((m) => m.id !== id));
    }, []);

    return { messages, loading, hasMore, loadingMore, loadOlder, addOptimisticMessage, updateMessageById, removeMessageById };
}

/**
 * Mapeia uma linha do banco para LeadMessage.
 */
function mapRows(rows: Record<string, unknown>[]): LeadMessage[] {
    return rows.map((row) => {
        const meta = row.metadata as Record<string, unknown> | null;
        return {
            id: row.id as string,
            senderType: row.sender_type as string,
            senderName: (row.sender_name as string) || null,
            content: row.content as string,
            mediaType: (row.media_type as "text" | "audio" | "image" | "document" | "video" | "sticker" | "location" | "contact") || "text",
            createdAt: row.created_at ? new Date(row.created_at as string) : null,
            createdBy: (row.created_by as string) ?? null,
            zapiMessageId: (meta?.messageId as string) ?? null,
            reactions: (row.reactions as Record<string, string[]>) ?? {},
            pinned: row.pinned === true,
            replyTo: (meta?.replyTo as { content: string; senderName: string | null }) ?? null,
        };
    });
}

/**
 * Busca uma página de 100 mensagens, opcionalmente antes de `before` (ISO string).
 * Retorna rows brutas (ordem descendente do servidor) para inspecionar created_at.
 */
async function fetchMessagePage(telefone: string, before: string | null) {
    let query = supabase
        .from("messages")
        .select("id, sender_type, sender_name, content, media_type, created_at, created_by, metadata, pinned, reactions")
        .eq("telefone", telefone)
        .order("created_at", { ascending: false })
        .limit(100);

    if (before) {
        query = query.lt("created_at", before);
    }

    return query;
}
