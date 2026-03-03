import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 via-white to-brand-100/30">
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute -top-40 -right-40 w-96 h-96 bg-brand-200/20 rounded-full blur-3xl" />
                <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-brand-100/30 rounded-full blur-3xl" />
            </div>
            <div className="relative z-10">
                <SignUp
                    fallbackRedirectUrl="/dashboard"
                    appearance={{
                        elements: {
                            cardBox: "shadow-xl shadow-black/5 rounded-2xl border border-border/30",
                            card: "rounded-2xl",
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
