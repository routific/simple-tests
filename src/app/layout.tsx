import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { AuthProvider } from "@/components/auth-provider";
import { KeyboardShortcutsProvider } from "@/components/keyboard-shortcuts-provider";

export const metadata: Metadata = {
  title: "SimpleTests",
  description: "Lightweight test case management for modern teams",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const theme = localStorage.getItem('theme');
                const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                if (theme === 'dark' || (!theme && prefersDark)) {
                  document.documentElement.classList.add('dark');
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body className="font-sans">
        {process.env.DEMO_MODE === "true" && (
          <div className="bg-amber-500 text-amber-950 text-center text-xs py-1 font-medium z-50 relative">
            Demo Mode — Sample data for a fictional &quot;CloudSync&quot; product. Linear integration is disabled.
          </div>
        )}
        <AuthProvider>
          <KeyboardShortcutsProvider>
            <div className={`flex bg-background ${process.env.DEMO_MODE === "true" ? "h-[calc(100vh-28px)]" : "h-screen"}`}>
              <Sidebar />
              <main className="flex-1 overflow-auto">{children}</main>
            </div>
          </KeyboardShortcutsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
