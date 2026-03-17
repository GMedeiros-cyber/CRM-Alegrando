import { SignIn } from "@clerk/nextjs";
import Image from "next/image";

export default function SignInPage() {
    return (
        <div className="min-h-screen flex items-center justify-center animate-[gradientShift_8s_ease_infinite]" style={{
            background: "linear-gradient(135deg, #FFA832 0%, #FF8C00 25%, #E67300 50%, #CC5500 75%, #B34700 100%)",
            backgroundSize: "400% 400%",
        }}>
            <div className="flex flex-col items-center gap-8">
                <Image
                    src="/logo.png"
                    alt="Alegrando"
                    width={100}
                    height={100}
                />

                <SignIn
                    fallbackRedirectUrl="/dashboard"
                    appearance={{
                        elements: {
                            rootBox: "w-full",
                            cardBox: "shadow-2xl shadow-black/20 rounded-2xl border border-slate-700",
                            card: "rounded-2xl bg-slate-800",
                            headerTitle: "font-display text-white",
                            headerSubtitle: "text-slate-400",
                            formButtonPrimary: "bg-[#FFA832] hover:bg-[#E67300] text-white font-semibold shadow-md shadow-orange-500/20",
                            footerActionLink: "text-[#FFA832] hover:text-[#FF8C00]",
                            formFieldInput: "rounded-xl bg-slate-900 border-slate-600 text-white placeholder:text-slate-500 focus:ring-[#FFA832]/20 focus:border-[#FFA832]",
                            formFieldLabel: "text-slate-300",
                            dividerLine: "bg-slate-700",
                            dividerText: "text-slate-500",
                            socialButtonsBlockButton: "bg-slate-900 border-slate-600 text-slate-200 hover:bg-slate-700",
                            socialButtonsBlockButtonText: "text-slate-200",
                            footerActionText: "text-slate-400",
                            identityPreviewEditButton: "text-[#FFA832]",
                            formFieldAction: "text-[#FFA832]",
                            otpCodeFieldInput: "bg-slate-900 border-slate-600 text-white",
                            footer: "bg-slate-800",
                        },
                    }}
                />
            </div>
        </div>
    );
}
