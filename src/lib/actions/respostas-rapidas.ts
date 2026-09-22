"use server";

import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { RespostaRapida } from "@/lib/respostas-rapidas";

const COLUNAS = "id, atalho, titulo, conteudo, ordem, ativo";

// Espelha os CHECKs da migration: erro aqui é legível, erro no banco não.
const atalhoSchema = z.string().trim().toLowerCase()
    .transform(a => (a.startsWith("/") ? a : `/${a}`))
    .pipe(z.string().regex(/^\/[a-z0-9_-]{1,30}$/, "Atalho: só letras minúsculas, números, - e _ (até 30), ex.: /horario"));
const respostaSchema = z.object({
    atalho: atalhoSchema,
    titulo: z.string().trim().min(1, "Título obrigatório").max(60, "Título: até 60 caracteres"),
    conteudo: z.string().trim().min(1, "Conteúdo obrigatório").max(4000, "Conteúdo: até 4000 caracteres"),
    ordem: z.number().int().min(0).max(9999).optional(),
    ativo: z.boolean().optional(),
});

type Resultado<T = undefined> = T extends undefined
    ? { ok: true } | { ok: false; error: string }
    : { ok: true; resposta: T } | { ok: false; error: string };

function traduzErro(code: string | undefined, message: string): string {
    if (code === "23505") return "Já existe uma resposta com esse atalho.";
    return message;
}

export async function listRespostasRapidas(incluirInativas = false): Promise<RespostaRapida[]> {
    await requireAuth();
    const supabase = createServerSupabaseClient();
    let q = supabase.from("respostas_rapidas").select(COLUNAS).order("ordem").order("titulo");
    if (!incluirInativas) q = q.eq("ativo", true);
    const { data, error } = await q;
    if (error) {
        console.error("[listRespostasRapidas]", error.message);
        return [];
    }
    return (data ?? []) as RespostaRapida[];
}

export async function createRespostaRapida(input: {
    atalho: string; titulo: string; conteudo: string;
}): Promise<Resultado<RespostaRapida>> {
    await requireAuth();
    const parsed = respostaSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
    const supabase = createServerSupabaseClient();
    // Nova entra no fim: `ordem` só existe para a lista, sem UI de reordenar no v1.
    const { data: ultima } = await supabase.from("respostas_rapidas").select("ordem").order("ordem", { ascending: false }).limit(1).maybeSingle();
    const { data, error } = await supabase
        .from("respostas_rapidas")
        .insert({ ...parsed.data, ordem: (ultima?.ordem ?? 0) + 10 })
        .select(COLUNAS)
        .single();
    if (error) return { ok: false, error: traduzErro(error.code, error.message) };
    return { ok: true, resposta: data as RespostaRapida };
}

export async function updateRespostaRapida(input: {
    id: string; atalho: string; titulo: string; conteudo: string; ativo: boolean;
}): Promise<Resultado<RespostaRapida>> {
    await requireAuth();
    const id = z.string().uuid().safeParse(input.id);
    const parsed = respostaSchema.safeParse(input);
    if (!id.success || !parsed.success) return { ok: false, error: parsed.success ? "Id inválido." : parsed.error.issues[0]?.message ?? "Dados inválidos." };
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
        .from("respostas_rapidas")
        .update(parsed.data)
        .eq("id", id.data)
        .select(COLUNAS)
        .single();
    if (error) return { ok: false, error: traduzErro(error.code, error.message) };
    return { ok: true, resposta: data as RespostaRapida };
}

export async function deleteRespostaRapida(id: string): Promise<Resultado> {
    await requireAuth();
    const parsed = z.string().uuid().safeParse(id);
    if (!parsed.success) return { ok: false, error: "Id inválido." };
    const supabase = createServerSupabaseClient();
    const { error } = await supabase.from("respostas_rapidas").delete().eq("id", parsed.data);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
}
