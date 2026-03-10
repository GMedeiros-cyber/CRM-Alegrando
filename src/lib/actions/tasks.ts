"use server";

import { db } from "@/lib/db";
import { taskLists, taskCards, users } from "@/lib/db/schema";
import { eq, asc, inArray } from "drizzle-orm";

export type TaskCard = {
    id: string;
    listId: string;
    title: string;
    description: string | null;
    position: number;
    assignedUserId: string | null;
    createdAt: Date | null;
    assignedUser?: {
        id: string;
        name: string;
        avatarUrl: string | null;
    } | null;
};

export type TaskList = {
    id: string;
    name: string;
    position: number;
    createdAt: Date | null;
    cards: TaskCard[];
};

// ==========================================
// RECUPERAÇÃO DE TABELA (BOARD) E USUÁRIOS
// ==========================================
export async function getTaskBoard(): Promise<TaskList[]> {
    try {
        const lists = await db.query.taskLists.findMany({
            orderBy: [asc(taskLists.position), asc(taskLists.createdAt)],
            with: {
                cards: {
                    orderBy: [asc(taskCards.position), asc(taskCards.createdAt)],
                    with: {
                        assignedUser: {
                            columns: {
                                id: true,
                                name: true,
                                avatarUrl: true,
                            },
                        },
                    },
                },
            },
        });
        return lists as TaskList[];
    } catch (error) {
        console.error("Erro ao carregar board de tarefas:", error);
        return [];
    }
}

export async function getUsers() {
    try {
        const allUsers = await db
            .select({
                id: users.id,
                name: users.name,
                avatarUrl: users.avatarUrl,
            })
            .from(users)
            .orderBy(asc(users.name));
        return allUsers;
    } catch (error) {
        console.error("Erro ao carregar usuários:", error);
        return [];
    }
}

// ==========================================
// MUTAÇÕES DE LISTAS
// ==========================================
export async function createTaskList(name: string): Promise<TaskList> {
    const [newList] = await db
        .insert(taskLists)
        .values({ name })
        .returning();

    return { ...newList, cards: [] };
}

export async function renameTaskList(id: string, name: string): Promise<void> {
    await db
        .update(taskLists)
        .set({ name })
        .where(eq(taskLists.id, id));
}

export async function deleteTaskList(id: string): Promise<void> {
    // Cascading deletes are handled by foreign key ON DELETE CASCADE
    await db.delete(taskLists).where(eq(taskLists.id, id));
}

export async function reorderTaskLists(listIds: string[]): Promise<void> {
    // Execute updates directly or in a transaction
    await db.transaction(async (tx) => {
        for (let i = 0; i < listIds.length; i++) {
            await tx
                .update(taskLists)
                .set({ position: i })
                .where(eq(taskLists.id, listIds[i]));
        }
    });
}

// ==========================================
// MUTAÇÕES DE CARTÕES
// ==========================================
export async function createTaskCard(listId: string, title: string): Promise<TaskCard> {
    const [newCard] = await db
        .insert(taskCards)
        .values({ listId, title })
        .returning();
    return { ...newCard, assignedUser: null };
}

export async function updateTaskCard(id: string, data: { title?: string; description?: string }): Promise<void> {
    await db
        .update(taskCards)
        .set(data)
        .where(eq(taskCards.id, id));
}

export async function deleteTaskCard(id: string): Promise<void> {
    await db.delete(taskCards).where(eq(taskCards.id, id));
}

export async function moveTaskCard(id: string, targetListId: string, newPosition: number): Promise<void> {
    await db
        .update(taskCards)
        .set({ listId: targetListId, position: newPosition })
        .where(eq(taskCards.id, id));
}

export async function assignTaskCard(cardId: string, userId: string | null): Promise<void> {
    await db
        .update(taskCards)
        .set({ assignedUserId: userId })
        .where(eq(taskCards.id, cardId));
}
