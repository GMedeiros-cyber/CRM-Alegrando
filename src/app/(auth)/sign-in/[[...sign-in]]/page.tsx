import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 via-white to-brand-100/30">
            {/* Decorative elements */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute -top-40 -right-40 w-96 h-96 bg-brand-200/20 rounded-full blur-3xl" />
                <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-brand-100/30 rounded-full blur-3xl" />
            </div>

            <div className="relative z-10 flex flex-col items-center gap-8">
                {/* Logo / Brand */}
                <div className="text-center space-y-2">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-500 shadow-lg shadow-brand-500/25">
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="white"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="w-7 h-7"
                        >
                            <path d="M12 2L2 7l10 5 10-5-10-5z" />
                            <path d="M2 17l10 5 10-5" />
                            <path d="M2 12l10 5 10-5" />
                        </svg>
                    </div>
                    <h1 className="font-display text-2xl font-bold text-foreground tracking-tight">
                        Alegrando CRM
                    </h1>
                    <p className="text-muted-foreground text-sm">
                        Gestão comercial para turismo pedagógico
                    </p>
                </div>

                <SignIn
                    fallbackRedirectUrl="/dashboard"
                    appearance={{
                        elements: {
                            rootBox: "w-full",
                            cardBox: "shadow-xl shadow-black/5 rounded-2xl border border-border/30",
                            card: "rounded-2xl",
                            headerTitle: "font-display",
                            headerSubtitle: "font-sans",
                            formButtonPrimary:
                                "bg-brand-500 hover:bg-brand-600 text-white shadow-md shadow-brand-500/20",
                            footerActionLink: "text-brand-600 hover:text-brand-700",
                            formFieldInput:
                                "rounded-xl border-border focus:ring-brand-500/20 focus:border-brand-400",
                        },
                    }}
                />
            </div>
        </div>
    );
}
