import type { BrandSurface } from "./types";

type TaxxLogoMarkProps = {
  size?: number;
  surface?: BrandSurface;
  className?: string;
  title?: string;
};

/** TAXX symbol: rounded neutral tile with green crossed bars forming an X. */
export function TaxxLogoMark({
  size = 32,
  surface = "light",
  className = "",
  title = "TAXX",
}: TaxxLogoMarkProps) {
  const radius = size * 0.29;
  const barWidth = size * 0.1;
  const barLength = size * 0.52;
  const halfBar = barWidth / 2;
  const halfLen = barLength / 2;

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
      <rect
        width={size}
        height={size}
        rx={radius}
        fill="var(--taxx-logo-tile)"
      />
      <rect
        x={size / 2 - halfBar}
        y={size / 2 - halfLen}
        width={barWidth}
        height={barLength}
        rx={barWidth / 2}
        fill="var(--taxx-logo-mark-accent)"
        transform={`rotate(45 ${size / 2} ${size / 2})`}
      />
      <rect
        x={size / 2 - halfBar}
        y={size / 2 - halfLen}
        width={barWidth}
        height={barLength}
        rx={barWidth / 2}
        fill="var(--taxx-logo-mark-accent)"
        transform={`rotate(-45 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}
