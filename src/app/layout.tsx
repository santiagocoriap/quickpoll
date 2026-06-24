import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { Providers } from "@/components/providers";
import { getDictionary, normalizeLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  const dict = getDictionary(normalizeLocale(cookies().get("pollforge_locale")?.value));
  return { title: dict.meta.title, description: dict.meta.description };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = normalizeLocale(cookies().get("pollforge_locale")?.value);
  const theme = cookies().get("pollforge_theme")?.value === "dark" ? "dark" : "light";

  return (
    <html lang={locale} className={theme === "dark" ? "dark" : undefined} suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <Providers initialLocale={locale} initialTheme={theme}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
