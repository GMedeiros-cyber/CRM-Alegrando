import { Mail } from "lucide-react";

export default function EmailsPage() {
    return (
        <div className="space-y-6 max-w-5xl">
            <div className="bento-enter">
                <h1 className="text-2xl font-bold tracking-tight text-[#191918] dark:text-white">
                    E-mails
                </h1>
                <p className="text-muted-foreground mt-1">
                    Seção em construção.
                </p>
            </div>

            <div className="rounded-xl border border-dashed bg-muted/30 p-8 flex flex-col items-center text-center gap-3 bento-enter [animation-delay:150ms]">
                <Mail className="w-8 h-8 text-muted-foreground" />
                <div>
                    <p className="text-sm font-medium text-[#191918] dark:text-white">
                        Nada por aqui ainda
                    </p>
                    <p className="text-sm text-muted-foreground mt-1 max-w-md">
                        O envio de e-mail já funciona dentro de Conversas: no painel do
                        cliente, para um lead específico; e na barra que aparece acima da
                        lista quando você filtra por tag, para vários de uma vez.
                    </p>
                </div>
            </div>
        </div>
    );
}
