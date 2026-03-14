import { Sidebar } from "@/components/layout/sidebar";
import { currentUser } from "@clerk/nextjs/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AppLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const clerkUser = await currentUser();
    if (clerkUser) {
        const supabase = createServerSupabaseClient();
        await supabase
            .from("users")
            .upsert(
                {
                    clerk_id: clerkUser.id,
                    name: clerkUser.fullName || clerkUser.username || "Usuário",
                    email: clerkUser.emailAddresses[0]?.emailAddress || "",
                    avatar_url: clerkUser.imageUrl,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "clerk_id" }
            );
    }

    return (
        <div className="min-h-screen bg-slate-900 text-slate-200">
            <Sidebar />
            <main className="pl-[64px] transition-all duration-300">
                <div className="p-6 lg:p-8 max-w-[1600px] mx-auto">
                    {children}
                </div>
            </main>
        </div>
    );
}
