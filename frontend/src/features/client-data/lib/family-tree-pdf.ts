/** 家系図 SVG → A4 1 ページ PDF（関係図と同じ JPEG 埋め込み方式） */

import type { OrgClient } from "@/config/organization";
import {
  FAMILY_GENERATION_LABEL,
  type FamilyMember,
} from "@/features/client-data/lib/family-tree-api";
import {
  computeStatutoryHeirs,
  formatFraction,
  HEIR_RANK_LABEL,
} from "@/features/client-data/lib/family-tree-heirs";
import {
  FAMILY_CARD_H,
  FAMILY_CARD_W,
  FAMILY_HEADER_H,
  FAMILY_ROW_H,
  FAMILY_ROW_LABELS,
  familyCardValues,
  layoutFamilyTree,
} from "@/features/client-data/lib/family-tree-layout";
import {
  buildA4JpegPdf,
  escapeXml,
  svgToJpegBytes,
  type PdfPageOrientation,
} from "@/features/client-data/lib/relation-diagram-pdf";

export const FAMILY_COLORS = {
  header: "#1f3a5f",
  label: "#dde3f0",
  band: "#4b5563",
  line: "#111827",
  deceased: "#6b7280",
  heir: "#b45309",
} as const;

const LABEL_W = 58;

function fit(text: string, maxChars: number): string {
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
}

export function familyDisplayName(member: FamilyMember, clientsById: Map<string, OrgClient>): string {
  const linked = member.linked_client_id ? clientsById.get(member.linked_client_id) : undefined;
  return linked?.name || member.name;
}

