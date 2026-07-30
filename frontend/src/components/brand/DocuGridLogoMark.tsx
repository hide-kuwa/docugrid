import type { BrandSurface } from "./types";

type DocuGridLogoMarkProps = {
  size?: number;
  surface?: BrandSurface;
  favicon?: boolean;
  className?: string;
  title?: string;
};

/** DocuGrid symbol: 2×2 matrix grid — one cell filled (document placed). */
export function DocuGridLogoMark({
  size = 32,
  surface = "light",
  favicon = false,
  className = "",
  title = "DocuGrid",
}: DocuGridLogoMarkProps) {
  const radius = size * 0.27;
  const gap = size * 0.09;
  const pad = size * 0.17;
  const cell = (size - pad * 2 - gap) / 2;
  const cellRadius = cell * 0.22;

  if (favicon) {
    return (
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={title}
        className={`shrink-0 ${className}`}
      >
        <title>{title}</title>
        <rect width={size} height={size} rx={radius} fill="var(--taxx-green-500)" />
        <rect x={pad} y={pad} width={cell} height={cell} rx={cellRadius} fill="var(--taxx-white)" />
        <rect
          x={pad + cell + gap}
          y={pad}
          width={cell}
          height={cell}
          rx={cellRadius}
          fill="var(--taxx-green-100)"
        />
        <rect
          x={pad}
          y={pad + cell + gap}
          width={cell}
          height={cell}
          rx={cellRadius}
          fill="var(--taxx-green-50)"
        />
        <rect
          x={pad + cell + gap}
          y={pad + cell + gap}
          width={cell}
          height={cell}
          rx={cellRadius}
          fill="var(--taxx-white)"
        />
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={title}
      data-surface={surface}
      className={`shrink-0 ${className}`}
    >
      <title>{title}</title>
      <rect width={size} height={size} rx={radius} fill="var(--taxx-logo-tile)" />
      <rect
        x={pad}
        y={pad}
        width={cell}
        height={cell}
        rx={cellRadius}
        fill="var(--taxx-logo-cell-muted)"
      />
      <rect
        x={pad + cell + gap}
        y={pad}
        width={cell}
        height={cell}
        rx={cellRadius}
        fill="var(--taxx-logo-mark-accent)"
      />
      <rect
        x={pad}
        y={pad + cell + gap}
        width={cell}
        height={cell}
        rx={cellRadius}
        fill="var(--taxx-logo-cell-muted)"
      />
      <rect
        x={pad + cell + gap}
        y={pad + cell + gap}
        width={cell}
        height={cell}
        rx={cellRadius}
        fill="var(--taxx-logo-cell-dark)"
      />
    </svg>
  );
}
