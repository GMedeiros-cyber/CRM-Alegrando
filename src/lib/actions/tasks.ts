"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function getUsers() {
    try {
        await requireAuth();
        const supabase = createServerSupabaseClient();
        const { data } = await supabase
            .from("users")
            .select("id, name, avatar_url");

        return (data || []).map(u => ({
            id: u.id,
            name: u.name,
            avatarUrl: u.avatar_url,
        }));
    } catch (err) {
        console.error("[tasks] Erro ao buscar users:", err);
        return [];
    }
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

        const allUsers = await getUsers();
        const lists = listsRes.data || [];
        const allCards = cardsRes.data || [];

        return lists.map(list => {
            const listCards = allCards
                .filter(c => c.list_id === list.id)
                .map(card => {
                    const assignedUser = allUsers.find(u => u.id === card.assigned_user_id);
                    return {
                        id: card.id,
                        listId: card.list_id,
                        title: card.title,
                        description: card.description,
                        position: card.position,
                        assignedUserId: card.assigned_user_id,
                        createdAt: card.created_at,
                        updatedAt: card.updated_at,
                        assignedUser: assignedUser
                            ? { id: assignedUser.id, name: assignedUser.name, avatarUrl: assignedUser.avatarUrl }
                            : null,
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
            createdAt: newCard!.created_at,
            updatedAt: newCard!.updated_at,
            assignedUser: null,
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

export async function assignTaskCard(cardId: string, userId: string | null) {
    try {
        await requireAuth();
        const supabase = createServerSupabaseClient();
        await supabase
            .from("task_cards")
            .update({ assigned_user_id: userId })
            .eq("id", cardId);
        revalidatePath("/tarefas");
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Erro ao atribuir card: ${msg}`);
    }
}
