import { auth } from "@clerk/nextjs/server";

/**
 * Helper obrigatório para Server Actions.
 * Valida que o usuário está autenticado via Clerk.
 * Retorna o userId (clerk_id) ou lança erro.
 */
export async function requireAuth(): Promise<string> {
    const { userId } = await auth();
    if (!userId) {
        throw new Error("Não autenticado — faça login para continuar.");
    }
    return userId;
}
