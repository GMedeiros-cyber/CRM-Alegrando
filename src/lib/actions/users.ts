"use server";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function syncClerkUser(user: {
    clerkId: string;
    name: string;
    email: string;
    avatarUrl: string | null;
}) {
    try {
        const existing = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.clerkId, user.clerkId))
            .limit(1);

        if (existing.length === 0) {
            await db.insert(users).values({
                clerkId: user.clerkId,
                name: user.name,
                email: user.email,
                avatarUrl: user.avatarUrl,
            });
        } else {
            await db
                .update(users)
                .set({
                    name: user.name,
                    email: user.email,
                    avatarUrl: user.avatarUrl,
                    updatedAt: new Date(),
                })
                .where(eq(users.clerkId, user.clerkId));
        }
    } catch (error) {
        console.error("Erro ao sincronizar usuário do Clerk:", error);
    }
}
