"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

// =============================================
// TYPES
// =============================================

/** Item da lista lateral de conversas */
export type ClienteListItem = {
    telefone: string;
    nome: string | null;
    email: string | null;
    status: string | null;
    statusAtendimento: string | null;
    iaAtiva: boolean;
    unreadCount: number;
    lastMessageAt: Date | null;
    createdAt: Date | null;
};

/** Detalhe completo do cliente selecionado */
export type ClienteDetail = {
    telefone: string;
    nome: string | null;
    status: string | null;
    cpf: string | null;
    email: string | null;
    statusAtendimento: string | null;
    linkedin: string | null;
    facebook: string | null;
    instagram: string | null;
    iaAtiva: boolean;
    kanbanColumnId: string | null;
    kanbanPosition: number | null;
    lastSeenAt: Date | null;
    createdAt: Date | null;
};

/** Mensagem individual do chat */
export type LeadMessage = {
    id: string;
    senderType: string;
    senderName: string | null;
    content: string;
    mediaType: "text" | "audio" | "image" | null;
    createdAt: Date | null;
};

// =============================================
// QUERIES
// =============================================

/**
 * Lista clientes da tabela Clientes _WhatsApp com paginação.
 * Ordenados por created_at DESC (mais recentes primeiro).
 */
export async function listClientes(params?: {
    search?: string;
    page?: number;
    limit?: number;
}): Promise<{ data: ClienteListItem[]; total: number }> {
    const supabase = createServerSupabaseClient();
    const search = params?.search?.trim();
    const page = params?.page ?? 1;
    const limit = params?.limit ?? 50;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // 1. Buscar clientes com contagem total
    let query = supabase
        .from("Clientes _WhatsApp")
        .select("telefone, nome, email, status, status_atendimento, ia_ativa, last_seen_at, created_at", { count: "exact" })
        .order("created_at", { ascending: false });

    if (search) {
        query = query.ilike("nome", `%${search}%`);
    }

    const { data: clients, error: clientsError, count } = await query.range(from, to);

    if (clientsError || !clients || clients.length === 0) return { data: [], total: count || 0 };

    // 2. Buscar mensagens dos telefones retornados para calcular lastMessageAt e unreadCount
    const telefones = clients.map(c => c.telefone);
    const { data: msgs } = await supabase
        .from("messages")
        .select("telefone, sender_type, created_at")
        .in("telefone", telefones)
        .order("created_at", { ascending: false });

    // 3. Calcular lastMessageAt e unreadCount no JS
    const lastMessageMap = new Map<string, Date>();
    const unreadCountMap = new Map<string, number>();

    const lastSeenMap = new Map<string, Date | null>();
    for (const c of clients) {
        lastSeenMap.set(String(c.telefone), c.last_seen_at ? new Date(c.last_seen_at) : null);
    }

    for (const msg of msgs || []) {
        const tel = String(msg.telefone);
        const msgDate = msg.created_at ? new Date(msg.created_at) : null;

        if (msgDate) {
            const current = lastMessageMap.get(tel);
            if (!current || msgDate > current) {
                lastMessageMap.set(tel, msgDate);
            }
        }

        if (msg.sender_type === "cliente" && msgDate) {
            const lastSeen = lastSeenMap.get(tel);
            if (!lastSeen || msgDate > lastSeen) {
                unreadCountMap.set(tel, (unreadCountMap.get(tel) || 0) + 1);
            }
        }
    }

    // 4. Mapear para ClienteListItem
    const mapped: ClienteListItem[] = clients.map(c => ({
        telefone: String(c.telefone),
        nome: c.nome,
        email: c.email,
        status: c.status,
        statusAtendimento: c.status_atendimento,
        iaAtiva: c.ia_ativa ?? true,
        unreadCount: unreadCountMap.get(String(c.telefone)) || 0,
        lastMessageAt: lastMessageMap.get(String(c.telefone)) || null,
        createdAt: c.created_at ? new Date(c.created_at) : null,
    }));

    return { data: mapped, total: count || 0 };
}

/**
 * Marca as mensagens de um cliente como lidas (atualiza lastSeenAt).
 */
export async function markAsRead(telefone: string): Promise<void> {
    const supabase = createServerSupabaseClient();
    await supabase
        .from("Clientes _WhatsApp")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("telefone", telefone);
}

/**
 * Busca um cliente pelo telefone.
 */
export async function getClienteByTelefone(telefone: string): Promise<ClienteDetail | null> {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
        .from("Clientes _WhatsApp")
        .select("*")
        .eq("telefone", telefone)
        .maybeSingle();

    if (error || !data) return null;

    return {
        telefone: String(data.telefone),
        nome: data.nome,
        status: data.status,
        cpf: data.cpf,
        email: data.email,
        statusAtendimento: data.status_atendimento,
        linkedin: data.linkedin,
        facebook: data.facebook,
        instagram: data.instagram,
        iaAtiva: data.ia_ativa ?? true,
        kanbanColumnId: data.kanban_column_id,
        kanbanPosition: data.kanban_position,
        lastSeenAt: data.last_seen_at ? new Date(data.last_seen_at) : null,
        createdAt: data.created_at ? new Date(data.created_at) : null,
    };
}

/**
 * Atualiza ia_ativa do cliente.
 */
export async function toggleIaAtiva(telefone: string, iaAtiva: boolean) {
    const supabase = createServerSupabaseClient();
    await supabase
        .from("Clientes _WhatsApp")
        .update({ ia_ativa: iaAtiva })
        .eq("telefone", telefone);

    return { success: true, iaAtiva };
}

/**
 * Atualiza dados do cliente.
 */
export async function updateCliente(
    telefone: string,
    data: {
        nome?: string | null;
        status?: string | null;
        cpf?: string | null;
        email?: string | null;
        statusAtendimento?: string | null;
        linkedin?: string | null;
        facebook?: string | null;
        instagram?: string | null;
        kanbanColumnId?: string | null;
        kanbanPosition?: number;
    }
) {
    const supabase = createServerSupabaseClient();

    const updateData: Record<string, unknown> = {};
    if (data.nome !== undefined) updateData.nome = data.nome;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.cpf !== undefined) updateData.cpf = data.cpf;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.statusAtendimento !== undefined) updateData.status_atendimento = data.statusAtendimento;
    if (data.linkedin !== undefined) updateData.linkedin = data.linkedin;
    if (data.facebook !== undefined) updateData.facebook = data.facebook;
    if (data.instagram !== undefined) updateData.instagram = data.instagram;
    if (data.kanbanColumnId !== undefined) updateData.kanban_column_id = data.kanbanColumnId;
    if (data.kanbanPosition !== undefined) updateData.kanban_position = data.kanbanPosition;

    await supabase
        .from("Clientes _WhatsApp")
        .update(updateData)
        .eq("telefone", telefone);

    return { success: true };
}

/**
 * Busca os destinos únicos disponíveis na tabela documents.
 */
export async function getAvailableDestinations(): Promise<string[]> {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
        .from("documents")
        .select("tipo_passeio")
        .not("tipo_passeio", "is", null)
        .order("tipo_passeio", { ascending: true });

    if (error || !data) return [];

    const unique = [...new Set(
        data
            .map(r => r.tipo_passeio as string)
            .filter(v => v && v.trim() !== "")
    )];
    return unique.sort();
}
