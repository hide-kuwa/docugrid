/** Scripted demo data — no backend OCR. */

export type DemoMetric = {
  key: string;
  label: string;
  value: number;
  formatted: string;
};

export type DemoClient = {
  id: string;
  name: string;
  fiscal: number;
};

export type DemoSlotDef = {
  id: string;
  title: string;
  /** Drag payload id that this slot accepts */
  sampleId: string;
  sampleFileName: string;
  pageCount: number;
};

export type DemoSampleFile = {
  id: string;
  label: string;
  shortLabel: string;
  kind: "pdf" | "image";
};

export const DEMO_CLIENTS: DemoClient[] = [
  { id: "c-a", name: "株式会社A", fiscal: 3 },
  { id: "c-b", name: "合同会社B", fiscal: 12 },
  { id: "c-c", name: "個人事業C", fiscal: 3 },
];

export const DEMO_PERIODS = ["1月", "2月", "3月", "4月", "5月"] as const;

/** デモでドロップ操作できるセル（株式会社A × 3月） */
export const DEMO_PLAY_CLIENT_IDX = 0;
export const DEMO_PLAY_PERIOD_IDX = 2;

export function demoCellKey(clientIdx: number, periodIdx: number, slotIdx: number): string {
  return `${clientIdx}:${periodIdx}:${slotIdx}`;
}

export function isDemoPlayCell(clientIdx: number, periodIdx: number): boolean {
  return clientIdx === DEMO_PLAY_CLIENT_IDX && periodIdx === DEMO_PLAY_PERIOD_IDX;
}

export const DEMO_SAMPLES: DemoSampleFile[] = [
  { id: "trial_balance", label: "試算表_2025上期.pdf", shortLabel: "試算表", kind: "pdf" },
  { id: "ledger", label: "総勘定元帳_3月.pdf", shortLabel: "元帳", kind: "pdf" },
  { id: "invoice", label: "請求書_株式会社A.pdf", shortLabel: "請求書", kind: "pdf" },
  { id: "payroll", label: "給与明細_4月.pdf", shortLabel: "給与", kind: "pdf" },
];

/** 本番の月次監査スロットに合わせたラベル */
export const DEMO_SLOTS: DemoSlotDef[] = [
  {
    id: "0",
    title: "月次試算表",
    sampleId: "trial_balance",
    sampleFileName: "試算表_2025上期.pdf",
    pageCount: 2,
  },
  {
    id: "1",
    title: "通帳コピー",
    sampleId: "ledger",
    sampleFileName: "総勘定元帳_3月.pdf",
    pageCount: 48,
  },
  {
    id: "2",
    title: "請求書綴り",
    sampleId: "invoice",
    sampleFileName: "請求書_株式会社A.pdf",
    pageCount: 1,
  },
  {
    id: "3",
    title: "給与台帳",
    sampleId: "payroll",
    sampleFileName: "給与明細_4月.pdf",
    pageCount: 3,
  },
];

/** 他セルにあらかじめ入っている資料（見た目用） */
export const DEMO_PREFILLED_CELLS: Record<string, string> = {
  "0:0:0": "trial_balance",
  "1:1:2": "invoice",
  "2:0:3": "payroll",
};

export const DEMO_METRICS_BY_SAMPLE: Record<string, DemoMetric[]> = {  trial_balance: [
    { key: "monthly.revenue", label: "月次売上", value: 5_000_000, formatted: "¥5,000,000" },
    { key: "annual.profit", label: "課税所得", value: 1_240_000, formatted: "¥1,240,000" },
    { key: "annual.consumption_taxable", label: "課税売上", value: 58_000_000, formatted: "¥58,000,000" },
  ],
  ledger: [
    { key: "monthly.revenue", label: "月次売上", value: 4_820_000, formatted: "¥4,820,000" },
    { key: "annual.revenue", label: "売上高", value: 52_400_000, formatted: "¥52,400,000" },
  ],
  invoice: [
    { key: "monthly.revenue", label: "月次売上", value: 880_000, formatted: "¥880,000" },
  ],
  payroll: [
    { key: "annual.profit", label: "課税所得", value: 980_000, formatted: "¥980,000" },
  ],
};

export const DEMO_OCR_STAGES = [
  "レイアウトを解析中…",
  "表構造を検出…",
  "数値を正規化…",
  "指標マップに反映…",
] as const;
