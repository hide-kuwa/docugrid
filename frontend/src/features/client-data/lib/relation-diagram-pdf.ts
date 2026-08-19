/**
 * 関係図 SVG → JPEG → A4 1 ページ PDF（外部ライブラリなし）。
 * 縦向き / 横向きを選択可。DocuGrid 永続スロットへ載せる用。
 */

import {
  edgeAnchor,
  edgeStroke,
  layoutClientRelations,
  RELATION_VIEW_MODES,
  shouldDrawEdgeLabel,
  type RelationViewMode,
} from "@/features/client-data/lib/client-relations-layout";
import {
  arrowStyleForKind,
  computeArrowHead,
} from "@/features/client-data/lib/relation-arrowheads";
import {
  applyManualNodePositions,
  emptyManualLayout,
  type RelationDiagramManualLayout,
} from "@/features/client-data/lib/relation-diagram-manual-layout";
import type {
  ClientFamilyGroup,
  ClientRelationEdge,
  OrgClient,
} from "@/config/organization";
import { RELATION_KIND_LABEL } from "@/config/organization";

/** PDF 用紙向き（A4） */
export type PdfPageOrientation = "portrait" | "landscape";

export const PDF_PAGE_ORIENTATIONS: {
  id: PdfPageOrientation;
  label: string;
  hint: string;
}[] = [
  { id: "portrait", label: "縦", hint: "A4 縦向き（印刷向け）" },
  { id: "landscape", label: "横", hint: "A4 横向き（図が広いとき向き）" },
];

/** ISO A4 in PDF points (1/72") */
const A4_PORTRAIT = { pageW: 595.28, pageH: 841.89 } as const;
/** 余白（約 12mm） */
const A4_MARGIN_PT = 36;

