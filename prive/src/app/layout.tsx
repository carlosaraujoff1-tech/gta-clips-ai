import type { Metadata, Viewport } from "next";
import { Cinzel, Manrope } from "next/font/google";

import { ClientRuntime } from "@/components/client-runtime";

import "./globals.css";

const cinzel = Cinzel({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-cinzel", display: "swap" });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });

export const metadata: Metadata = {
  title: { default: "PRIVÉ", template: "%s · PRIVÉ" },
  description: "Plataforma premium e discreta, exclusiva para maiores de 18 anos.",
  applicationName: "PRIVÉ",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "PRIVÉ", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  icons: { icon: "/icon.svg", apple: "/apple-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${cinzel.variable} ${manrope.variable} antialiased`}>
      <body className="min-h-dvh">
        <ClientRuntime />
        {children}
      </body>
    </html>
  );
}
