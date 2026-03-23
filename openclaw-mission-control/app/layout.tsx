import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";
import { CommandPalette } from "@/components/command-palette";

export const metadata: Metadata = {
  title: "OpenClaw Mission Control",
  description: "AI Agent Orchestration Control Plane",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased dark">
      <body className="h-full bg-background text-foreground font-sans">
        <div className="flex h-full w-full overflow-hidden">
          <Sidebar />
          <main className="flex-1 h-full relative">
            {children}
          </main>
        </div>
        <CommandPalette />
      </body>
    </html>
  );
}
