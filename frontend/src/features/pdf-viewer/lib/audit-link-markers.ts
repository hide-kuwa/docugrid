import type { AuditCheckLink, AuditCheckPoint, AuditSide } from "../types";

/** 紐づけペアごとに同じ色・番号を左右で表示する */
export const AUDIT_LINK_COLORS = [
  "#059669",
  "#2563eb",
  "#d97706",
  "#7c3aed",
  "#db2777",
  "#0891b2",
  "#4f46e5",
  "#ea580c",
] as const;

/** 作成順（古い＝1番）で並べ替え。マーカー番号とリスト表示で共通利用。 */
export function sortAuditLinksChronological(links: AuditCheckLink[]): AuditCheckLink[] {
  return [...links].sort((a, b) => {
    const t = (a.createdAt || "").localeCompare(b.createdAt || "");
    if (t !== 0) return t;
    return a.id.localeCompare(b.id);
  });
}

export type PaneMarker = {
  x: number;
  y: number;
  page: number;
  kind: "linked" | "pending";
  linkIndex?: number;
  linkId?: string;
  color: string;
};

export function buildPaneMarkers(
  side: AuditSide,
  links: AuditCheckLink[],
  pending: AuditCheckPoint | null,
): PaneMarker[] {
  const markers: PaneMarker[] = [];

  const ordered = sortAuditLinksChronological(links);
  ordered.forEach((link, index) => {
    const point = side === "left" ? link.left : link.right;
    markers.push({
      x: point.x,
      y: point.y,
      page: point.page,
      kind: "linked",
      linkIndex: index + 1,
      linkId: link.id,
      color: AUDIT_LINK_COLORS[index % AUDIT_LINK_COLORS.length],
    });
  });

  if (pending?.side === side) {
    markers.push({
      x: pending.x,
      y: pending.y,
      page: pending.page,
      kind: "pending",
      color: "#f59e0b",
    });
  }

  return markers;
}
