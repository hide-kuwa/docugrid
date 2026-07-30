import { DocuGridLogoMark } from "./DocuGridLogoMark";
import { LOGO_MARK_SIZES, LOGO_WORDMARK_SIZES, type BrandSurface, type LogoSize } from "./types";

type DocuGridLogoProps = {
  size?: LogoSize;
  surface?: BrandSurface;
  showSymbol?: boolean;
  showSubtitle?: boolean;
  className?: string;
};

/** DocuGrid child-product wordmark: Docu (ink) + Grid (accent), optional subtitle. */
export function DocuGridLogo({
  size = "sm",
  surface = "light",
  showSymbol = true,
  showSubtitle = true,
  className = "",
}: DocuGridLogoProps) {
  const markSize = LOGO_MARK_SIZES[size];
  const gap = markSize / 2;

  return (
    <span
      data-surface={surface}
      className={`inline-flex items-center ${className}`}
      style={showSymbol ? { gap } : undefined}
    >
      {showSymbol ? <DocuGridLogoMark size={markSize} surface={surface} /> : null}
      <span className="flex flex-col justify-center">
        <span
          className={`font-wordmark font-bold leading-tight ${LOGO_WORDMARK_SIZES[size]}`}
          style={{ letterSpacing: "-0.02em" }}
        >
          <span style={{ color: "var(--taxx-logo-ink)" }}>Docu</span>
          <span style={{ color: "var(--taxx-logo-accent)" }}>Grid</span>
        </span>
        {showSubtitle ? (
          <span
            className="font-brand-mono text-[0.55em] font-normal uppercase leading-tight"
            style={{ color: "var(--taxx-logo-subtitle)", letterSpacing: "0.18em" }}
          >
            TAXX 資料整理
          </span>
        ) : null}
      </span>
    </span>
  );
}
