import { Sidebar } from "@/components/layout/sidebar";

export const dynamic = "force-dynamic";

export default function AppLayout({
    children,
}: {
    children: React.ReactNode;
}) {
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
