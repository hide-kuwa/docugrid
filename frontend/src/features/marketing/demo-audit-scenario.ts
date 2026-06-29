/** Scripted audit tour — 決算書（当期純利益）× 別表四（先頭行）。hotspot coords are 0..1 on page. */

export type DemoPdfHotspot = {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type DemoAuditPair = {
  id: string;
  leftHotspotId: string;
  rightHotspotId: string;
  title: string;
  comment: string;
};

/** 左: 決算書（損益計算書）— 税引後当期純利益のみ */
export const DEMO_FS_HOTSPOTS: DemoPdfHotspot[] = [
  { id: "pl-net", label: "当期純利益", x: 0.08, y: 0.658, w: 0.84, h: 0.055 },
];

/** 右: 別表四 — 先頭行のみ */
export const DEMO_S4_HOTSPOTS: DemoPdfHotspot[] = [
  { id: "s4-profit", label: "当期利益又は当期欠損の額", x: 0.05, y: 0.158, w: 0.9, h: 0.048 },
];

export const DEMO_AUDIT_PAIRS: DemoAuditPair[] = [
  {
    id: "pair-net-profit",
    leftHotspotId: "pl-net",
    rightHotspotId: "s4-profit",
    title: "当期純利益",
    comment: "決算書の税引後利益と別表四・当期利益の額を照合",
  },
];

export const AUDIT_DEMO_COLORS = ["#059669", "#2563eb", "#d97706", "#7c3aed"] as const;

export type DemoAuditLink = {
  id: string;
  pairId: string;
  index: number;
  comment: string;
};

export type DemoPdfDoc = "financial_statement" | "schedule4";
