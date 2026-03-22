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
    ultimoPasseio: string | null;
    followupDias: number;
    followupHora: string;
    followupAtivo: boolean;
    followupEnviado: boolean;
    followupEnviadoEm: string | null;
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
        ultimoPasseio: data.ultimo_passeio || null,
        followupDias: data.followup_dias ?? 45,
        followupHora: data.followup_hora || "09:00",
        followupAtivo: data.followup_ativo ?? false,
        followupEnviado: data.followup_enviado ?? false,
        followupEnviadoEm: data.followup_enviado_em || null,
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
        ultimoPasseio?: string | null;
        followupDias?: number;
        followupHora?: string;
        followupAtivo?: boolean;
        followupEnviado?: boolean;
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
    if (data.ultimoPasseio !== undefined) updateData.ultimo_passeio = data.ultimoPasseio;
    if (data.followupDias !== undefined) updateData.followup_dias = data.followupDias;
    if (data.followupHora !== undefined) updateData.followup_hora = data.followupHora;
    if (data.followupAtivo !== undefined) {
        updateData.followup_ativo = data.followupAtivo;
        // ao desativar follow-up, reseta o flag e o timestamp de enviado
        if (data.followupAtivo === false) {
            updateData.followup_enviado = false;
            updateData.followup_enviado_em = null;
        }
    }
    if (data.followupEnviado !== undefined) updateData.followup_enviado = data.followupEnviado;

    await supabase
        .from("Clientes _WhatsApp")
        .update(updateData)
        .eq("telefone", telefone);

    return { success: true };
}

/**
 * Envia follow-up manual para um lead específico.
 */
export async function sendManualFollowup(telefone: string): Promise<{ success: boolean; type: string; error?: string }> {
    const supabase = createServerSupabaseClient();

    const { data: lead, error } = await supabase
        .from("Clientes _WhatsApp")
        .select("telefone, nome, ultimo_passeio, followup_dias, followup_enviado, followup_ativo")
        .eq("telefone", telefone)
        .maybeSingle();

    if (error || !lead) {
        return { success: false, type: "none", error: "Lead não encontrado" };
    }

    if (!lead.ultimo_passeio) {
        return { success: false, type: "none", error: "Lead sem data de último passeio" };
    }

    const nome = lead.nome || "Olá";
    const tel = String(lead.telefone);

    const { sendWhatsAppMessage } = await import("@/lib/whatsapp/sender");
    const googleReviewLink = process.env.GOOGLE_REVIEW_LINK || "https://g.page/alegrando";

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const ultimoPasseio = new Date(lead.ultimo_passeio);
    ultimoPasseio.setHours(0, 0, 0, 0);
    const diffMs = hoje.getTime() - ultimoPasseio.getTime();
    const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    let mensagem: string;
    let tipo: string;

    if (diffDias <= 1) {
        tipo = "avaliacao";
        mensagem = `Olá ${nome}! 😊\n\nEsperamos que o passeio tenha sido incrível para todos!\n\nSe puder, deixa uma avaliação pra gente no Google — ajuda muito a Alegrando a levar mais crianças a experiências incríveis! 🌟\n\n${googleReviewLink}`;
    } else {
        tipo = "followup";
        mensagem = `Olá ${nome}! 🌟\n\nO nosso último passeio foi incrível né? As crianças adoraram!\n\nQue tal já começarmos a planejar a próxima aventura? Temos destinos incríveis esperando pelos pequenos. 🚌\n\nSe quiser, a gente monta um novo roteiro — é só falar! 😊`;
    }

    const result = await sendWhatsAppMessage(tel, mensagem);

    if (!result.success) {
        return { success: false, type: tipo, error: result.error };
    }

    await supabase.from("messages").insert({
        telefone: lead.telefone,
        sender_type: "humano",
        sender_name: "Alegrando",
        content: mensagem,
    });

    await supabase
        .from("Clientes _WhatsApp")
        .update({
            followup_enviado: true,
            followup_enviado_em: new Date().toISOString(),
        })
        .eq("telefone", telefone);

    return { success: true, type: tipo };
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

// =============================================
// HISTÓRICO DE PASSEIOS
// =============================================

export type PasseioHistorico = {
    id: string;
    telefone: string;
    destino: string;
    dataPaseio: string;
    createdAt: string;
};

/**
 * Lista passeios do histórico de um lead.
 */
export async function getPasseiosHistorico(telefone: string): Promise<PasseioHistorico[]> {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
        .from("passeios_historico")
        .select("*")
        .eq("telefone", telefone)
        .order("data_passeio", { ascending: false });

    if (error || !data) return [];

    return data.map(p => ({
        id: p.id,
        telefone: String(p.telefone),
        destino: p.destino,
        dataPaseio: p.data_passeio,
        createdAt: p.created_at,
    }));
}

/**
 * Adiciona um passeio ao histórico e atualiza ultimo_passeio se for o mais recente.
 */
export async function addPasseioHistorico(
    telefone: string,
    destino: string,
    dataPaseio: string
): Promise<PasseioHistorico | null> {
    const supabase = createServerSupabaseClient();

    // 1. Inserir no histórico
    const { data, error } = await supabase
        .from("passeios_historico")
        .insert({ telefone, destino, data_passeio: dataPaseio })
        .select("*")
        .single();

    if (error || !data) return null;

    // 2. Verificar se é o mais recente e atualizar ultimo_passeio
    const { data: maisRecente } = await supabase
        .from("passeios_historico")
        .select("data_passeio")
        .eq("telefone", telefone)
        .order("data_passeio", { ascending: false })
        .limit(1)
        .single();

    if (maisRecente) {
        await supabase
            .from("Clientes _WhatsApp")
            .update({ ultimo_passeio: maisRecente.data_passeio })
            .eq("telefone", telefone);
    }

    return {
        id: data.id,
        telefone: String(data.telefone),
        destino: data.destino,
        dataPaseio: data.data_passeio,
        createdAt: data.created_at,
    };
}

/**
 * Remove um passeio do histórico e recalcula ultimo_passeio.
 */
export async function deletePasseioHistorico(id: string, telefone: string): Promise<{ success: boolean }> {
    const supabase = createServerSupabaseClient();

    await supabase.from("passeios_historico").delete().eq("id", id);

    // Recalcular ultimo_passeio
    const { data: maisRecente } = await supabase
        .from("passeios_historico")
        .select("data_passeio")
        .eq("telefone", telefone)
        .order("data_passeio", { ascending: false })
        .limit(1)
        .maybeSingle();

    await supabase
        .from("Clientes _WhatsApp")
        .update({ ultimo_passeio: maisRecente?.data_passeio || null })
        .eq("telefone", telefone);

    return { success: true };
}
