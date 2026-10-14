/**
 * 家系図レイアウト: 世代ごとの帯に「夫婦ペア」を並べ、親ペアの下に子ペアを置く。
 * 画面（HTML カード）と PDF（SVG）で同じ座標を使う。
 */

import {
  COHABITATION_LABEL,
  type FamilyMember,
} from "@/features/client-data/lib/family-tree-api";
import { ageLabel } from "@/features/client-data/lib/family-tree-heirs";

export const FAMILY_CARD_W = 168;
export const FAMILY_CARD_GAP = 6;
export const FAMILY_UNIT_GAP = 34;
export const FAMILY_HEADER_H = 22;
export const FAMILY_ROW_H = 18;
export const FAMILY_ROW_LABELS = [
  "氏名",
  "フリガナ",
  "生年月日",
  "年齢",
  "職業・勤務先",
  "同居・別居",
  "別居時住所",
] as const;
export const FAMILY_CARD_H = FAMILY_HEADER_H + FAMILY_ROW_H * FAMILY_ROW_LABELS.length;
const BAND_H = 22;
const BAND_TO_CARD = 10;
const CONNECTOR_SPACE = 44;
const PAD_X = 12;

function formatJpDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[1]}年${Number(m[2])}月${Number(m[3])}日` : iso;
}

/** カードの各行の値（FAMILY_ROW_LABELS と同じ順） */
export function familyCardValues(member: FamilyMember, displayName: string, today = new Date()): string[] {
  const birth = member.birth_date ? formatJpDate(member.birth_date) : "";
  const deathYear = member.death_date ? ` (${member.death_date.slice(0, 4)}年没)` : "";
  return [
    displayName,
    member.kana,
    birth,
    `${ageLabel(member, today)}${deathYear}`,
    member.occupation,
    COHABITATION_LABEL[member.cohabitation],
    member.cohabitation === "separate" ? member.address : "",
  ];
}

export type FamilyCardBox = { member: FamilyMember; x: number; y: number };

export type FamilyBand = { generation: number; y: number };

export type FamilyConnector = {
  /** 親ペアの下端中央 */
  fromX: number;
  fromY: number;
  /** 横線の高さ */
  barY: number;
  /** 子カードの上端中央 */
  toXs: number[];
  toY: number;
};

export type FamilyTreeLayout = {
  width: number;
  height: number;
  bands: FamilyBand[];
  cards: FamilyCardBox[];
  connectors: FamilyConnector[];
};

type Unit = {
  key: string;
  generation: number;
  /** 血縁側を先頭、配偶者を後ろ */
  members: FamilyMember[];
  children: Unit[];
  width: number;
  x: number;
};

function bySortOrder(a: FamilyMember, b: FamilyMember): number {
  return a.sort_order - b.sort_order || a.id.localeCompare(b.id);
}

export function layoutFamilyTree(members: FamilyMember[], minGenerations = 3): FamilyTreeLayout {
  const byId = new Map(members.map((m) => [m.id, m]));
  const unitOf = new Map<string, Unit>();
  const units: Unit[] = [];

  const sorted = [...members].sort(
    (a, b) =>
      a.generation - b.generation ||
      Number(a.parent_ids.length === 0) - Number(b.parent_ids.length === 0) ||
      bySortOrder(a, b),
  );
  for (const m of sorted) {
    if (unitOf.has(m.id)) continue;
    const spouse =
      (m.spouse_id ? byId.get(m.spouse_id) : undefined) ??
      members.find((o) => o.spouse_id === m.id);
    const pair =
      spouse && spouse.generation === m.generation && !unitOf.has(spouse.id) ? [m, spouse] : [m];
    // 血縁（親がいる側）を左に
    pair.sort((a, b) => Number(b.parent_ids.length > 0) - Number(a.parent_ids.length > 0));
    const unit: Unit = {
      key: pair.map((p) => p.id).join("+"),
      generation: m.generation,
      members: pair,
      children: [],
      width: pair.length * FAMILY_CARD_W + (pair.length - 1) * FAMILY_CARD_GAP,
      x: 0,
    };
    pair.forEach((p) => unitOf.set(p.id, unit));
    units.push(unit);
  }

  const roots: Unit[] = [];
  for (const unit of units) {
    const parentUnit = unit.members
      .flatMap((m) => m.parent_ids)
      .map((pid) => unitOf.get(pid))
      .find((u) => u && u.generation < unit.generation);
    if (parentUnit) parentUnit.children.push(unit);
    else roots.push(unit);
  }

  const subtreeWidth = (unit: Unit): number => {
    const kids = unit.children.reduce(
      (sum, c, i) => sum + subtreeWidth(c) + (i > 0 ? FAMILY_UNIT_GAP : 0),
      0,
    );
    return Math.max(unit.width, kids);
  };

  const place = (unit: Unit, left: number) => {
    const total = subtreeWidth(unit);
    unit.x = left + (total - unit.width) / 2;
    const kidsWidth = unit.children.reduce(
      (sum, c, i) => sum + subtreeWidth(c) + (i > 0 ? FAMILY_UNIT_GAP : 0),
      0,
    );
    let cursor = left + (total - kidsWidth) / 2;
    for (const child of unit.children) {
      place(child, cursor);
      cursor += subtreeWidth(child) + FAMILY_UNIT_GAP;
    }
  };

  // 世代が浅いルートから順に、同じ世代のルートは横に並べる
  const rootsByGen = new Map<number, Unit[]>();
  for (const r of roots) rootsByGen.set(r.generation, [...(rootsByGen.get(r.generation) ?? []), r]);
  let cursor = PAD_X;
  for (const gen of [...rootsByGen.keys()].sort((a, b) => a - b)) {
    for (const r of rootsByGen.get(gen) ?? []) {
      place(r, cursor);
      cursor += subtreeWidth(r) + FAMILY_UNIT_GAP;
    }
  }

  const maxGen = Math.max(minGenerations, ...members.map((m) => m.generation), 1);
  const rowStride = BAND_H + BAND_TO_CARD + FAMILY_CARD_H + CONNECTOR_SPACE;
  const bandY = (gen: number) => (gen - 1) * rowStride;
  const cardY = (gen: number) => bandY(gen) + BAND_H + BAND_TO_CARD;

  const cards: FamilyCardBox[] = [];
  const cardX = new Map<string, number>();
  for (const unit of units) {
    unit.members.forEach((m, i) => {
      const x = unit.x + i * (FAMILY_CARD_W + FAMILY_CARD_GAP);
      cardX.set(m.id, x);
      cards.push({ member: m, x, y: cardY(unit.generation) });
    });
  }

  const connectors: FamilyConnector[] = units
    .filter((u) => u.children.length > 0)
    .map((u) => {
      const fromY = cardY(u.generation) + FAMILY_CARD_H;
      const childGen = u.generation + 1;
      return {
        fromX: u.x + u.width / 2,
        fromY,
        barY: fromY + CONNECTOR_SPACE / 2,
        toXs: u.children.map((c) => (cardX.get(c.members[0]!.id) ?? c.x) + FAMILY_CARD_W / 2),
        toY: cardY(Math.min(...u.children.map((c) => c.generation), childGen)),
      };
    });

  const width = Math.max(cursor - FAMILY_UNIT_GAP + PAD_X, FAMILY_CARD_W * 2 + PAD_X * 2);
  return {
    width,
    height: cardY(maxGen) + FAMILY_CARD_H + 8,
    bands: Array.from({ length: maxGen }, (_, i) => ({ generation: i + 1, y: bandY(i + 1) })),
    cards,
    connectors,
  };
}
