/**
 * 関係図の手動配置（ノード・ラベル・線の曲げ）。
 * client_master.relationLayouts に focusId__viewMode で永続化する。
 */

import type {
  RelationGraphHull,
  RelationGraphLayout,
  RelationGraphNode,
  RelationViewMode,
} from "@/features/client-data/lib/client-relations-layout";

export type RelationPoint = { x: number; y: number };

export type RelationDiagramManualLayout = {
  nodes: Record<string, RelationPoint>;
  labels: Record<string, RelationPoint>;
  bends: Record<string, RelationPoint>;
};

export type RelationLayoutsMap = Record<string, RelationDiagramManualLayout>;

export function emptyManualLayout(): RelationDiagramManualLayout {
  return { nodes: {}, labels: {}, bends: {} };
}

export function relationLayoutKey(
  focusClientId: string,
  viewMode: RelationViewMode | string,
): string {
  return `${focusClientId}__${viewMode}`;
}

export function isManualLayoutEmpty(m: RelationDiagramManualLayout | null | undefined): boolean {
  if (!m) return true;
  return (
    Object.keys(m.nodes).length === 0 &&
    Object.keys(m.labels).length === 0 &&
    Object.keys(m.bends).length === 0
  );
}

export function sanitizeManualLayout(
  raw: unknown,
): RelationDiagramManualLayout {
  const empty = emptyManualLayout();
  if (!raw || typeof raw !== "object") return empty;
  const obj = raw as Record<string, unknown>;
  return {
    nodes: sanitizePointMap(obj.nodes),
    labels: sanitizePointMap(obj.labels),
    bends: sanitizePointMap(obj.bends),
  };
}

export function sanitizeRelationLayoutsMap(raw: unknown): RelationLayoutsMap {
  if (!raw || typeof raw !== "object") return {};
  const out: RelationLayoutsMap = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!key || key.length > 120) continue;
    if (!key.includes("__")) continue;
    const cleaned = sanitizeManualLayout(value);
    if (!isManualLayoutEmpty(cleaned)) out[key] = cleaned;
  }
  return out;
}

function sanitizePointMap(raw: unknown): Record<string, RelationPoint> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, RelationPoint> = {};
  let n = 0;
  for (const [id, pt] of Object.entries(raw as Record<string, unknown>)) {
    if (n >= 120) break;
    if (!id || id.length > 80) continue;
    if (!pt || typeof pt !== "object") continue;
    const x = Number((pt as { x?: unknown }).x);
    const y = Number((pt as { y?: unknown }).y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (Math.abs(x) > 8000 || Math.abs(y) > 8000) continue;
    out[id] = { x, y };
    n += 1;
  }
  return out;
}

function recomputeHulls(
  base: RelationGraphHull[],
  nodes: RelationGraphNode[],
): RelationGraphHull[] {
  const pos = new Map(nodes.map((n) => [n.id, n]));
  return base.map((hull, gi) => {
    const members = hull.clientIds
      .map((id) => pos.get(id))
      .filter(Boolean) as RelationGraphNode[];
    if (members.length === 0) return hull;
    const xs = members.flatMap((m) => [m.x - m.w / 2, m.x + m.w / 2]);
    const ys = members.flatMap((m) => [m.y - m.h / 2, m.y + m.h / 2]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const pad = 28 + gi * 4;
    return {
      ...hull,
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
      rx: Math.max(88, (maxX - minX) / 2 + pad),
      ry: Math.max(64, (maxY - minY) / 2 + pad),
    };
  });
}

/** 自動レイアウトに手動ノード位置を適用（枠も再計算） */
export function applyManualNodePositions(
  layout: RelationGraphLayout,
  manual: RelationDiagramManualLayout | null | undefined,
): RelationGraphLayout {
  if (!manual || Object.keys(manual.nodes).length === 0) {
    return layout;
  }
  const nodes = layout.nodes.map((n) => {
    const p = manual.nodes[n.id];
    return p ? { ...n, x: p.x, y: p.y } : n;
  });
  return {
    ...layout,
    nodes,
    hulls: recomputeHulls(layout.hulls, nodes),
  };
}
