"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  className?: string;
  compact?: boolean;
}

export function ThemeToggle({ className, compact = false }: ThemeToggleProps) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initial = stored ? (stored as "light" | "dark") : prefersDark ? "dark" : "light";
    setTheme(initial);
    document.documentElement.classList.toggle("dark", initial === "dark");
  }, []);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
  };

  if (!mounted) {
    return (
      <button
        className={cn(
          "relative rounded-full bg-muted transition-colors",
          compact ? "w-10 h-5" : "w-14 h-7",
          className
        )}
        aria-label="Toggle theme"
      >
        <span className={cn(
          "absolute rounded-full bg-background shadow-soft transition-transform",
          compact ? "left-0.5 top-0.5 w-4 h-4" : "left-1 top-1 w-5 h-5"
        )} />
      </button>
    );
  }

  return (
    <button
      onClick={toggleTheme}
      className={cn(
        "relative rounded-full transition-colors duration-200",
        compact ? "w-10 h-5" : "w-14 h-7",
        theme === "dark" ? "bg-brand-600" : "bg-muted",
        className
      )}
      aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
    >
      <span
        className={cn(
          "absolute rounded-full bg-background shadow-soft transition-all duration-200 flex items-center justify-center",
          compact
            ? cn("top-0.5 w-4 h-4", theme === "dark" ? "left-[22px]" : "left-0.5")
            : cn("top-1 w-5 h-5", theme === "dark" ? "left-8" : "left-1")
        )}
      >
        {theme === "dark" ? (
          <MoonIcon className={cn(compact ? "w-2.5 h-2.5" : "w-3 h-3", "text-brand-600")} />
        ) : (
          <SunIcon className={cn(compact ? "w-2.5 h-2.5" : "w-3 h-3", "text-amber-500")} />
        )}
      </span>
    </button>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
      />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
      />
    </svg>
  );
}
