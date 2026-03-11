"use server";

import { db } from "@/lib/db";
import { users, taskCards, taskLists } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function getUsers(): Promise<{ id: string; name: string; avatarUrl: string | null }[]> {
    return await db
        .select({
            id: users.id,
            name: users.name,
            avatarUrl: users.avatarUrl,
        })
        .from(users);
}

export async function getTaskBoard() {
    return await db.query.taskLists.findMany({
        with: {
            cards: {
                with: {
                    assignedUser: true
                },
                orderBy: (cards, { asc }) => [asc(cards.position)],
            }
        },
        orderBy: (lists, { asc }) => [asc(lists.position)]
    });
}

export async function createTaskList(name: string, position: number) {
    const [newList] = await db.insert(taskLists).values({ name, position }).returning();
    revalidatePath("/tarefas");
    return newList;
}

export async function updateTaskList(id: string, name: string) {
    await db.update(taskLists).set({ name }).where(eq(taskLists.id, id));
    revalidatePath("/tarefas");
}

export async function deleteTaskList(id: string): Promise<void> {
    await db.delete(taskLists).where(eq(taskLists.id, id));
    revalidatePath("/tarefas");
}

export async function reorderTaskLists(listIds: string[]): Promise<void> {
    for (let i = 0; i < listIds.length; i++) {
        await db
            .update(taskLists)
            .set({ position: i })
            .where(eq(taskLists.id, listIds[i]));
    }
    revalidatePath("/tarefas");
}

export async function createTaskCard(listId: string, title: string, position: number) {
    const [newCard] = await db.insert(taskCards).values({ listId, title, position }).returning();
    revalidatePath("/tarefas");
    return newCard;
}

export async function updateTaskCard(id: string, updates: { title?: string; description?: string }) {
    await db.update(taskCards).set(updates).where(eq(taskCards.id, id));
    revalidatePath("/tarefas");
}

export async function deleteTaskCard(id: string): Promise<void> {
    await db.delete(taskCards).where(eq(taskCards.id, id));
    revalidatePath("/tarefas");
}

export async function assignTaskCard(cardId: string, userId: string | null): Promise<void> {
    await db
        .update(taskCards)
        .set({ assignedUserId: userId })
        .where(eq(taskCards.id, cardId));
        
    revalidatePath("/tarefas");
}
