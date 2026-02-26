import Link from "next/link";

export const dynamic = "force-dynamic";

export default function NotFound() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-background">
            <div className="text-center space-y-4">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-50">
                    <span className="font-display text-2xl font-bold text-brand-500">
                        404
                    </span>
                </div>
                <h1 className="font-display text-2xl font-bold text-foreground">
                    Página não encontrada
                </h1>
                <p className="text-muted-foreground max-w-sm">
                    A página que você está procurando não existe ou foi movida.
                </p>
                <Link
                    href="/dashboard"
                    className="inline-flex items-center px-4 py-2 rounded-xl bg-brand-500 text-white font-medium text-sm hover:bg-brand-600 transition-colors shadow-md shadow-brand-500/20"
                >
                    Voltar ao Dashboard
                </Link>
            </div>
        </div>
    );
}
