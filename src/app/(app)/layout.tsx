import { Sidebar } from "@/components/layout/sidebar";
import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function AppLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const clerkUser = await currentUser();
    if (clerkUser) {
        await db
            .insert(users)
            .values({
                clerkId: clerkUser.id,
                name: clerkUser.fullName || clerkUser.username || "Usuário",
                email: clerkUser.emailAddresses[0]?.emailAddress || "",
                avatarUrl: clerkUser.imageUrl,
            })
            .onConflictDoUpdate({
                target: users.clerkId,
                set: {
                    name: clerkUser.fullName || clerkUser.username || "Usuário",
                    avatarUrl: clerkUser.imageUrl,
                    updatedAt: new Date(),
                },
            });
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
