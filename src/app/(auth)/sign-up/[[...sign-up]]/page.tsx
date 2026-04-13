import { SignUp } from "@clerk/nextjs";
import Image from "next/image";

export default function SignUpPage() {
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

                <SignUp
                    fallbackRedirectUrl="/dashboard"
                    appearance={{
                        elements: {
                            rootBox: "w-full",
                            cardBox: "shadow-2xl shadow-black/20 rounded-2xl border border-[#C7D2FE]",
                            card: "rounded-2xl bg-[#EEF2FF]",
                            headerTitle: "font-display text-[#191918]",
                            headerSubtitle: "text-[#6366F1]",
                            formButtonPrimary: "bg-[#FFA832] hover:bg-[#E67300] text-[#191918] font-semibold shadow-md shadow-orange-500/20",
                            footerActionLink: "text-[#FFA832] hover:text-[#FF8C00]",
                            formFieldInput: "rounded-xl bg-[#F7F7F5] border-[#A5B4FC] text-[#191918] placeholder:text-[#6366F1] focus:ring-[#FFA832]/20 focus:border-[#FFA832]",
                            formFieldLabel: "text-[#37352F]",
                            dividerLine: "bg-[#E0E7FF]",
                            dividerText: "text-[#6366F1]",
                            socialButtonsBlockButton: "bg-[#F7F7F5] border-[#A5B4FC] text-[#191918] hover:bg-[#E0E7FF]",
                            socialButtonsBlockButtonText: "text-[#191918]",
                            footerActionText: "text-[#6366F1]",
                            identityPreviewEditButton: "text-[#FFA832]",
                            formFieldAction: "text-[#FFA832]",
                            otpCodeFieldInput: "bg-[#F7F7F5] border-[#A5B4FC] text-[#191918]",
                            footer: "bg-[#EEF2FF]",
                        },
                    }}
                />
            </div>
        </div>
    );
}
