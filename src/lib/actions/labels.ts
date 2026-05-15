"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import type { Label, LabelColor } from "@/lib/types/labels";

type LabelRow = {
    id: string;
    name: string;
    color: string;
    created_at: string;
    updated_at: string;
};

function rowToLabel(r: LabelRow): Label {
    return {
        id: r.id,
        name: r.name,
        color: r.color as LabelColor,
        createdAt: new Date(r.created_at),
        updatedAt: new Date(r.updated_at),
    };
}

export async function listLabels(): Promise<Label[]> {
    await requireAuth();
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
        .from("labels")
        .select("id, name, color, created_at, updated_at")
        .order("name", { ascending: true });
    if (error) {
        console.error("[listLabels]", error.message);
        return [];
    }
    return (data || []).map(rowToLabel);
}

export async function createLabel(params: {
    name: string;
    color: LabelColor;
}): Promise<{ ok: true; label: Label } | { ok: false; error: string }> {
    const userId = await requireAuth();
    const name = params.name.trim();
    if (!name) return { ok: false, error: "Nome obrigatório" };
    if (name.length > 40) return { ok: false, error: "Nome muito longo (máx 40)" };

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
        .from("labels")
        .insert({ name, color: params.color, created_by: userId, updated_by: userId })
        .select("id, name, color, created_at, updated_at")
        .single();

    if (error) {
        if (error.code === "23505") return { ok: false, error: "Já existe uma tag com esse nome" };
        return { ok: false, error: error.message };
    }
    revalidatePath("/conversas");
    return { ok: true, label: rowToLabel(data) };
}

export async function updateLabel(params: {
    id: string;
    name?: string;
    color?: LabelColor;
}): Promise<{ ok: true } | { ok: false; error: string }> {
    const userId = await requireAuth();
    const supabase = createServerSupabaseClient();
    const updates: Record<string, unknown> = { updated_by: userId };
    if (params.name !== undefined) {
        const trimmed = params.name.trim();
        if (!trimmed) return { ok: false, error: "Nome obrigatório" };
        if (trimmed.length > 40) return { ok: false, error: "Nome muito longo (máx 40)" };
        updates.name = trimmed;
    }
    if (params.color !== undefined) updates.color = params.color;

    const { error } = await supabase.from("labels").update(updates).eq("id", params.id);
    if (error) {
        if (error.code === "23505") return { ok: false, error: "Já existe uma tag com esse nome" };
        return { ok: false, error: error.message };
    }
    revalidatePath("/conversas");
    return { ok: true };
}

export async function deleteLabel(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
    await requireAuth();
    const supabase = createServerSupabaseClient();
    // CASCADE em lead_labels cuida da limpeza automática
    const { error } = await supabase.from("labels").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/conversas");
    return { ok: true };
}

/**
 * Resolve o uuid de Clientes _WhatsApp.id a partir de (telefone, canal).
 * lead_labels usa o uuid pra evitar colisão entre canais com mesmo número.
 */
async function resolveLeadUuid(
    telefone: string,
    canal: string,
): Promise<string | null> {
    const supabase = createServerSupabaseClient();
    const { data } = await supabase
        .from("Clientes _WhatsApp")
        .select("id")
        .eq("telefone", telefone)
        .eq("canal", canal)
        .maybeSingle();
    return data?.id ?? null;
}

export async function assignLabel(params: {
    telefone: string;
    canal: string;
    labelId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
    await requireAuth();
    const leadUuid = await resolveLeadUuid(params.telefone, params.canal);
    if (!leadUuid) return { ok: false, error: "Lead não encontrado" };

    const supabase = createServerSupabaseClient();
    const { error } = await supabase
        .from("lead_labels")
        .insert({ lead_id: leadUuid, label_id: params.labelId });
    // 23505 = associação já existe, idempotente
    if (error && error.code !== "23505") return { ok: false, error: error.message };
    revalidatePath("/conversas");
    return { ok: true };
}

export async function removeLabel(params: {
    telefone: string;
    canal: string;
    labelId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
    await requireAuth();
    const leadUuid = await resolveLeadUuid(params.telefone, params.canal);
    if (!leadUuid) return { ok: false, error: "Lead não encontrado" };

    const supabase = createServerSupabaseClient();
    const { error } = await supabase
        .from("lead_labels")
        .delete()
        .eq("lead_id", leadUuid)
        .eq("label_id", params.labelId);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/conversas");
    return { ok: true };
}
