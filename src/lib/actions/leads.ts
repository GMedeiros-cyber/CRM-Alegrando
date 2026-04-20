"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { z } from "zod";
import { getSetting } from "@/lib/actions/settings";
import { applyPlaceholders } from "@/lib/settings_helper";

// =============================================
// VALIDATION SCHEMAS
// =============================================

const updateClienteSchema = z.object({
    nome: z.string().max(255).nullable().optional(),
    status: z.string().max(50).nullable().optional(),
    cpf: z.string().max(14).nullable().optional(),
    email: z.string().max(255).nullable().optional(),
    statusAtendimento: z.string().max(100).nullable().optional(),
    linkedin: z.string().max(500).nullable().optional(),
    facebook: z.string().max(500).nullable().optional(),
    instagram: z.string().max(500).nullable().optional(),
    kanbanColumnId: z.string().uuid().nullable().optional(),
    kanbanPosition: z.number().int().min(0).optional(),
    ultimoPasseio: z.string().max(20).nullable().optional(),
    followupDias: z.number().int().min(1).max(365).optional(),
    followupHora: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    followupAtivo: z.boolean().optional(),
    followupEnviado: z.boolean().optional(),
    posPasseioAtivo: z.boolean().optional(),
    posPasseioEnviado: z.boolean().optional(),
    endereco: z.string().max(500).nullable().optional(),
    responsavel: z.string().max(200).nullable().optional(),
    segundoNumero: z.string().max(20).nullable().optional(),
}).strict();

const createClienteSchema = z.object({
    telefone: z.string().min(8).max(20),
    nome: z.string().max(200).nullable(),
    fotoUrl: z.string().url().nullable().optional(),
    canal: z.enum(["alegrando", "festas"]).optional(),
    responsavel: z.string().max(200).nullable().optional(),
});

/** Normaliza telefone BR: retorna sempre com prefixo 55, ou throw se
    fora do padrão. Aceita 10 ou 11 dígitos sem 55 (DDD+numero) e
    12 ou 13 dígitos com 55. */
function normalizeTelefoneBR(telefoneRaw: string): string {
    const digits = telefoneRaw.replace(/\D/g, "");
    let withPrefix: string;
    if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
        withPrefix = digits;
    } else if (!digits.startsWith("55") && (digits.length === 10 || digits.length === 11)) {
        withPrefix = `55${digits}`;
    } else {
        throw new Error(
            `Telefone inválido: "${telefoneRaw}". Use DDD + número (ex: 11987654321).`
        );
    }
    return withPrefix;
}

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
    fotoUrl: string | null;
    canal: string;
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
    posPasseioAtivo: boolean;
    posPasseioEnviado: boolean;
    posPasseioEnviadoEm: string | null;
    fotoUrl: string | null;
    endereco: string | null;
    canal: string;
    responsavel: string | null;
    segundoNumero: string | null;
};

/** Mensagem individual do chat */
export type LeadMessage = {
    id: string;
    senderType: string;
    senderName: string | null;
    content: string;
    mediaType: "text" | "audio" | "image" | "document" | null;
    createdAt: Date | null;
    createdBy?: string | null;
    zapiMessageId?: string | null;
    reactions?: Record<string, string[]>;
    pinned?: boolean;
    replyTo?: { content: string; senderName: string | null } | null;
    _optimistic?: boolean;
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
    canal?: string;
}): Promise<{ data: ClienteListItem[]; total: number }> {
    await requireAuth();
    const supabase = createServerSupabaseClient();
    const search = params?.search?.trim();
    const page = params?.page ?? 1;
    const limit = params?.limit ?? 50;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // 1. Buscar clientes com contagem total
    // IMPORTANTE: order() e range() DEVEM vir após os filtros eq/ilike
    // para paginação correta com canal filter
    let query = supabase
        .from("Clientes _WhatsApp")
        .select("telefone, nome, email, status, status_atendimento, ia_ativa, last_seen_at, created_at, foto_url, canal", { count: "exact" });

    if (search) {
        query = query.ilike("nome", `%${search}%`);
    }

    if (params?.canal && params.canal !== "todos") {
        query = query.eq("canal", params.canal);
    }

    const { data: clients, error: clientsError, count } = await query
        .order("created_at", { ascending: false })
        .range(from, to);

    // PGRST103 = range além dos limites — tratar como lista vazia mas manter total
    if (clientsError) {
        const supaErr = clientsError as { code?: string };
        if (supaErr.code === "PGRST103") return { data: [], total: count || 0 };
        console.error("[listClientes] Erro:", clientsError.message);
        return { data: [], total: 0 };
    }
    if (!clients || clients.length === 0) return { data: [], total: count || 0 };

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
        fotoUrl: (c.foto_url as string) || null,
        canal: (c.canal as string) || "alegrando",
    }));

    return { data: mapped, total: count || 0 };
}

