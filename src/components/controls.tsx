"use client";
import { Sun, Moon } from "lucide-react";
import { useI18n, useTheme } from "@/components/providers";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const { dict } = useI18n();
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={dict.theme.toggle}
      title={isDark ? dict.theme.toLight : dict.theme.toDark}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-md border border-input transition-colors hover:bg-accent hover:text-accent-foreground",
        className
      )}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale, dict } = useI18n();
  return (
    <div
      className={cn("inline-flex items-center overflow-hidden rounded-md border border-input text-xs font-medium", className)}
      role="group"
      aria-label={dict.lang.label}
    >
      {(["es", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLocale(l)}
          aria-pressed={locale === l}
          className={cn(
            "px-2.5 py-1.5 uppercase transition-colors",
            locale === l ? "bg-primary text-primary-foreground" : "hover:bg-accent hover:text-accent-foreground"
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export function Controls({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <LanguageSwitcher />
      <ThemeToggle />
    </div>
  );
}
