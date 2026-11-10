import type { Metadata } from "next";

import { Sidebar } from "@/components/sidebar";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "GTA Clips AI", template: "%s · GTA Clips AI" },
  description: "Transforma lives de GTA RP em cortes verticais prontos para publicação.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full">
        <Sidebar />
        <main className="lg:pl-64">
          <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}
