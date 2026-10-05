import type {
  ClientFamilyGroup,
  ClientRelationEdge,
  ClientRelationKind,
  OrgClient,
} from "@/config/organization";

export type RelationGraphNode = {
  id: string;
  client: OrgClient;
  x: number;
  y: number;
  ring: "focus" | "group" | "relative" | "share" | "officer" | "referral" | "other";
  w: number;
  h: number;
};

export type RelationGraphHull = {
  groupId: string;
  name: string;
  clientIds: string[];
  cx: number;
  cy: number;
  rx: number;
  ry: number;
};

export type RelationGraphLayout = {
  width: number;
  height: number;
  nodes: RelationGraphNode[];
  edges: ClientRelationEdge[];
  hulls: RelationGraphHull[];
};

const WIDTH = 960;
const HEIGHT = 620;
const CX = WIDTH / 2;
/** フォーカスをやや下に置き、上にグループ・紹介の余白を確保 */
const CY = HEIGHT / 2 + 40;

/** 図の表示パターン（グループと紹介は別） */
export type RelationViewMode =
  | "all"
  | "ownership"
  | "family"
  | "group"
  | "officer"
  | "referral";

export const RELATION_VIEW_MODES: {
  id: RelationViewMode;
  label: string;
  hint: string;
}[] = [
  { id: "all", label: "全体", hint: "すべて（グループは枠、線は出資・親族・役員・紹介）" },
  { id: "ownership", label: "出資", hint: "出資関係図のみ" },
  { id: "family", label: "家系", hint: "親族の家系図のみ" },
  { id: "officer", label: "役員", hint: "社長・役員（誰がどの法人の代表か）のみ" },
  { id: "group", label: "グループ", hint: "同一グループの枠のみ" },
  { id: "referral", label: "紹介", hint: "紹介元・被紹介の線のみ" },
];

