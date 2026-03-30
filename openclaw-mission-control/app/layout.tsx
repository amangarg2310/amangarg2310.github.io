import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";
import { CommandPalette } from "@/components/command-palette";
import { ProjectProvider } from "@/lib/project-context";
import { ToastProvider } from "@/components/ui/toast";

export const metadata: Metadata = {
  title: "Mission Control",
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
        <ProjectProvider>
          <ToastProvider>
            <div className="flex h-full w-full overflow-hidden">
              <Sidebar />
              <main className="flex-1 h-full relative">
                {children}
              </main>
            </div>
            <CommandPalette />
          </ToastProvider>
        </ProjectProvider>
      </body>
    </html>
  );
}
