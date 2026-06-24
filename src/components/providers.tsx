"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { dictionaries, type Dict, type Locale, LOCALE_COOKIE } from "@/lib/i18n";

// ---------------------------------------------------------------------------
// i18n context
// ---------------------------------------------------------------------------

interface I18nValue {
  locale: Locale;
  dict: Dict;
  setLocale: (l: Locale) => void;
}
const I18nContext = createContext<I18nValue | null>(null);

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <Providers>");
  return ctx;
}

// ---------------------------------------------------------------------------
// theme context
// ---------------------------------------------------------------------------

type Theme = "light" | "dark";
interface ThemeValue {
  theme: Theme;
  toggleTheme: () => void;
}
const ThemeContext = createContext<ThemeValue | null>(null);

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <Providers>");
  return ctx;
}

// ---------------------------------------------------------------------------
// combined provider
// ---------------------------------------------------------------------------

export function Providers({
  initialLocale,
  initialTheme,
  children,
}: {
  initialLocale: Locale;
  initialTheme: Theme;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [theme, setTheme] = useState<Theme>(initialTheme);

  const setLocale = useCallback(
    (l: Locale) => {
      document.cookie = `${LOCALE_COOKIE}=${l};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
      setLocaleState(l);
      router.refresh(); // re-render server components in the new language
    },
    [router]
  );

  const applyTheme = useCallback((t: Theme) => {
    const root = document.documentElement;
    root.classList.toggle("dark", t === "dark");
    document.cookie = `pollforge_theme=${t};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
    try {
      localStorage.setItem("pollforge_theme", t);
    } catch {}
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      applyTheme(next);
      return next;
    });
  }, [applyTheme]);

  // Sync class on mount in case localStorage differs from the cookie used by SSR.
  useEffect(() => {
    try {
      const stored = localStorage.getItem("pollforge_theme") as Theme | null;
      if (stored && stored !== theme) {
        setTheme(stored);
        document.documentElement.classList.toggle("dark", stored === "dark");
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <I18nContext.Provider value={{ locale, dict: dictionaries[locale], setLocale }}>
      <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>
    </I18nContext.Provider>
  );
}
