import type { NormPoint, NormRect } from "../types";

const PATH_MIN_DIST_SQ = 0.000009; // ~0.003 normalized

export function appendPathPoint(prev: NormPoint[], next: NormPoint): NormPoint[] {
  if (prev.length === 0) return [next];
  const last = prev[prev.length - 1];
  const dx = next.x - last.x;
  const dy = next.y - last.y;
  if (dx * dx + dy * dy < PATH_MIN_DIST_SQ) return prev;
  return [...prev, next];
}

/** Windows Snipping Tool の蛍光ペンに近い、手ぶれを抑えた軌跡にする。 */
export function smoothMarkerPath(points: NormPoint[], passes = 2): NormPoint[] {
  if (points.length < 3) return [...points];
  let result = points.map((point) => ({ ...point }));
  for (let pass = 0; pass < passes; pass += 1) {
    result = result.map((point, index, source) => {
      if (index === 0 || index === source.length - 1) return point;
      const prev = source[index - 1];
      const next = source[index + 1];
      return {
        x: (prev.x + point.x * 2 + next.x) / 4,
        y: (prev.y + point.y * 2 + next.y) / 4,
      };
    });
  }
  return result;
}

/** 始点からの移動量が大きい軸へ吸着し、水平または垂直な終点を返す。 */
export function constrainPointToAxis(start: NormPoint, end: NormPoint): NormPoint {
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  return dx >= dy ? { x: end.x, y: start.y } : { x: start.x, y: end.y };
}

export function boundsFromPath(points: NormPoint[], pad = 0.008): NormRect {
  if (points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = points[0].x;
  let maxX = points[0].x;
  let minY = points[0].y;
  let maxY = points[0].y;
  for (let i = 1; i < points.length; i++) {
    minX = Math.min(minX, points[i].x);
    maxX = Math.max(maxX, points[i].x);
    minY = Math.min(minY, points[i].y);
    maxY = Math.max(maxY, points[i].y);
  }
  return {
    x: Math.max(0, minX - pad),
    y: Math.max(0, minY - pad),
    w: Math.min(1, maxX - minX + pad * 2),
    h: Math.min(1, maxY - minY + pad * 2),
  };
}

export function isMeaningfulPath(points: NormPoint[]): boolean {
  if (points.length >= 2) return true;
  return points.length === 1;
}
