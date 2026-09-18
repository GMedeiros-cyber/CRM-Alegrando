import { Sidebar } from "@/components/layout/sidebar";
import { currentUser } from "@clerk/nextjs/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { after } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Duração máxima de TODA página autenticada — e, por tabela, de toda server
 * action que elas invocam. Server action roda dentro da lambda da página que
 * a chamou, então o teto dela é o da página, não do arquivo onde está escrita.
 *
 * Declarado no repo porque o default da Vercel NÃO é legível: a API do projeto
 * não expõe maxDuration nem o estado do Fluid Compute. Depender do default é
 * depender de um número que ninguém consegue conferir.
 *
 * 60s = o que o Hobby aceita com folga, e ~5x o pior caso medido do caminho
 * mais longo (attachDriveFile: 129MB do Drive → R2 em 10,8s, medido da máquina
 * local, que é MAIS lenta que o gru1). Não pedir 300: se o plano não suportar,
 * o deploy falha. Ver SKILL §1, "caminho de upload".
 */
export const maxDuration = 60;

export default async function AppLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const clerkUser = await currentUser();

    // Verificação de emails autorizados — bloqueio síncrono (segurança).
    if (clerkUser) {
        const allowedRaw = process.env.ALLOWED_EMAILS ?? "";
        const allowedEmails = allowedRaw
            .split(",")
            .map((e) => e.trim().toLowerCase())
            .filter(Boolean);

        const userEmail =
            clerkUser.emailAddresses[0]?.emailAddress?.toLowerCase() ?? "";

        if (allowedEmails.length > 0 && !allowedEmails.includes(userEmail)) {
            redirect("/unauthorized");
        }

        // Sync com a tabela `users` — fire-and-forget via after() pra não
        // bloquear o render. A fonte primária de sync é o webhook
        // /api/webhooks/clerk (user.created/updated/deleted); este upsert
        // é safety net pra:
        //   - primeira sessão (caso o webhook ainda não tenha entregue)
        //   - ambientes sem webhook configurado (dev local)
        // Se falhar, próxima navegação tenta de novo — sem impacto pro usuário.
        after(async () => {
            try {
                const supabase = createServerSupabaseClient();
                await supabase
                    .from("users")
                    .upsert(
                        {
                            clerk_id: clerkUser.id,
                            name: clerkUser.fullName || clerkUser.username || "Usuário",
                            email: userEmail,
                            avatar_url: clerkUser.imageUrl,
                            updated_at: new Date().toISOString(),
                        },
                        { onConflict: "clerk_id" }
                    );
            } catch (err) {
                console.error("[layout] Falha no UPSERT do usuário (background):", err);
            }
        });
    }

    return (
        <div className="min-h-screen bg-background text-foreground">
            <Sidebar />
            <main className="pl-[64px] transition-all duration-300">
                <div className="p-6 lg:p-8 max-w-[1600px] mx-auto">
                    {children}
                </div>
            </main>
        </div>
    );
}