export function buildFamilyTreeSvg(args: {
  focus: OrgClient;
  members: FamilyMember[];
  decedentId: string | null;
  clients: OrgClient[];
  orientation: PdfPageOrientation;
}): string {
  const { focus, members, decedentId, orientation } = args;
  const clientsById = new Map(args.clients.map((c) => [c.id, c]));
  const layout = layoutFamilyTree(members);
  const heirResult = computeStatutoryHeirs(members, decedentId);
  const heirById = new Map((heirResult?.heirs ?? []).map((h) => [h.memberId, h]));
  const byId = new Map(members.map((m) => [m.id, m]));

  const pad = 24;
  const headerH = 64;
  const summaryLines: string[] = [];
  if (heirResult) {
    const decedent = byId.get(decedentId ?? "");
    summaryLines.push(
      `法定相続人（被相続人: ${decedent ? familyDisplayName(decedent, clientsById) : ""}）  相続税の法定相続人の数 ${heirResult.taxHeirCount} 人 / 基礎控除 ${heirResult.basicDeductionYen.toLocaleString("ja-JP")} 円`,
    );
    for (const h of heirResult.heirs) {
      const m = byId.get(h.memberId);
      if (!m) continue;
      summaryLines.push(
        `・${familyDisplayName(m, clientsById)}（${m.relation || "続柄未入力"}） ${HEIR_RANK_LABEL[h.rank]}${h.representation ? "・代襲" : ""}  法定相続分 ${formatFraction(h.share)}`,
      );
    }
    for (const note of heirResult.notes) summaryLines.push(`※ ${note}`);
  }
  const summaryH = summaryLines.length ? summaryLines.length * 16 + 16 : 0;
  const totalW = layout.width + pad * 2;
  const totalH = headerH + layout.height + summaryH + pad * 2;
  const ox = pad;
  const oy = pad + headerH;

  const bands = layout.bands
    .map(
      (b) => `<rect x="${ox}" y="${oy + b.y}" width="${layout.width}" height="22" fill="${FAMILY_COLORS.band}"/>
  <text x="${ox + 8}" y="${oy + b.y + 15}" font-size="11" font-weight="800" fill="#ffffff">${escapeXml(FAMILY_GENERATION_LABEL[b.generation] ?? `第${b.generation}世代`)}</text>`,
    )
    .join("");

  const connectors = layout.connectors
    .map((c) => {
      const xs = [c.fromX, ...c.toXs];
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const drops = c.toXs
        .map((x) => `<line x1="${ox + x}" y1="${oy + c.barY}" x2="${ox + x}" y2="${oy + c.toY - 32}" />`)
        .join("");
      return `<g stroke="${FAMILY_COLORS.line}" stroke-width="1.4" fill="none">
    <line x1="${ox + c.fromX}" y1="${oy + c.fromY}" x2="${ox + c.fromX}" y2="${oy + c.barY}" />
    <line x1="${ox + minX}" y1="${oy + c.barY}" x2="${ox + maxX}" y2="${oy + c.barY}" />
    ${drops}
  </g>`;
    })
    .join("");

  const today = new Date();
  const cards = layout.cards
    .map(({ member, x, y }) => {
      const cx = ox + x;
      const cy = oy + y;
      const name = familyDisplayName(member, clientsById);
      const values = familyCardValues(member, name, today);
      const headerFill = member.deceased ? FAMILY_COLORS.deceased : FAMILY_COLORS.header;
      const rows = FAMILY_ROW_LABELS.map((label, i) => {
        const ry = cy + FAMILY_HEADER_H + i * FAMILY_ROW_H;
        return `<rect x="${cx}" y="${ry}" width="${LABEL_W}" height="${FAMILY_ROW_H}" fill="${FAMILY_COLORS.label}" stroke="${FAMILY_COLORS.line}" stroke-width="0.6"/>
      <rect x="${cx + LABEL_W}" y="${ry}" width="${FAMILY_CARD_W - LABEL_W}" height="${FAMILY_ROW_H}" fill="#ffffff" stroke="${FAMILY_COLORS.line}" stroke-width="0.6"/>
      <text x="${cx + LABEL_W / 2}" y="${ry + 12.5}" text-anchor="middle" font-size="8.5" font-weight="700" fill="#1f2937">${escapeXml(label)}</text>
      <text x="${cx + LABEL_W + 4}" y="${ry + 12.5}" font-size="9" fill="#111827">${escapeXml(fit(values[i] ?? "", 13))}</text>`;
      }).join("");
      const heir = heirById.get(member.id);
      const badge =
        member.id === decedentId
          ? { text: "被相続人", color: FAMILY_COLORS.deceased }
          : heir
            ? { text: `相続人 ${formatFraction(heir.share)}`, color: FAMILY_COLORS.heir }
            : null;
      const badgeSvg = badge
        ? `<rect x="${cx + FAMILY_CARD_W - 74}" y="${cy - 15}" width="74" height="14" rx="3" fill="${badge.color}"/>
      <text x="${cx + FAMILY_CARD_W - 37}" y="${cy - 5}" text-anchor="middle" font-size="8.5" font-weight="800" fill="#ffffff">${escapeXml(badge.text)}</text>`
        : "";
      const linkedSvg = member.linked_client_id
        ? `<text x="${cx}" y="${cy - 5}" font-size="8.5" font-weight="800" fill="#0f766e">顧問先</text>`
        : "";
      return `<g>
      ${badgeSvg}${linkedSvg}
      <rect x="${cx}" y="${cy}" width="${FAMILY_CARD_W}" height="${FAMILY_CARD_H}" fill="#ffffff" stroke="${FAMILY_COLORS.line}" stroke-width="1.2"/>
      <rect x="${cx}" y="${cy}" width="${FAMILY_CARD_W}" height="${FAMILY_HEADER_H}" fill="${headerFill}"/>
      <text x="${cx + LABEL_W / 2}" y="${cy + 15}" text-anchor="middle" font-size="10" font-weight="800" fill="#ffffff">続柄</text>
      <text x="${cx + LABEL_W + 4}" y="${cy + 15}" font-size="10" font-weight="800" fill="#ffffff">${escapeXml(fit(member.relation + (member.adopted ? "（養子）" : ""), 11))}</text>
      ${rows}
    </g>`;
    })
    .join("");

  const summaryY = oy + layout.height + 16;
  const summary = summaryLines
    .map(
      (line, i) =>
        `<text x="${ox}" y="${summaryY + i * 16 + 10}" font-size="${i === 0 ? 11 : 10}" font-weight="${i === 0 ? 800 : 600}" fill="#1f2937">${escapeXml(line)}</text>`,
    )
    .join("");

  const orientLabel = orientation === "portrait" ? "A4縦" : "A4横";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <rect x="${ox}" y="${pad}" width="${layout.width}" height="26" fill="${FAMILY_COLORS.header}"/>
  <text x="${ox + 10}" y="${pad + 18}" font-size="14" font-weight="800" fill="#ffffff">■ 家系図 — ${escapeXml(focus.name)}</text>
  <text x="${ox}" y="${pad + 46}" font-size="10" fill="#64748b">${escapeXml(new Date().toLocaleString("ja-JP"))} · DocuGrid · ${orientLabel}印刷 · 永続スロット「家系図」</text>
  ${bands}
  ${connectors}
  ${cards}
  ${summary}
</svg>`;
}

export async function buildFamilyTreePdfFile(args: {
  focus: OrgClient;
  members: FamilyMember[];
  decedentId: string | null;
  clients: OrgClient[];
  orientation: PdfPageOrientation;
}): Promise<File> {
  const svg = buildFamilyTreeSvg(args);
  const { bytes, width, height } = await svgToJpegBytes(svg, 2.5);
  const pdf = buildA4JpegPdf(bytes, width, height, args.orientation);
  const orientTag = args.orientation === "portrait" ? "縦" : "横";
  const stamp = new Date().toISOString().slice(0, 10);
  const name = `家系図_${args.focus.name.replace(/\s+/g, "")}_A4${orientTag}_${stamp}.pdf`;
  return new File([pdf as BlobPart], name, { type: "application/pdf" });
}
