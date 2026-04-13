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
                            cardBox: "shadow-2xl shadow-black/20 rounded-2xl border border-[#C7D2FE] dark:border-[#3d4a60]",
                            card: "rounded-2xl bg-[#EEF2FF] dark:bg-[#1e2536]",
                            headerTitle: "font-display text-[#191918] dark:text-white",
                            headerSubtitle: "text-[#6366F1] dark:text-[#94a3b8]",
                            formButtonPrimary: "bg-[#FFA832] hover:bg-[#E67300] text-[#191918] dark:text-white font-semibold shadow-md shadow-orange-500/20",
                            footerActionLink: "text-[#FFA832] hover:text-[#FF8C00]",
                            formFieldInput: "rounded-xl bg-[#F7F7F5] dark:bg-[#0f1829] border-[#A5B4FC] dark:border-[#4a5568] text-[#191918] dark:text-white placeholder:text-[#6366F1] dark:text-[#94a3b8] focus:ring-[#FFA832]/20 focus:border-[#FFA832]",
                            formFieldLabel: "text-[#37352F] dark:text-[#cbd5e1]",
                            dividerLine: "bg-[#E0E7FF] dark:bg-[#2d3347]",
                            dividerText: "text-[#6366F1] dark:text-[#94a3b8]",
                            socialButtonsBlockButton: "bg-[#F7F7F5] dark:bg-[#0f1829] border-[#A5B4FC] dark:border-[#4a5568] text-[#191918] dark:text-white hover:bg-[#E0E7FF] dark:hover:bg-[#2d3347]",
                            socialButtonsBlockButtonText: "text-[#191918] dark:text-white",
                            footerActionText: "text-[#6366F1] dark:text-[#94a3b8]",
                            identityPreviewEditButton: "text-[#FFA832]",
                            formFieldAction: "text-[#FFA832]",
                            otpCodeFieldInput: "bg-[#F7F7F5] dark:bg-[#0f1829] border-[#A5B4FC] dark:border-[#4a5568] text-[#191918] dark:text-white",
                            footer: "bg-[#EEF2FF] dark:bg-[#1e2536]",
                        },
                    }}
                />
            </div>
        </div>
    );
}
