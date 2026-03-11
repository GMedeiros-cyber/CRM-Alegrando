"use server";

import { db } from "@/lib/db";
import { users, taskCards } from "@/lib/db/schema";
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

export async function assignTaskCard(cardId: string, userId: string | null): Promise<void> {
    await db
        .update(taskCards)
        .set({ assignedUserId: userId })
        .where(eq(taskCards.id, cardId));
        
    revalidatePath("/tarefas");
}
