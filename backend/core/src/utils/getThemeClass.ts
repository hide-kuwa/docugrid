import type { Theme } from "@/contexts/ThemeContext";

export function getThemeClass(
  theme: Theme,
  classes: Partial<Record<Theme | "default", string>>
): string {
  return classes[theme] ?? classes.default ?? "";
}
