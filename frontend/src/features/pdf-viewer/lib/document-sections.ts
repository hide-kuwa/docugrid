/**
 * 税務申告書 PDF のページごとテキストから、受信通知・別表 N などの
 * セクション開始ページを検出し、必須帳票の索引を組み立てる。
 * pdf.js でクライアント側抽出するため、バックエンド呼び出し不要。
 */

export type DocumentSectionKind = "receipt" | "beppyo" | "attachment" | "cover";

export type DocumentSection = {
  /** 索引キー（例: beppyo_1, receipt, beppyo_5_1） */
  id: string;
  /** 表示名（例: 別表一, 受信通知） */
  label: string;
  kind: DocumentSectionKind;
  /** 0-based のページ番号（goToPage 用） */
  pageIndex: number;
};

export type RequiredScheduleStatus = {
  id: string;
  label: string;
  kind: DocumentSectionKind;
  present: boolean;
  /** 見つかった場合の 0-based ページ */
  pageIndex: number | null;
};

/** 全角→半角・空白除去して比較しやすくする */
function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[\s\u3000]+/g, "")
    .trim();
}

type BeppyoDef = {
  id: string;
  label: string;
  /** 正規化テキストに対するアンカー（別表番号 + 枝番号） */
  anchors: string[];
};

/** 法人税申告書の主要別表（1〜16 + 枝番号）。順序 = 索引の並び順 */
const CORP_TAX_BEPPYO: BeppyoDef[] = [
  { id: "beppyo_1", label: "別表一", anchors: ["別表一", "別表1"] },
  { id: "beppyo_1_1", label: "別表一（一）", anchors: ["別表一(一)", "別表1(1)"] },
  { id: "beppyo_2", label: "別表二", anchors: ["別表二", "別表2"] },
  { id: "beppyo_3_1", label: "別表三（一）", anchors: ["別表三(一)", "別表3(1)", "別表三"] },
  { id: "beppyo_4", label: "別表四", anchors: ["別表四", "別表4"] },
  { id: "beppyo_5_1", label: "別表五（一）", anchors: ["別表五(一)", "別表5(1)"] },
  { id: "beppyo_5_2", label: "別表五（二）", anchors: ["別表五(二)", "別表5(2)"] },
  { id: "beppyo_6_1", label: "別表六（一）", anchors: ["別表六(一)", "別表6(1)", "別表六"] },
  { id: "beppyo_7_1", label: "別表七（一）", anchors: ["別表七(一)", "別表7(1)", "別表七"] },
  { id: "beppyo_8_1", label: "別表八（一）", anchors: ["別表八(一)", "別表8(1)", "別表八"] },
  { id: "beppyo_9", label: "別表九", anchors: ["別表九", "別表9"] },
  { id: "beppyo_10", label: "別表十", anchors: ["別表十", "別表10"] },
  { id: "beppyo_11_1", label: "別表十一（一）", anchors: ["別表十一(一)", "別表11(1)", "別表十一"] },
  { id: "beppyo_12", label: "別表十二", anchors: ["別表十二", "別表12"] },
  { id: "beppyo_13", label: "別表十三", anchors: ["別表十三", "別表13"] },
  { id: "beppyo_14_2", label: "別表十四（二）", anchors: ["別表十四(二)", "別表14(2)", "別表十四"] },
  { id: "beppyo_15", label: "別表十五", anchors: ["別表十五", "別表15"] },
  { id: "beppyo_16_1", label: "別表十六（一）", anchors: ["別表十六(一)", "別表16(1)", "別表十六"] },
];

const RECEIPT_ANCHORS = ["受信通知", "納付区分番号通知", "メール詳細"];

/** 法人税申告書パッケージで通常そろえる帳票（必須チェックリスト） */
const CORP_TAX_REQUIRED: { id: string; label: string; kind: DocumentSectionKind }[] = [
  { id: "receipt", label: "受信通知", kind: "receipt" },
  { id: "beppyo_1", label: "別表一", kind: "beppyo" },
  { id: "beppyo_2", label: "別表二", kind: "beppyo" },
  { id: "beppyo_4", label: "別表四", kind: "beppyo" },
  { id: "beppyo_5_1", label: "別表五（一）", kind: "beppyo" },
  { id: "beppyo_5_2", label: "別表五（二）", kind: "beppyo" },
];

