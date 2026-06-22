"use client";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export const themes = ["default", "dark", "glass", "pop"] as const;
export type Theme = (typeof themes)[number];

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

type ThemeProviderProps = {
  children: ReactNode;
  defaultTheme?: Theme;
};

export function ThemeProvider({
  children,
  defaultTheme = "default",
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(defaultTheme);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const stored = window.localStorage.getItem("theme");
    if (stored && themes.includes(stored as Theme)) {
      setThemeState(stored as Theme);
      return;
    }

    const prefersDark =
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    setThemeState(prefersDark ? "dark" : defaultTheme);
  }, [defaultTheme]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.dataset.theme = theme;

    const palette: Record<Theme, { bg: string; fg: string }> = {
      default: { bg: "#ffffff", fg: "#111827" },
      dark: { bg: "#0f172a", fg: "#e2e8f0" },
      glass: { bg: "rgba(255,255,255,0.25)", fg: "#111827" },
      pop: { bg: "#ec4899", fg: "#ffffff" },
    };

    const { bg, fg } = palette[theme] ?? palette.default;
    document.documentElement.style.setProperty("--background", bg);
    document.documentElement.style.setProperty("--foreground", fg);

    if (typeof window !== "undefined") {
      window.localStorage.setItem("theme", theme);
    }
  }, [theme]);

  const value = useMemo<ThemeContextValue>(() => {
    const setTheme = (next: Theme) => setThemeState(next);
    return { theme, setTheme };
  }, [theme]);

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
