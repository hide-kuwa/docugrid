export type BrandSurface = "light" | "dark";

export type LogoSize = "xs" | "sm" | "md" | "lg";

export const LOGO_MARK_SIZES: Record<LogoSize, number> = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 48,
};

export const LOGO_WORDMARK_SIZES: Record<LogoSize, string> = {
  xs: "text-base",
  sm: "text-lg",
  md: "text-xl",
  lg: "text-2xl",
};
