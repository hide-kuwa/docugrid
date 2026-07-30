import { TaxxLogoMark } from "./TaxxLogoMark";
import { LOGO_MARK_SIZES, LOGO_WORDMARK_SIZES, type BrandSurface, type LogoSize } from "./types";

type TaxxLogoProps = {
  size?: LogoSize;
  surface?: BrandSurface;
  showSymbol?: boolean;
  className?: string;
};

/** TAXX parent-brand wordmark: TA (ink) + XX (accent). */
export function TaxxLogo({
  size = "sm",
  surface = "light",
  showSymbol = true,
  className = "",
}: TaxxLogoProps) {
  const markSize = LOGO_MARK_SIZES[size];
  const gap = markSize / 2;

  return (
    <span
      data-surface={surface}
      className={`inline-flex items-center ${className}`}
      style={showSymbol ? { gap } : undefined}
    >
      {showSymbol ? <TaxxLogoMark size={markSize} surface={surface} /> : null}
      <span
        className={`font-wordmark font-bold leading-none ${LOGO_WORDMARK_SIZES[size]}`}
        style={{ letterSpacing: "-0.02em" }}
      >
        <span style={{ color: "var(--taxx-logo-ink)" }}>TA</span>
        <span style={{ color: "var(--taxx-logo-accent)" }}>XX</span>
      </span>
    </span>
  );
}
