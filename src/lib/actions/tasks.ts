"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function getUsers() {
    const supabase = createServerSupabaseClient();
    const { data } = await supabase
        .from("users")
        .select("id, name, avatar_url");

    return (data || []).map(u => ({
        id: u.id,
        name: u.name,
        avatarUrl: u.avatar_url,
    }));
}

// ---------------------------------------------------------
// GET
// ---------------------------------------------------------
export async function getTaskBoard() {
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
}

// ---------------------------------------------------------
// LISTS
// ---------------------------------------------------------
export async function createTaskList(name: string, position: number) {
    const supabase = createServerSupabaseClient();
    const { data: newList } = await supabase
        .from("task_lists")
        .insert({ name, position })
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
}

export async function renameTaskList(id: string, name: string) {
    const supabase = createServerSupabaseClient();
    await supabase.from("task_lists").update({ name }).eq("id", id);
    revalidatePath("/tarefas");
}

export async function deleteTaskList(id: string) {
    const supabase = createServerSupabaseClient();
    await supabase.from("task_lists").delete().eq("id", id);
    revalidatePath("/tarefas");
}

export async function reorderTaskLists(listIds: string[]) {
    const supabase = createServerSupabaseClient();
    await supabase.rpc("reorder_task_lists", {
        list_ids: listIds,
    });
    revalidatePath("/tarefas");
}

// ---------------------------------------------------------
// CARDS
// ---------------------------------------------------------
export async function createTaskCard(listId: string, title: string, position: number) {
    const supabase = createServerSupabaseClient();
    const { data: newCard } = await supabase
        .from("task_cards")
        .insert({ list_id: listId, title, position })
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
}

export async function updateTaskCard(id: string, data: { title?: string }) {
    const supabase = createServerSupabaseClient();
    await supabase.from("task_cards").update(data).eq("id", id);
    revalidatePath("/tarefas");
}

export async function deleteTaskCard(id: string) {
    const supabase = createServerSupabaseClient();
    await supabase.from("task_cards").delete().eq("id", id);
    revalidatePath("/tarefas");
}

export async function moveTaskCard(id: string, targetListId: string, newPosition: number) {
    const supabase = createServerSupabaseClient();
    await supabase
        .from("task_cards")
        .update({ list_id: targetListId, position: newPosition })
        .eq("id", id);
    revalidatePath("/tarefas");
}

export async function assignTaskCard(cardId: string, userId: string | null) {
    const supabase = createServerSupabaseClient();
    await supabase
        .from("task_cards")
        .update({ assigned_user_id: userId })
        .eq("id", cardId);
    revalidatePath("/tarefas");
}
