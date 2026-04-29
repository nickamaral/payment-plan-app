import type { Metadata } from "next";
import "./globals.css";
import { InfiniteGridBackground } from "@/components/InfiniteGridBackground";

export const metadata: Metadata = {
  title: "Folha Quinzenal — Análise Automática",
  description:
    "Sistema para análise quinzenal da folha de pagamento com aplicação automática de descontos e notificações.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen">
        <InfiniteGridBackground />
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