/**
 * Marca as mensagens de um cliente como lidas (atualiza lastSeenAt).
 */
export async function markAsRead(telefone: string): Promise<void> {
    await requireAuth();
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
    await requireAuth();
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
        posPasseioAtivo: data.pos_passeio_ativo ?? false,
        posPasseioEnviado: data.pos_passeio_enviado ?? false,
        posPasseioEnviadoEm: data.pos_passeio_enviado_em || null,
        fotoUrl: data.foto_url || null,
        endereco: data.endereco || null,
        canal: (data.canal as string) || "alegrando",
        responsavel: data.responsavel || null,
        segundoNumero: data.segundo_numero || null,
    };
}

/**
 * Atualiza ia_ativa do cliente.
 */
export async function toggleIaAtiva(telefone: string, iaAtiva: boolean) {
    await requireAuth();
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
        posPasseioAtivo?: boolean;
        posPasseioEnviado?: boolean;
        endereco?: string | null;
        responsavel?: string | null;
        segundoNumero?: string | null;
    }
) {
    const userId = await requireAuth();
    const parsed = updateClienteSchema.parse(data);
    const supabase = createServerSupabaseClient();

    const updateData: Record<string, unknown> = { updated_by: userId };
    if (parsed.nome !== undefined) updateData.nome = parsed.nome;
    if (parsed.status !== undefined) updateData.status = parsed.status;
    if (parsed.cpf !== undefined) updateData.cpf = parsed.cpf;
    if (parsed.email !== undefined) updateData.email = parsed.email;
    if (parsed.statusAtendimento !== undefined) updateData.status_atendimento = parsed.statusAtendimento;
    if (parsed.linkedin !== undefined) updateData.linkedin = parsed.linkedin;
    if (parsed.facebook !== undefined) updateData.facebook = parsed.facebook;
    if (parsed.instagram !== undefined) updateData.instagram = parsed.instagram;
    if (parsed.kanbanColumnId !== undefined) updateData.kanban_column_id = parsed.kanbanColumnId;
    if (parsed.kanbanPosition !== undefined) updateData.kanban_position = parsed.kanbanPosition;
    if (parsed.ultimoPasseio !== undefined) updateData.ultimo_passeio = parsed.ultimoPasseio;
    if (parsed.followupDias !== undefined) updateData.followup_dias = parsed.followupDias;
    if (parsed.followupHora !== undefined) updateData.followup_hora = parsed.followupHora;
    if (parsed.followupAtivo !== undefined) {
        updateData.followup_ativo = parsed.followupAtivo;
        // ao desativar follow-up, reseta o flag e o timestamp de enviado
        if (parsed.followupAtivo === false) {
            updateData.followup_enviado = false;
            updateData.followup_enviado_em = null;
        }
    }
    if (parsed.followupEnviado !== undefined) updateData.followup_enviado = parsed.followupEnviado;

    if (parsed.posPasseioAtivo !== undefined) {
        updateData.pos_passeio_ativo = parsed.posPasseioAtivo;
        if (parsed.posPasseioAtivo === false) {
            updateData.pos_passeio_enviado = false;
            updateData.pos_passeio_enviado_em = null;
        }
    }
    if (parsed.posPasseioEnviado !== undefined) updateData.pos_passeio_enviado = parsed.posPasseioEnviado;
    if (parsed.endereco !== undefined) updateData.endereco = parsed.endereco;
    if (parsed.responsavel !== undefined) updateData.responsavel = parsed.responsavel;
    if (parsed.segundoNumero !== undefined) updateData.segundo_numero = parsed.segundoNumero;

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
    await requireAuth();
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

    let tipo: string;
    let mensagem: string;
    if (diffDias <= 1) {
        tipo = "avaliacao";
        const template = await getSetting("avaliacao_mensagem");
        mensagem = applyPlaceholders(template, { nome, link_google: googleReviewLink });
    } else {
        tipo = "followup";
        const template = await getSetting("followup_mensagem");
        mensagem = applyPlaceholders(template, { nome, link_google: googleReviewLink });
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
    await requireAuth();
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
    await requireAuth();
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
    await requireAuth();
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
    await requireAuth();
    const supabase = createServerSupabaseClient();

    await supabase.from("passeios_historico")
        .delete()
        .eq("id", id)
        .eq("telefone", telefone);

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

/**
 * Envia mensagem manual de pós-passeio com link para as fotos e atualiza o flag.
 */
export async function sendPosPasseio(
    leadId: string,
    link: string
): Promise<{ success: boolean; error?: string }> {
    await requireAuth();
    const supabase = createServerSupabaseClient();

    const { data: lead, error } = await supabase
        .from("Clientes _WhatsApp")
        .select("*")
        .eq("telefone", leadId)
        .maybeSingle();

    if (error || !lead) {
        return { success: false, error: "Cliente não encontrado" };
    }

    const template = await getSetting("pos_passeio_mensagem") ??
        "Olá {nome}! 🎉 Foi um prazer ter você no passeio! {link}";

    const mensagem = template
        .replace("{nome}", lead.nome ?? "")
        .replace("{link}", link);

    const tel = String(lead.telefone);
    const { sendWhatsAppMessage } = await import("@/lib/whatsapp/sender");

    const result = await sendWhatsAppMessage(tel, mensagem);

    if (result.success) {
        await supabase.from("messages").insert({
            telefone: tel,
            sender_type: "humano",
            sender_name: "Alegrando",
            content: mensagem,
        });

        await supabase
            .from("Clientes _WhatsApp")
            .update({
                pos_passeio_enviado: true,
                pos_passeio_enviado_em: new Date().toISOString(),
            })
            .eq("telefone", tel);

        return { success: true };
    }

    return { success: false, error: result.error || "Erro ao enviar via WhatsApp" };
}

/**
 * Cria um novo lead na tabela Clientes_WhatsApp.
 */
export async function createCliente(data: {
    telefone: string;
    nome: string | null;
    fotoUrl?: string | null;
    canal?: string;
    responsavel?: string | null;
}): Promise<{ success: boolean }> {
    await requireAuth();

    const parsed = createClienteSchema.parse({
        telefone: data.telefone,
        nome: data.nome,
        fotoUrl: data.fotoUrl ?? null,
        canal: data.canal,
        responsavel: data.responsavel ?? null,
    });

    const telefoneCompleto = normalizeTelefoneBR(parsed.telefone);
    const telefoneCurto = telefoneCompleto.slice(2);

    const supabase = createServerSupabaseClient();

    const { data: existing } = await supabase
        .from("Clientes _WhatsApp")
        .select("telefone")
        .or(`telefone.eq.${telefoneCompleto},telefone.eq.${telefoneCurto}`)
        .maybeSingle();

    if (existing) {
        throw new Error("Lead já existe com este telefone");
    }

    const canalLead = parsed.canal || "alegrando";
    const { data: primeiraColuna } = await supabase
        .from("kanban_columns")
        .select("id")
        .eq("canal", canalLead)
        .order("position", { ascending: true })
        .limit(1)
        .maybeSingle();

    const { error } = await supabase.from("Clientes _WhatsApp").insert({
        telefone: telefoneCompleto,
        nome: parsed.nome || null,
        ia_ativa: canalLead === "festas" ? false : true,
        status_atendimento: "novo",
        foto_url: parsed.fotoUrl || null,
        kanban_column_id: primeiraColuna?.id || null,
        canal: canalLead,
        ...(parsed.responsavel ? { responsavel: parsed.responsavel } : {}),
    });

    if (error) throw new Error(error.message);
    return { success: true };
}

export async function deleteCliente(telefone: string): Promise<{ success: boolean; error?: string }> {
    await requireAuth();
    const supabase = createServerSupabaseClient();

    try {
        await supabase.from("lead_tasks").delete().eq("telefone", telefone);
        await supabase.from("passeios_historico").delete().eq("telefone", telefone);
        await supabase.from("messages").delete().eq("telefone", telefone);
        await supabase.from("Clientes _WhatsApp").delete().eq("telefone", telefone);
        return { success: true };
    } catch (err) {
        return { success: false, error: String(err) };
    }
}

export async function clearClienteMessages(telefone: string): Promise<{ success: boolean; error?: string }> {
    await requireAuth();
    const supabase = createServerSupabaseClient();

    try {
        await supabase.from("messages").delete().eq("telefone", telefone);
        return { success: true };
    } catch (err) {
        return { success: false, error: String(err) };
    }
}
