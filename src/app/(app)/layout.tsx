import { Sidebar } from "@/components/layout/sidebar";
import { currentUser } from "@clerk/nextjs/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { after } from "next/server";

export const dynamic = "force-dynamic";

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