function detectBeppyoOnPage(normText: string): BeppyoDef | null {
  // 枝番号付き（別表五（一））を先に判定するため、anchors の長い順で総当り
  for (const def of CORP_TAX_BEPPYO) {
    for (const anchor of def.anchors) {
      const key = normalize(anchor);
      if (key && normText.includes(key)) {
        return def;
      }
    }
  }
  return null;
}

function isReceiptPage(normText: string): boolean {
  return RECEIPT_ANCHORS.some((anchor) => normText.includes(normalize(anchor)));
}

/**
 * ページテキスト配列（0-based）からセクション索引を構築する。
 * 同一 id は最初に出たページのみ採用（先頭ページ = セクション開始とみなす）。
 */
export function buildSectionsFromPageTexts(pageTexts: string[]): DocumentSection[] {
  const sections: DocumentSection[] = [];
  const seen = new Set<string>();

  pageTexts.forEach((raw, pageIndex) => {
    const normText = normalize(raw);
    if (!normText) return;

    if (isReceiptPage(normText) && !seen.has("receipt")) {
      seen.add("receipt");
      sections.push({ id: "receipt", label: "受信通知", kind: "receipt", pageIndex });
      return;
    }

    const beppyo = detectBeppyoOnPage(normText);
    if (beppyo && !seen.has(beppyo.id)) {
      seen.add(beppyo.id);
      sections.push({
        id: beppyo.id,
        label: beppyo.label,
        kind: "beppyo",
        pageIndex,
      });
    }
  });

  return sections.sort((a, b) => a.pageIndex - b.pageIndex);
}

/** 手動割当できる帳票候補（必須 + 主要別表） */
export function listAssignableSections(): {
  id: string;
  label: string;
  kind: DocumentSectionKind;
}[] {
  const seen = new Set<string>();
  const out: { id: string; label: string; kind: DocumentSectionKind }[] = [];
  for (const req of CORP_TAX_REQUIRED) {
    seen.add(req.id);
    out.push(req);
  }
  for (const def of CORP_TAX_BEPPYO) {
    if (seen.has(def.id)) continue;
    seen.add(def.id);
    out.push({ id: def.id, label: def.label, kind: "beppyo" });
  }
  return out;
}

/**
 * 自動検出セクションに、id → pageIndex の手動割当を重ねる。
 * 同一 id は手動が優先。ページ順に並べ直す。
 */
export function mergeManualSections(
  auto: DocumentSection[],
  overrides: Record<string, number>,
): DocumentSection[] {
  const byId = new Map(auto.map((s) => [s.id, { ...s }]));
  const assignable = new Map(
    listAssignableSections().map((a) => [a.id, a] as const),
  );

  for (const [id, pageIndex] of Object.entries(overrides)) {
    if (!Number.isFinite(pageIndex) || pageIndex < 0) continue;
    const meta = assignable.get(id) ?? byId.get(id);
    if (!meta) continue;
    byId.set(id, {
      id,
      label: meta.label,
      kind: meta.kind,
      pageIndex: Math.floor(pageIndex),
    });
  }

  return Array.from(byId.values()).sort((a, b) => a.pageIndex - b.pageIndex);
}

/** 必須帳票チェックリスト（法人税申告書向け） */
export function buildRequiredScheduleStatus(
  sections: DocumentSection[],
): RequiredScheduleStatus[] {
  const byId = new Map(sections.map((s) => [s.id, s]));
  return CORP_TAX_REQUIRED.map((req) => {
    const found = byId.get(req.id);
    return {
      id: req.id,
      label: req.label,
      kind: req.kind,
      present: Boolean(found),
      pageIndex: found ? found.pageIndex : null,
    };
  });
}

/** best ラベル等から「法人税申告書パッケージ」かどうかを判定 */
export function looksLikeCorpTaxPackage(
  documentLabel: string | undefined,
  sections: DocumentSection[],
): boolean {
  const label = (documentLabel ?? "").normalize("NFKC");
  if (label.includes("法人税") || label.includes("申告")) return true;
  return sections.some((s) => s.kind === "beppyo");
}