export function kindsForViewMode(
  mode: RelationViewMode,
): ReadonlySet<ClientRelationKind> | null {
  switch (mode) {
    case "ownership":
      return new Set<ClientRelationKind>(["shareholding"]);
    case "family":
      return new Set<ClientRelationKind>(["relative"]);
    case "group":
      return new Set<ClientRelationKind>(["group_company"]);
    case "officer":
      return new Set<ClientRelationKind>(["officer"]);
    case "referral":
      return new Set<ClientRelationKind>(["referral"]);
    case "all":
    default:
      return null;
  }
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

function placeOnArc(
  count: number,
  radius: number,
  startAngle: number,
  sweep: number,
): { x: number; y: number }[] {
  if (count <= 0) return [];
  if (count === 1) {
    const a = startAngle + sweep / 2;
    return [{ x: CX + Math.cos(a) * radius, y: CY + Math.sin(a) * radius }];
  }
  return Array.from({ length: count }, (_, i) => {
    const a = startAngle + (i * sweep) / (count - 1);
    return { x: CX + Math.cos(a) * radius, y: CY + Math.sin(a) * radius };
  });
}

function nodeSize(ring: RelationGraphNode["ring"]): { w: number; h: number } {
  if (ring === "focus") return { w: 132, h: 50 };
  return { w: 116, h: 44 };
}

/** 矩形ノードの縁までの線分端点 */
export function edgeAnchor(
  from: Pick<RelationGraphNode, "x" | "y" | "w" | "h">,
  to: Pick<RelationGraphNode, "x" | "y" | "w" | "h">,
): { x1: number; y1: number; x2: number; y2: number; mx: number; my: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;

  const exit = (node: typeof from, outwardX: number, outwardY: number) => {
    const hw = node.w / 2 + 4;
    const hh = node.h / 2 + 4;
    const sx = outwardX === 0 ? Infinity : hw / Math.abs(outwardX);
    const sy = outwardY === 0 ? Infinity : hh / Math.abs(outwardY);
    const t = Math.min(sx, sy);
    return { x: node.x + outwardX * t, y: node.y + outwardY * t };
  };

  const a = exit(from, ux, uy);
  const b = exit(to, -ux, -uy);
  // ラベル位置は中心寄りすぎないよう 55% 地点
  const t = 0.55;
  return {
    x1: a.x,
    y1: a.y,
    x2: b.x,
    y2: b.y,
    mx: a.x + (b.x - a.x) * t,
    my: a.y + (b.y - a.y) * t,
  };
}

/**
 * 全体表示ではグループ枠で所属を示すため、group_company の線は描かない
 * （「グループ」ラベルが中心に重なるのを防ぐ）。
 * グループ専用モードでは細い線を描くがラベルは出さない想定。
 */
export function shouldDrawEdgeLabel(
  kind: ClientRelationKind,
  viewMode: RelationViewMode,
): boolean {
  if (kind === "group_company") return false;
  if (viewMode === "group") return false;
  return true;
}

export function shouldDrawEdge(
  edge: ClientRelationEdge,
  viewMode: RelationViewMode,
): boolean {
  if (viewMode === "all" && edge.kind === "group_company") return false;
  return true;
}

/** フォーカス顧問先中心の固定レイアウト（扇で種別分離） */
export function layoutClientRelations(
  focusClientId: string,
  clients: OrgClient[],
  groups: ClientFamilyGroup[],
  relations: ClientRelationEdge[],
  viewMode: RelationViewMode = "all",
): RelationGraphLayout {
  const byId = new Map(clients.map((c) => [c.id, c]));
  const focus = byId.get(focusClientId);
  if (!focus) {
    return { width: WIDTH, height: HEIGHT, nodes: [], edges: [], hulls: [] };
  }

  const allowedKinds = kindsForViewMode(viewMode);
  const scopedRelations = allowedKinds
    ? relations.filter((e) => allowedKinds.has(e.kind))
    : relations;
  const showGroupHulls = viewMode === "all" || viewMode === "group";

  const relatedEdges = scopedRelations.filter(
    (e) => e.fromClientId === focusClientId || e.toClientId === focusClientId,
  );
  const focusGroups = showGroupHulls
    ? groups.filter((g) => g.clientIds.includes(focusClientId))
    : [];

  // 全体: 会社グループ枠だけ（親族グループ枠は家系・出資の線で示す → 枠の二重重ねを避ける）
  // グループ専用: フォーカスが属する全グループ
  const hullGroups =
    viewMode === "all"
      ? focusGroups.filter((g) => g.relationType === "group_company")
      : focusGroups;
  const groupCompanyGroups = hullGroups.filter((g) => g.relationType === "group_company");
  const otherGroups = hullGroups.filter((g) => g.relationType !== "group_company");
  const orderedGroups = [...groupCompanyGroups, ...otherGroups];

  const neighborByRing = new Map<string, RelationGraphNode["ring"]>();
  const groupMemberIds = new Set<string>();

  if (showGroupHulls) {
    for (const g of orderedGroups) {
      for (const id of g.clientIds) {
        if (id === focusClientId || !byId.has(id)) continue;
        groupMemberIds.add(id);
        if (!neighborByRing.has(id)) neighborByRing.set(id, "group");
      }
    }
  }

  for (const edge of relatedEdges) {
    const other =
      edge.fromClientId === focusClientId ? edge.toClientId : edge.fromClientId;
    if (other === focusClientId || !byId.has(other)) continue;
    const ring: RelationGraphNode["ring"] =
      edge.kind === "referral"
        ? "referral"
        : edge.kind === "officer"
          ? "officer"
          : edge.kind === "shareholding"
            ? "share"
            : edge.kind === "relative"
              ? "relative"
              : "group";
    // 会社グループ枠メンバーは出資があっても枠内。紹介は外側へ。
    if (groupMemberIds.has(other) && ring !== "referral") {
      continue;
    }
    const prev = neighborByRing.get(other);
    if (!prev || ringPriority(ring) < ringPriority(prev)) {
      neighborByRing.set(other, ring);
    }
  }

  // グループ枠メンバー同士の 2 ホップも枠内に
  if (showGroupHulls && groupMemberIds.size > 0) {
    const groupIdSet = new Set([focusClientId, ...groupMemberIds]);
    for (const edge of scopedRelations) {
      if (!(groupIdSet.has(edge.fromClientId) && groupIdSet.has(edge.toClientId))) continue;
      for (const id of [edge.fromClientId, edge.toClientId]) {
        if (id === focusClientId || !byId.has(id) || neighborByRing.has(id)) continue;
        neighborByRing.set(id, "group");
        groupMemberIds.add(id);
      }
    }
  }

  const buckets: Record<
    Exclude<RelationGraphNode["ring"], "focus" | "other">,
    string[]
  > = { group: [], relative: [], share: [], officer: [], referral: [] };
  for (const [id, ring] of neighborByRing) {
    if (ring !== "focus" && ring !== "other") {
      buckets[ring].push(id);
    }
  }

  const focusSize = nodeSize("focus");
  const nodes: RelationGraphNode[] = [
    {
      id: focus.id,
      client: focus,
      x: CX,
      y: CY,
      ring: "focus",
      w: focusSize.w,
      h: focusSize.h,
    },
  ];

  const placed = new Set<string>([focus.id]);
  const pushNode = (
    id: string,
    ring: RelationGraphNode["ring"],
    x: number,
    y: number,
  ) => {
    if (placed.has(id)) return;
    const client = byId.get(id);
    if (!client) return;
    const size = nodeSize(ring);
    nodes.push({ id, client, x, y, ring, w: size.w, h: size.h });
    placed.add(id);
  };

  // --- グループ: グループごとに扇を分け、枠同士の重なりを抑える ---
  if (buckets.group.length > 0 && orderedGroups.length > 0) {
    const perGroup = orderedGroups.map((g) =>
      uniqueIds(
        g.clientIds.filter((id) => id !== focusClientId && buckets.group.includes(id)),
      ),
    );
    const nBuckets = Math.max(1, perGroup.filter((p) => p.length > 0).length);
    let slot = 0;
    perGroup.forEach((ids) => {
      if (ids.length === 0) return;
      // 左上〜右上をグループ数で分割（紹介の真上帯は空ける）
      const band = Math.PI * 0.85;
      const sweep = band / nBuckets - 0.1;
      const start = -Math.PI + 0.2 + slot * (band / nBuckets);
      const radius = 195 + slot * 28;
      const pts = placeOnArc(ids.length, radius, start, sweep);
      ids.forEach((id, i) => {
        const pt = pts[i];
        if (pt) pushNode(id, "group", pt.x, pt.y);
      });
      slot += 1;
    });
    const leftovers = buckets.group.filter((id) => !placed.has(id));
    if (leftovers.length) {
      const pts = placeOnArc(leftovers.length, 215, -Math.PI * 0.2, Math.PI * 0.25);
      leftovers.forEach((id, i) => {
        const pt = pts[i];
        if (pt) pushNode(id, "group", pt.x, pt.y);
      });
    }
  } else if (buckets.group.length > 0) {
    const pts = placeOnArc(buckets.group.length, 200, -Math.PI * 0.95, Math.PI * 0.85);
    buckets.group.forEach((id, i) => {
      const pt = pts[i];
      if (pt) pushNode(id, "group", pt.x, pt.y);
    });
  }

  // --- 親族: 右下 ---
  {
    const pts = placeOnArc(buckets.relative.length, 250, Math.PI * 0.08, Math.PI * 0.4);
    buckets.relative.forEach((id, i) => {
      const pt = pts[i];
      if (pt) pushNode(id, "relative", pt.x, pt.y);
    });
  }

  // --- 出資: 左下（枠メンバー以外の株主） ---
  {
    const pts = placeOnArc(buckets.share.length, 255, Math.PI * 0.55, Math.PI * 0.45);
    buckets.share.forEach((id, i) => {
      const pt = pts[i];
      if (pt) pushNode(id, "share", pt.x, pt.y);
    });
  }

  // --- 役員・代表: 右の外側（出資・親族の扇と分離） ---
  {
    const pts = placeOnArc(
      buckets.officer.length,
      330,
      -Math.PI * 0.1,
      Math.PI * 0.2,
    );
    buckets.officer.forEach((id, i) => {
      const pt = pts[i];
      if (pt) pushNode(id, "officer", pt.x, pt.y);
    });
  }

  // --- 紹介: 真上・外側（グループ枠・他線と分離） ---
  {
    const pts = placeOnArc(
      buckets.referral.length,
      310,
      -Math.PI / 2 - 0.28,
      0.56,
    );
    buckets.referral.forEach((id, i) => {
      const pt = pts[i];
      if (pt) pushNode(id, "referral", pt.x, pt.y);
    });
  }

  const pos = new Map(nodes.map((n) => [n.id, n]));
  const nodeIds = new Set(nodes.map((n) => n.id));

  const rawEdges = scopedRelations.filter(
    (e) =>
      nodeIds.has(e.fromClientId) &&
      nodeIds.has(e.toClientId) &&
      shouldDrawEdge(e, viewMode),
  );

  // グループ専用: 枠内の線はフォーカスとの接続だけ（相互線で散らかさない）
  const edges =
    viewMode === "group"
      ? rawEdges.filter(
          (e) => e.fromClientId === focusClientId || e.toClientId === focusClientId,
        )
      : rawEdges;

  const hulls: RelationGraphHull[] = showGroupHulls
    ? orderedGroups.map((g, gi) => {
        const members = g.clientIds
          .map((id) => pos.get(id))
          .filter(Boolean) as RelationGraphNode[];
        if (members.length === 0) {
          return {
            groupId: g.id,
            name: g.name,
            clientIds: g.clientIds,
            cx: CX + (gi % 2 === 0 ? -40 : 40),
            cy: CY - 80 - gi * 24,
            rx: 100,
            ry: 70,
          };
        }
        const xs = members.flatMap((m) => [m.x - m.w / 2, m.x + m.w / 2]);
        const ys = members.flatMap((m) => [m.y - m.h / 2, m.y + m.h / 2]);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        const pad = 28 + gi * 4;
        // 枠が入れ子に見えないよう、インデックスで大きさと中心をずらす
        const nudgeX = (gi % 2 === 0 ? -1 : 1) * gi * 18;
        const nudgeY = gi * -14;
        return {
          groupId: g.id,
          name: g.name,
          clientIds: g.clientIds,
          cx: (minX + maxX) / 2 + nudgeX,
          cy: (minY + maxY) / 2 + nudgeY,
          rx: Math.max(88, (maxX - minX) / 2 + pad),
          ry: Math.max(64, (maxY - minY) / 2 + pad),
        };
      })
    : [];

  return { width: WIDTH, height: HEIGHT, nodes, edges, hulls };
}

function ringPriority(ring: RelationGraphNode["ring"]): number {
  switch (ring) {
    case "referral":
      return 0;
    case "officer":
      return 1;
    case "share":
      return 2;
    case "relative":
      return 3;
    case "group":
      return 4;
    default:
      return 9;
  }
}

export function edgeStroke(kind: ClientRelationKind): {
  stroke: string;
  dash?: string;
  width: number;
  label: string;
} {
  switch (kind) {
    case "group_company":
      return { stroke: "#93c5fd", width: 2, label: "" };
    case "relative":
      return { stroke: "#6d28d9", width: 3.5, label: "親族" };
    case "shareholding":
      return { stroke: "#0f766e", width: 4, label: "出資" };
    case "referral":
      return { stroke: "#c2410c", dash: "8 5", width: 3.5, label: "紹介" };
    case "officer":
      return { stroke: "#a21caf", width: 3.5, label: "代表" };
    default:
      return { stroke: "#64748b", width: 2.5, label: "" };
  }
}

/** 線上に出す文字。役員はメモの役職名（代表取締役など）を優先 */
export function relationEdgeLabel(edge: ClientRelationEdge): string {
  const style = edgeStroke(edge.kind);
  if (edge.kind === "officer") {
    return (edge.note ?? "").trim() || style.label;
  }
  if (edge.kind === "shareholding" && edge.percent != null) {
    return `${style.label} ${edge.percent}%`;
  }
  return style.label;
}
