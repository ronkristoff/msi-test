import type { Metadata } from "next";
import "./globals.css";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import { Toaster } from "sonner";
import { getToken } from "@/lib/auth-server";

export const metadata: Metadata = {
  title: "MSITest",
  description: "AI-powered E2E test intelligence",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const token = await getToken();
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <ConvexClientProvider initialToken={token}>
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              duration: 8000,
              style: {
                background: "var(--surface)",
                border: "1px solid var(--border)",
                color: "var(--fg)",
                fontFamily: "var(--font-body)",
                boxShadow:
                  "0 0 1px rgba(0,0,0,0.32), 0 0 2px rgba(0,0,0,0.08), 0 1px 3px rgba(45,127,249,0.28), inset 0 0 0 0.5px rgba(0,0,0,0.06)",
                borderRadius: "var(--radius-md)",
              },
            }}
          />
        </ConvexClientProvider>
      </body>
    </html>
  );
}
