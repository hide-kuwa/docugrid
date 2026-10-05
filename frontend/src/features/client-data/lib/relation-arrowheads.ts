/**
 * 関係図の矢印先端ジオメトリ（SVG / PDF 共通）。
 * 塗りつぶしの鈍い三角ではなく、細いダーツ／オープンシェブロン。
 */

export type ArrowHeadStyle = "dart" | "chevron";

export type ArrowGeometry = {
  /** 線の終点（先端の少し手前） */
  lineX2: number;
  lineY2: number;
  /** 塗りダーツ用ポリゴン（3点） */
  dartPoints: string;
  /** オープン矢印用パス */
  chevronPath: string;
  tipX: number;
  tipY: number;
};

/** 線分終点に合わせた先端。length/half は画面座標 px */
export function computeArrowHead(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts?: { length?: number; half?: number; inset?: number },
): ArrowGeometry {
  const length = opts?.length ?? 11;
  const half = opts?.half ?? 4.1;
  const inset = opts?.inset ?? 0.5;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  // ノード縁からわずかに離す
  const tipX = x2 - ux * inset;
  const tipY = y2 - uy * inset;
  const baseX = tipX - ux * length;
  const baseY = tipY - uy * length;
  const px = -uy;
  const py = ux;
  const leftX = baseX + px * half;
  const leftY = baseY + py * half;
  const rightX = baseX - px * half;
  const rightY = baseY - py * half;
  // 線はダーツの付け根まで（先端と二重にならない）
  const lineX2 = baseX + ux * 1.2;
  const lineY2 = baseY + uy * 1.2;
  // わずかに凹んだ付け根で「芋三角」感を消す
  const notchX = baseX + ux * 2.2;
  const notchY = baseY + uy * 2.2;
  return {
    lineX2,
    lineY2,
    tipX,
    tipY,
    dartPoints: `${tipX},${tipY} ${leftX},${leftY} ${notchX},${notchY} ${rightX},${rightY}`,
    chevronPath: `M ${leftX} ${leftY} L ${tipX} ${tipY} L ${rightX} ${rightY}`,
  };
}

export function arrowStyleForKind(
  kind: string,
): { style: ArrowHeadStyle; length: number; half: number } | null {
  switch (kind) {
    case "shareholding":
      return { style: "dart", length: 12, half: 4.0 };
    case "referral":
      return { style: "dart", length: 11, half: 3.8 };
    case "relative":
      return { style: "chevron", length: 10, half: 4.4 };
    case "officer":
      return { style: "dart", length: 12, half: 4.2 };
    case "group_company":
      return null;
    default:
      return { style: "dart", length: 10, half: 3.6 };
  }
}
