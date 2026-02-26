import { Suspense } from "react";
import { ConversasLayout } from "@/components/conversas/conversas-layout";
import { Loader2 } from "lucide-react";

export default function ConversasPage() {
    return (
        <Suspense
            fallback={
                <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
                    <Loader2 className="w-8 h-8 animate-spin text-brand-400" />
                </div>
            }
        >
            <ConversasLayout />
        </Suspense>
    );
}
