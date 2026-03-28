import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { ptBR } from "@clerk/localizations";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: "Alegrando CRM",
  description:
    "CRM de gestão comercial para turismo pedagógico e excursões escolares — Alegrando Eventos",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
      localization={ptBR}
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/dashboard"
      appearance={{
        elements: {
          logoBox: {
            transform: "scale(1.3)",
            transformOrigin: "center",
          },
        },
      }}
    >
      <html lang="pt-BR">
        <body className="antialiased">
          <TooltipProvider delayDuration={200}>
            {children}
          </TooltipProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
