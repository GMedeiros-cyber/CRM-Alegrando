import Link from "next/link";

export default function UnauthorizedPage() {
    return (
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
            <div className="text-center space-y-4 max-w-md px-6">
                <div className="text-6xl">🚫</div>
                <h1 className="text-2xl font-bold">Acesso não autorizado</h1>
                <p className="text-muted-foreground">
                    Sua conta não tem permissão para acessar este sistema.
                    Por favor, entre em contato com o administrador.
                </p>
                <Link
                    href="/sign-in"
                    className="inline-block mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity"
                >
                    Voltar ao login
                </Link>
            </div>
        </div>
    );
}