function a4MediaBox(orientation: PdfPageOrientation): {
  pageW: number;
  pageH: number;
} {
  if (orientation === "landscape") {
    return { pageW: A4_PORTRAIT.pageH, pageH: A4_PORTRAIT.pageW };
  }
  return { pageW: A4_PORTRAIT.pageW, pageH: A4_PORTRAIT.pageH };
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shortName(name: string): string {
  return name
    .replace(/^株式会社\s*/, "")
    .replace(/^合同会社\s*/, "")
    .replace(/^有限会社\s*/, "")
    .trim();
}

function legendItems(viewMode: RelationViewMode): { color: string; label: string; dash?: boolean }[] {
  const items: { color: string; label: string; dash?: boolean }[] = [];
  if (viewMode === "all" || viewMode === "group") {
    items.push({ color: "#60a5fa", label: "グループ枠" });
  }
  if (viewMode === "all" || viewMode === "family") {
    items.push({ color: "#6d28d9", label: "親族" });
  }
  if (viewMode === "all" || viewMode === "ownership") {
    items.push({ color: "#0f766e", label: "出資％" });
  }
  if (viewMode === "all" || viewMode === "referral") {
    items.push({ color: "#c2410c", label: "紹介", dash: true });
  }
  items.push({ color: "#94a3b8", label: "法人" });
  items.push({ color: "#fb7185", label: "個人" });
  return items;
}

/** 凡例付きの書き出し用 SVG 文字列を組み立てる */
export function buildRelationDiagramSvg(args: {
  focus: OrgClient;
  clients: OrgClient[];
  groups: ClientFamilyGroup[];
  relations: ClientRelationEdge[];
  viewMode: RelationViewMode;
  orientation?: PdfPageOrientation;
  manual?: RelationDiagramManualLayout | null;
}): string {
  const { focus, clients, groups, relations, viewMode } = args;
  const orientation = args.orientation ?? "landscape";
  const manual = args.manual ?? emptyManualLayout();
  const layout = applyManualNodePositions(
    layoutClientRelations(focus.id, clients, groups, relations, viewMode),
    manual,
  );
  const modeMeta = RELATION_VIEW_MODES.find((m) => m.id === viewMode);
  const headerH = 72;
  const legendH = 36;
  const pad = 24;
  const totalW = layout.width + pad * 2;
  const totalH = layout.height + headerH + legendH + pad * 2;
  const ox = pad;
  const oy = pad + headerH;
  const orientLabel = orientation === "portrait" ? "A4縦" : "A4横";

  const legend = legendItems(viewMode);
  let legendX = ox;
  const legendY = pad + headerH + layout.height + 14;
  const legendSvg = legend
    .map((item) => {
      const w = 12;
      const chunk = item.dash
        ? `<line x1="${legendX}" y1="${legendY}" x2="${legendX + w}" y2="${legendY}" stroke="${item.color}" stroke-width="3" stroke-dasharray="4 3"/>`
        : `<rect x="${legendX}" y="${legendY - 5}" width="${w}" height="10" rx="2" fill="${item.color}"/>`;
      const text = `<text x="${legendX + w + 4}" y="${legendY + 4}" font-size="11" font-weight="700" fill="#334155">${escapeXml(item.label)}</text>`;
      const block = `${chunk}${text}`;
      legendX += item.label.length * 12 + 28;
      return block;
    })
    .join("");

  const nodeById = new Map(layout.nodes.map((n) => [n.id, n]));

  const hulls = layout.hulls
    .map((hull, hullIdx) => {
      const x = ox + hull.cx - hull.rx;
      const y = oy + hull.cy - hull.ry;
      const labelX = x + 10;
      const labelY = y + 16 + (hullIdx % 3) * 2;
      return `<g>
        <rect x="${x}" y="${y}" width="${hull.rx * 2}" height="${hull.ry * 2}" rx="6" fill="#dbeafe" fill-opacity="0.32" stroke="#60a5fa" stroke-width="2"/>
        <text x="${labelX}" y="${labelY}" text-anchor="start" font-size="11" font-weight="700" fill="#1e40af">${escapeXml(hull.name)}</text>
      </g>`;
    })
    .join("");

  const edges = layout.edges
    .map((edge, edgeIdx) => {
      const from = nodeById.get(edge.fromClientId);
      const to = nodeById.get(edge.toClientId);
      if (!from || !to) return "";
      const style = edgeStroke(edge.kind);
      const a = edgeAnchor(from, to);
      const dx = a.x2 - a.x1;
      const dy = a.y2 - a.y1;
      const len = Math.hypot(dx, dy) || 1;
      const spread =
        edge.kind === "referral" ? 18 : edge.kind === "shareholding" ? 12 : 9;
      const lane =
        edge.kind === "referral" ? 2 : edge.kind === "shareholding" ? -1 : edge.kind === "relative" ? 1 : 0;
      const off = ((edgeIdx % 3) - 1) * (spread / 2) + lane * 6;
      const oxn = (-dy / len) * off;
      const oyn = (dx / len) * off;
      const ax1 = ox + a.x1 + oxn;
      const ay1 = oy + a.y1 + oyn;
      const ax2 = ox + a.x2 + oxn;
      const ay2 = oy + a.y2 + oyn;
      const bend = manual.bends[edge.id] ?? { x: 0, y: 0 };
      const midX = (ax1 + ax2) / 2 + bend.x;
      const midY = (ay1 + ay2) / 2 + bend.y;
      const arrowMeta = arrowStyleForKind(edge.kind);
      const head = arrowMeta
        ? computeArrowHead(midX, midY, ax2, ay2, {
            length: arrowMeta.length,
            half: arrowMeta.half,
          })
        : null;
      const lineEndX = head?.lineX2 ?? ax2;
      const lineEndY = head?.lineY2 ?? ay2;
      const pathD = head
        ? `M ${ax1} ${ay1} Q ${midX} ${midY} ${lineEndX} ${lineEndY}`
        : `M ${ax1} ${ay1} Q ${midX} ${midY} ${ax2} ${ay2}`;
      const t =
        edge.kind === "referral" ? 0.32 : edge.kind === "shareholding" ? 0.58 : 0.45;
      const qx =
        (1 - t) * (1 - t) * ax1 + 2 * (1 - t) * t * midX + t * t * ax2;
      const qy =
        (1 - t) * (1 - t) * ay1 + 2 * (1 - t) * t * midY + t * t * ay2;
      const lo = manual.labels[edge.id] ?? { x: 0, y: 0 };
      const mx = qx + lo.x;
      const my = qy + lo.y;
      const showLabel = shouldDrawEdgeLabel(edge.kind, viewMode);
      const label =
        edge.kind === "shareholding" && edge.percent != null
          ? `${style.label} ${edge.percent}%`
          : style.label || RELATION_KIND_LABEL[edge.kind];
      const labelW = Math.max(52, label.length * 11);
      const dash = style.dash ? ` stroke-dasharray="${style.dash}"` : "";
      const labelSvg =
        showLabel && style.label
          ? `<rect x="${mx - labelW / 2}" y="${my - 11}" width="${labelW}" height="20" rx="4" fill="#ffffff" stroke="${style.stroke}" stroke-width="1.5"/>
        <text x="${mx}" y="${my + 3}" text-anchor="middle" font-size="11" font-weight="800" fill="${style.stroke}">${escapeXml(label)}</text>`
          : "";
      let headSvg = "";
      if (head && arrowMeta?.style === "dart") {
        headSvg = `<polygon points="${head.dartPoints}" fill="${style.stroke}" stroke="${style.stroke}" stroke-width="0.6" stroke-linejoin="round"/>`;
      } else if (head && arrowMeta?.style === "chevron") {
        headSvg = `<path d="${head.chevronPath}" fill="none" stroke="${style.stroke}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`;
      }
      return `<g>
        <path d="${pathD}" fill="none" stroke="#ffffff" stroke-width="${style.width + 5}" stroke-linecap="round"/>
        <path d="${pathD}" fill="none" stroke="${style.stroke}" stroke-width="${style.width}"${dash} stroke-linecap="round" stroke-linejoin="round"/>
        ${headSvg}
        ${labelSvg}
      </g>`;
    })
    .join("");

  const nodes = layout.nodes
    .map((node) => {
      const isIndiv = node.client.category === "individual";
      const isFocus = node.ring === "focus";
      const x = ox + node.x - node.w / 2;
      const y = oy + node.y - node.h / 2;
      const fill = isFocus ? "#0f172a" : isIndiv ? "#fff1f2" : "#ffffff";
      const stroke = isFocus ? "#f59e0b" : isIndiv ? "#fb7185" : "#94a3b8";
      const textFill = isFocus ? "#f8fafc" : "#0f172a";
      const subFill = isFocus ? "#94a3b8" : "#64748b";
      const rx = isIndiv ? 12 : 6;
      return `<g>
        <rect x="${x}" y="${y}" width="${node.w}" height="${node.h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${isFocus ? 2.5 : 1.75}"/>
        <text x="${ox + node.x}" y="${oy + node.y - 2}" text-anchor="middle" font-size="11" font-weight="800" fill="${textFill}">${escapeXml(shortName(node.client.name).slice(0, 10))}</text>
        <text x="${ox + node.x}" y="${oy + node.y + 12}" text-anchor="middle" font-size="9" font-weight="600" fill="${subFill}">${isIndiv ? "個人" : "法人"} · ${node.client.fiscalMonth}月</text>
      </g>`;
    })
    .join("");

  const exportedAt = new Date().toLocaleString("ja-JP");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="${ox}" y="${pad + 22}" font-size="18" font-weight="800" fill="#0f172a">関係図 — ${escapeXml(focus.name)}</text>
  <text x="${ox}" y="${pad + 42}" font-size="12" font-weight="600" fill="#64748b">${escapeXml(modeMeta?.label ?? viewMode)}（${escapeXml(modeMeta?.hint ?? "")}） · ${escapeXml(exportedAt)}</text>
  <text x="${ox}" y="${pad + 58}" font-size="10" fill="#94a3b8">DocuGrid · ${orientLabel}印刷 · 手動配置反映 · 永続スロット「関係図」</text>
  ${hulls}
  ${edges}
  ${nodes}
  ${legendSvg}
</svg>`;
}

async function svgToJpegBytes(
  svg: string,
  scale = 2,
): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const parsed = /viewBox="0 0 ([0-9.]+) ([0-9.]+)"/.exec(svg);
  const w = parsed ? Number(parsed[1]) : 900;
  const h = parsed ? Number(parsed[2]) : 640;
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("svg-rasterize-failed"));
      el.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas-unavailable");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.93);
    const b64 = dataUrl.split(",")[1] ?? "";
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes, width: canvas.width, height: canvas.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * JPEG を A4 1 ページに収める（余白付き・アスペクト比維持・上寄せ中央）。
 * PDF 座標系は左下原点。
 */
function buildA4JpegPdf(
  jpeg: Uint8Array,
  imgW: number,
  imgH: number,
  orientation: PdfPageOrientation,
): Uint8Array {
  const { pageW, pageH } = a4MediaBox(orientation);
  const availW = pageW - A4_MARGIN_PT * 2;
  const availH = pageH - A4_MARGIN_PT * 2;
  const fit = Math.min(availW / imgW, availH / imgH);
  const drawW = Math.round(imgW * fit * 100) / 100;
  const drawH = Math.round(imgH * fit * 100) / 100;
  const x = Math.round(((pageW - drawW) / 2) * 100) / 100;
  // 上余白固定で配置（印刷時にタイトルが見やすい）
  const y = Math.round((pageH - A4_MARGIN_PT - drawH) * 100) / 100;

  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let pos = 0;
  const add = (u8: Uint8Array) => {
    parts.push(u8);
    pos += u8.length;
  };
  const addStr = (s: string) => add(enc.encode(s));
  const startObj = () => {
    offsets.push(pos);
  };

  addStr("%PDF-1.4\n");
  startObj();
  addStr("1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n");
  startObj();
  addStr("2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n");
  startObj();
  addStr(
    `3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents 4 0 R /Resources<< /XObject<< /Im0 5 0 R >> >> >>endobj\n`,
  );
  // 白地の上に画像を配置（余白は白のまま）
  const content = `q\n1 1 1 rg 0 0 ${pageW} ${pageH} re f\nQ\nq ${drawW} 0 0 ${drawH} ${x} ${y} cm /Im0 Do Q\n`;
  startObj();
  addStr(`4 0 obj<< /Length ${content.length} >>stream\n${content}endstream\nendobj\n`);
  startObj();
  addStr(
    `5 0 obj<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>stream\n`,
  );
  add(jpeg);
  addStr(`\nendstream\nendobj\n`);

  const xrefPos = pos;
  addStr(`xref\n0 6\n`);
  addStr(`0000000000 65535 f \n`);
  for (let i = 0; i < offsets.length; i++) {
    addStr(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  }
  addStr(`trailer<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`);

  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export async function buildRelationDiagramPdfFile(args: {
  focus: OrgClient;
  clients: OrgClient[];
  groups: ClientFamilyGroup[];
  relations: ClientRelationEdge[];
  viewMode: RelationViewMode;
  /** 省略時は横向き（関係図が横長のため） */
  orientation?: PdfPageOrientation;
  /** 手動配置（ノード・ラベル・曲げ）。PDF に反映 */
  manual?: RelationDiagramManualLayout | null;
}): Promise<File> {
  const orientation = args.orientation ?? "landscape";
  const svg = buildRelationDiagramSvg({
    ...args,
    orientation,
    manual: args.manual ?? emptyManualLayout(),
  });
  // 印刷向けにやや高解像度
  const { bytes: jpeg, width, height } = await svgToJpegBytes(svg, 2.5);
  const pdf = buildA4JpegPdf(jpeg, width, height, orientation);
  const mode = args.viewMode;
  const orientTag = orientation === "portrait" ? "縦" : "横";
  const stamp = new Date().toISOString().slice(0, 10);
  const name = `関係図_${args.focus.name.replace(/\s+/g, "")}_${mode}_A4${orientTag}_${stamp}.pdf`;
  return new File([pdf as BlobPart], name, { type: "application/pdf" });
}
