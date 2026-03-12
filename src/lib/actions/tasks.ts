"use server";

import { db } from "@/lib/db";
import { users, taskLists, taskCards } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function getUsers() {
    return await db.select({ id: users.id, name: users.name, avatarUrl: users.avatarUrl }).from(users);
}

// ---------------------------------------------------------
// GET
// ---------------------------------------------------------
export async function getTaskBoard() {
    const lists = await db.select().from(taskLists).orderBy(asc(taskLists.position));
    const allCards = await db.select().from(taskCards).orderBy(asc(taskCards.position));
    const allUsers = await getUsers();

    return lists.map(list => {
        const listCards = allCards.filter(c => c.listId === list.id).map(card => {
            const assignedUser = allUsers.find(u => u.id === card.assignedUserId);
            return {
                ...card,
                assignedUser: assignedUser ? { id: assignedUser.id, name: assignedUser.name, avatarUrl: assignedUser.avatarUrl } : null
            };
        });
        return {
            ...list,
            cards: listCards
        };
    });
}

// ---------------------------------------------------------
// LISTS
// ---------------------------------------------------------
export async function createTaskList(name: string, position: number) {
    const [newList] = await db.insert(taskLists).values({ name, position }).returning();
    revalidatePath("/tarefas");
    return { ...newList, cards: [] };
}

export async function renameTaskList(id: string, name: string) {
    await db.update(taskLists).set({ name }).where(eq(taskLists.id, id));
    revalidatePath("/tarefas");
}

export async function deleteTaskList(id: string) {
    await db.delete(taskLists).where(eq(taskLists.id, id));
    // Deleção em cascata cuidará dos cartões
    revalidatePath("/tarefas");
}

export async function reorderTaskLists(listIds: string[]) {
    await Promise.all(
        listIds.map((id, index) =>
            db.update(taskLists).set({ position: index }).where(eq(taskLists.id, id))
        )
    );
    revalidatePath("/tarefas");
}

// ---------------------------------------------------------
// CARDS
// ---------------------------------------------------------
export async function createTaskCard(listId: string, title: string, position: number) {
    const [newCard] = await db.insert(taskCards).values({ listId, title, position }).returning();
    revalidatePath("/tarefas");
    return { ...newCard, assignedUser: null };
}

export async function updateTaskCard(id: string, data: { title?: string }) {
    await db.update(taskCards).set(data).where(eq(taskCards.id, id));
    revalidatePath("/tarefas");
}

export async function deleteTaskCard(id: string) {
    await db.delete(taskCards).where(eq(taskCards.id, id));
    revalidatePath("/tarefas");
}

export async function moveTaskCard(id: string, targetListId: string, newPosition: number) {
    await db.update(taskCards).set({ listId: targetListId, position: newPosition }).where(eq(taskCards.id, id));
    revalidatePath("/tarefas");
}

export async function assignTaskCard(cardId: string, userId: string | null) {
    await db.update(taskCards).set({ assignedUserId: userId }).where(eq(taskCards.id, cardId));
    revalidatePath("/tarefas");
}
