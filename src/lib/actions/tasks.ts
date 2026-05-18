"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

function normalizeAssignedUserIds(card: { assigned_user_ids?: unknown; assigned_user_id?: string }): string[] {
    if (Array.isArray(card.assigned_user_ids)) {
        return card.assigned_user_ids.filter((id: unknown): id is string => typeof id === "string" && id.length > 0);
    }

    if (typeof card.assigned_user_id === "string" && card.assigned_user_id) {
        return [card.assigned_user_id];
    }

    return [];
}

/**
 * Leitura leve da tabela users (sem chamar Clerk). Use isso em qualquer lugar
 * que só precisa renderizar avatares/nomes — não dispara o pipeline de sync
 * (Clerk list → DELETE órfãos → UPSERT), que é caro (200-500ms + 2 writes).
 *
 * O sync é responsabilidade do app layout (e idealmente, de webhooks do Clerk
 * pra incremental).
 */
export async function getUsersList() {
    await requireAuth();
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
        .from("users")
        .select("id, name, avatar_url")
        .order("name", { ascending: true });

    if (error) {
        console.error("[tasks] Erro ao listar usuários:", error.message);
        return [];
    }

    return (data || []).map((row) => ({
        id: row.id as string,
        name: (row.name as string) || "Sem nome",
        avatarUrl: (row.avatar_url as string) || null,
    }));
}

// ---------------------------------------------------------
// GET
// ---------------------------------------------------------
export async function getTaskBoard() {
    try {
        await requireAuth();
        const supabase = createServerSupabaseClient();


        const [listsRes, cardsRes] = await Promise.all([
            supabase.from("task_lists").select("*").order("position", { ascending: true }),
            supabase.from("task_cards").select("*").order("position", { ascending: true }),
        ]);

        const allUsers = await getUsersList();
        const usersById = new Map(allUsers.map((user) => [user.id, user]));

        const lists = listsRes.data || [];
        const allCards = cardsRes.data || [];

        return lists.map((list) => {
            const listCards = allCards
                .filter((card) => card.list_id === list.id)
                .map((card) => {
                    const assignedUserIds = normalizeAssignedUserIds(card);
                    const assignedUsers = assignedUserIds
                        .map((id) => usersById.get(id))
                        .filter((user): user is { id: string; name: string; avatarUrl: string | null } => Boolean(user));

                    return {
                        id: card.id,
                        listId: card.list_id,
                        title: card.title,
                        description: card.description,
                        position: card.position,
                        assignedUserId: assignedUsers[0]?.id ?? card.assigned_user_id,
                        assignedUserIds,
                        createdAt: card.created_at,
                        updatedAt: card.updated_at,
                        assignedUser: assignedUsers[0] || null,
                        assignedUsers,
                    };
                });

            return {
                id: list.id,
                name: list.name,
                position: list.position,
                createdAt: list.created_at,
                updatedAt: list.updated_at,
                cards: listCards,
            };
        });
    } catch (err) {
        console.error("[tasks] Erro ao buscar board:", err);
        return [];
    }
}

// ---------------------------------------------------------
// LISTS
// ---------------------------------------------------------
export async function createTaskList(name: string, position: number) {
    try {
        const userId = await requireAuth();
        const supabase = createServerSupabaseClient();
        const { data: newList } = await supabase
            .from("task_lists")
            .insert({ name, position, created_by: userId })
            .select()
            .single();

        revalidatePath("/tarefas");

        return {
            id: newList!.id,
            name: newList!.name,
            position: newList!.position,
            createdAt: newList!.created_at,
            updatedAt: newList!.updated_at,
            cards: [],
        };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Erro ao criar lista: ${msg}`);
    }
}

export async function renameTaskList(id: string, name: string) {
    try {
        await requireAuth();
        const supabase = createServerSupabaseClient();
        await supabase.from("task_lists").update({ name }).eq("id", id);
        revalidatePath("/tarefas");
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Erro ao renomear lista: ${msg}`);
    }
}

export async function deleteTaskList(id: string) {
    try {
        await requireAuth();
        const supabase = createServerSupabaseClient();
        await supabase.from("task_lists").delete().eq("id", id);
        revalidatePath("/tarefas");
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Erro ao excluir lista: ${msg}`);
    }
}

export async function reorderTaskLists(listIds: string[]) {
    try {
        await requireAuth();
        const supabase = createServerSupabaseClient();
        const newPositions = listIds.map((_, index) => index);
        await supabase.rpc("reorder_task_lists", {
            list_ids: listIds,
            new_positions: newPositions,
        });
        revalidatePath("/tarefas");
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Erro ao reordenar listas: ${msg}`);
    }
}

// ---------------------------------------------------------
// CARDS
// ---------------------------------------------------------
export async function createTaskCard(listId: string, title: string, position: number) {
    try {
        const userId = await requireAuth();
        const supabase = createServerSupabaseClient();


        const { data: newCard } = await supabase
            .from("task_cards")
            .insert({ list_id: listId, title, position, created_by: userId })
            .select()
            .single();

        revalidatePath("/tarefas");

        return {
            id: newCard!.id,
            listId: newCard!.list_id,
            title: newCard!.title,
            description: newCard!.description,
            position: newCard!.position,
            assignedUserId: newCard!.assigned_user_id,
            assignedUserIds: Array.isArray(newCard!.assigned_user_ids) ? newCard!.assigned_user_ids : [],
            createdAt: newCard!.created_at,
            updatedAt: newCard!.updated_at,
            assignedUser: null,
            assignedUsers: [],
        };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Erro ao criar card: ${msg}`);
    }
}

export async function updateTaskCard(id: string, data: { title?: string }) {
    try {
        const userId = await requireAuth();
        const supabase = createServerSupabaseClient();
        await supabase.from("task_cards").update({ ...data, updated_by: userId }).eq("id", id);
        revalidatePath("/tarefas");
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Erro ao atualizar card: ${msg}`);
    }
}

export async function deleteTaskCard(id: string) {
    try {
        await requireAuth();
        const supabase = createServerSupabaseClient();
        await supabase.from("task_cards").delete().eq("id", id);
        revalidatePath("/tarefas");
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Erro ao excluir card: ${msg}`);
    }
}

export async function moveTaskCard(id: string, targetListId: string, newPosition: number) {
    try {
        await requireAuth();
        const supabase = createServerSupabaseClient();
        await supabase
            .from("task_cards")
            .update({ list_id: targetListId, position: newPosition })
            .eq("id", id);
        revalidatePath("/tarefas");
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Erro ao mover card: ${msg}`);
    }
}

export async function assignMultipleTaskCard(cardId: string, userIds: string[]): Promise<{ success: boolean }> {
    try {
        await requireAuth();
        const supabase = createServerSupabaseClient();


        const normalizedUserIds = [...new Set(userIds.filter(Boolean))];

        await supabase
            .from("task_cards")
            .update({
                assigned_user_ids: normalizedUserIds,
                assigned_user_id: normalizedUserIds[0] ?? null,
            })
            .eq("id", cardId);

        revalidatePath("/tarefas");
        return { success: true };
    } catch (err) {
        console.error("[tasks] Erro ao atribuir multiplos usuarios:", err);
        return { success: false };
    }
}
