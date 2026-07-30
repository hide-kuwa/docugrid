import { API_BASE } from "@/config/api";
import {
  CLIENT_PROFILE_SECTIONS,
  type ProfileFieldMeta,
} from "@/config/client-profile-fields";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";
import type { ClassifyPersistMetadata } from "@/features/docugrid/lib/classify";
import type { NormalizeResultPayload } from "@/features/docugrid/lib/slot-documents";

export type FieldExtractionStatus = "extracted" | "missing" | "low_confidence";

export type FieldExtractionItem = {
  field_id: string;
  label: string;
  value: string | null;
  confidence: number;
  status: FieldExtractionStatus;
  target: string;
  required: boolean;
};

export type ExtractionReviewPayload = {
  slot_id: string;
  document_label: string;
  schema_version: number;
  review_status: "complete" | "needs_review";
  fields: FieldExtractionItem[];
  extracted_profile?: Record<string, string>;
};

export type ApplyExtractionArgs = {
  clientId: string;
  periodKey: string;
  slotId: string;
  slotLabel?: string;
  fields: Record<string, string>;
};

/** 人が確認・補完したフィールドをマスタへ反映 */
export async function applyExtractionFields(
  args: ApplyExtractionArgs,
): Promise<NormalizeResultPayload> {
  const res = await authFetch(`${API_BASE}/extraction/apply`, {
    method: "POST",
    headers: {
      ...buildAuthHeaders(args.clientId),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: args.clientId,
      period_key: args.periodKey,
      slot_id: args.slotId,
      slot_label: args.slotLabel,
      fields: args.fields,
    }),
  });
  if (!res.ok) throw new Error(`extraction-apply-failed:${res.status}`);
  return (await res.json()) as NormalizeResultPayload;
}

export function pendingExtractionFields(
  review: ExtractionReviewPayload | null | undefined,
): FieldExtractionItem[] {
  if (!review?.fields?.length) return [];
  return review.fields.filter((f) => f.status !== "extracted" || !f.value);
}

export function appliedExtractionFields(
  review: ExtractionReviewPayload | null | undefined,
): FieldExtractionItem[] {
  if (!review?.fields?.length) return [];
  return review.fields.filter((f) => f.status === "extracted" && f.value);
}

const PROFILE_FIELD_LABEL_BY_ID = new Map(
  CLIENT_PROFILE_SECTIONS.flatMap((section) =>
    section.fields.map((field) => [field.id, field.label] as const),
  ),
);

export function profileFieldLabel(fieldId: string): string {
  return PROFILE_FIELD_LABEL_BY_ID.get(fieldId) ?? fieldId;
}

function slugFieldId(label: string): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_|_$/g, "");
  return base ? `ocr_${base}` : `ocr_field_${Math.random().toString(36).slice(2, 8)}`;
}

type KnownLabelDef = {
  fieldId: string;
  label: string;
  aliases: string[];
};

/**
 * 税務書類（e-Tax 受信通知・申告書）で頻出するラベル辞書。
 * ラベルを起点に「次の行 or 同一行の残り」を値として結び付けることで、
 * 位置ベースのペアリングで起きる行ズレを防ぐ。
 * client-master と紐づく項目は正規 fieldId、それ以外は ocr_ 接頭辞。
 */
const KNOWN_LABELS: KnownLabelDef[] = [
  {
    fieldId: "tax_office",
    label: "提出先（税務署）",
    aliases: ["提出先", "所轄税務署", "税務署"],
  },
  { fieldId: "etax_user_id", label: "利用者識別番号", aliases: ["利用者識別番号"] },
  {
    fieldId: "customer_name",
    label: "法人名・氏名",
    aliases: ["氏名又は名称", "氏名又ハ名称", "氏名又は名称等", "法人名", "名称"],
  },
  { fieldId: "representative_name", label: "代表者等氏名", aliases: ["代表者等氏名", "代表者氏名"] },
  { fieldId: "ocr_receipt_number", label: "受付番号", aliases: ["受付番号"] },
  { fieldId: "ocr_receipt_datetime", label: "受付日時", aliases: ["受付日時", "受信日時"] },
  { fieldId: "ocr_document_title", label: "書類種別", aliases: ["種目"] },
  { fieldId: "ocr_unit", label: "単位", aliases: ["単位"] },
  {
    fieldId: "ocr_fiscal_from",
    label: "事業年度（自）",
    aliases: ["事業年度（自）", "事業年度(自)", "事業年度 自"],
  },
  {
    fieldId: "ocr_fiscal_to",
    label: "事業年度（至）",
    aliases: ["事業年度（至）", "事業年度(至)", "事業年度 至"],
  },
];

export type CanonicalOcrFieldDef = {
  field_id: string;
  label: string;
  target: "client-master" | "document";
};

type CanonicalOcrSchema = {
  id: string;
  label: string;
  fields: CanonicalOcrFieldDef[];
};

const COMMON_TAX_FIELDS = {
  documentTitle: { field_id: "ocr_document_title", label: "書類種別", target: "document" },
  customerName: { field_id: "customer_name", label: "法人名・氏名", target: "client-master" },
  taxOffice: { field_id: "tax_office", label: "提出先（税務署）", target: "client-master" },
  fiscalFrom: { field_id: "ocr_fiscal_from", label: "事業年度（自）", target: "document" },
  fiscalTo: { field_id: "ocr_fiscal_to", label: "事業年度（至）", target: "document" },
  etaxUserId: { field_id: "etax_user_id", label: "利用者識別番号", target: "client-master" },
  receiptNumber: { field_id: "ocr_receipt_number", label: "受付番号", target: "document" },
  receiptDatetime: { field_id: "ocr_receipt_datetime", label: "受付日時", target: "document" },
  unit: { field_id: "ocr_unit", label: "単位", target: "document" },
} satisfies Record<string, CanonicalOcrFieldDef>;

const GENERIC_SCHEMA: CanonicalOcrSchema = {
  id: "generic",
  label: "資料",
  fields: [COMMON_TAX_FIELDS.documentTitle],
};

const TAX_RECEIPT_SCHEMA: CanonicalOcrSchema = {
  id: "tax_receipt",
  label: "受信通知",
  fields: [
    COMMON_TAX_FIELDS.documentTitle,
    COMMON_TAX_FIELDS.receiptNumber,
    COMMON_TAX_FIELDS.receiptDatetime,
    COMMON_TAX_FIELDS.taxOffice,
    COMMON_TAX_FIELDS.etaxUserId,
    COMMON_TAX_FIELDS.customerName,
  ],
};

const CORP_TAX_RETURN_SCHEMA: CanonicalOcrSchema = {
  id: "corp_tax_return",
  label: "法人税申告書",
  fields: [
    COMMON_TAX_FIELDS.documentTitle,
    COMMON_TAX_FIELDS.customerName,
    COMMON_TAX_FIELDS.taxOffice,
    COMMON_TAX_FIELDS.fiscalFrom,
    COMMON_TAX_FIELDS.fiscalTo,
    COMMON_TAX_FIELDS.etaxUserId,
  ],
};

const TAX_PAYMENT_SUMMARY_SCHEMA: CanonicalOcrSchema = {
  id: "tax_payment_summary",
  label: "納付税額一覧表",
  fields: [
    COMMON_TAX_FIELDS.documentTitle,
    COMMON_TAX_FIELDS.fiscalFrom,
    COMMON_TAX_FIELDS.fiscalTo,
    COMMON_TAX_FIELDS.unit,
  ],
};

export const CANONICAL_OCR_FIELDS: CanonicalOcrFieldDef[] = [
  { field_id: "ocr_document_title", label: "書類種別", target: "document" },
  { field_id: "customer_name", label: "法人名・氏名", target: "client-master" },
  { field_id: "tax_office", label: "提出先（税務署）", target: "client-master" },
  { field_id: "ocr_fiscal_from", label: "事業年度（自）", target: "document" },
  { field_id: "ocr_fiscal_to", label: "事業年度（至）", target: "document" },
  { field_id: "etax_user_id", label: "利用者識別番号", target: "client-master" },
  { field_id: "ocr_receipt_number", label: "受付番号", target: "document" },
  { field_id: "ocr_receipt_datetime", label: "受付日時", target: "document" },
  { field_id: "ocr_unit", label: "単位", target: "document" },
];

const CANONICAL_FIELD_IDS = new Set(CANONICAL_OCR_FIELDS.map((f) => f.field_id));

function normalizeLabelKey(text: string): string {
  return text.replace(/[\s　：:]+$/g, "").trim();
}

function matchKnownLabel(
  line: string,
): { def: KnownLabelDef; inlineValue?: string } | null {
  const trimmed = line.trim();
  const normalized = normalizeLabelKey(trimmed);
  for (const def of KNOWN_LABELS) {
    for (const alias of def.aliases) {
      if (normalized === alias) return { def };
    }
  }
  for (const def of KNOWN_LABELS) {
    for (const alias of def.aliases) {
      if (trimmed.startsWith(alias) && trimmed.length > alias.length) {
        const rest = trimmed.slice(alias.length).replace(/^[\s　：:]+/, "").trim();
        if (rest) return { def, inlineValue: rest };
      }
    }
  }
  return null;
}

function makeField(
  fieldId: string,
  label: string,
  value: string,
  confidence: number,
  target: string,
): FieldExtractionItem {
  const clean = value.trim();
  return {
    field_id: fieldId,
    label: label.trim(),
    value: clean || null,
    confidence: clean ? confidence : 0,
    status: clean ? (confidence >= 0.7 ? "extracted" : "low_confidence") : "missing",
    target,
    required: false,
  };
}

/**
 * OCR 抜粋テキストからフィールドを推定する。
 * 1) 既知ラベル（提出先・氏名又は名称 等）を起点に値を紐づける（行ズレしない）
 * 2) 「ラベル：値」形式（短いラベルのみ）
 * 3) 先頭行を書類タイトル
 */
export function inferFieldsFromTextExcerpt(excerpt: string): FieldExtractionItem[] {
  const lines = excerpt
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const fields: FieldExtractionItem[] = [];
  const seen = new Set<string>();

  const push = (item: FieldExtractionItem) => {
    if (seen.has(item.field_id)) return;
    seen.add(item.field_id);
    fields.push(item);
  };

  const isAnyKnownLabelLine = (line: string | undefined): boolean =>
    !!line && matchKnownLabel(line) !== null;

  let index = 0;
  while (index < lines.length) {
    const line = lines[index]!;

    const known = matchKnownLabel(line);
    if (known) {
      if (known.inlineValue) {
        push(makeField(known.def.fieldId, known.def.label, known.inlineValue, 0.75, "document"));
        index += 1;
        continue;
      }
      // ラベル単独行 → 次の「ラベルでない行」を値にする
      const next = lines[index + 1];
      if (next && !isAnyKnownLabelLine(next) && next.length <= 120) {
        push(makeField(known.def.fieldId, known.def.label, next, 0.75, "document"));
        index += 2;
        continue;
      }
      push(makeField(known.def.fieldId, known.def.label, "", 0, "document"));
      index += 1;
      continue;
    }

    // 「短いラベル：値」形式のみ（文章のコロンは拾わない）
    const colonMatch = line.match(/^(.{1,16}?)[：:]\s*(.+)$/);
    if (colonMatch) {
      const rawLabel = colonMatch[1]!.trim();
      const value = colonMatch[2]!.trim();
      if (rawLabel && value && !/[。、）)]$/.test(rawLabel)) {
        push(makeField(slugFieldId(rawLabel), rawLabel, value, 0.55, "document"));
      }
      index += 1;
      continue;
    }

    if (index === 0 && line.length <= 48) {
      push(makeField("ocr_document_title", "書類タイトル", line, 0.6, "document"));
      index += 1;
      continue;
    }

    index += 1;
  }
  return fields;
}

function normalizeDocumentKey(value: string): string {
  return value.normalize("NFKC").replace(/[\s　]+/g, "");
}

function resolveCanonicalSchema(args: {
  documentLabel: string;
  slotLabel?: string;
  excerpt?: string;
}): CanonicalOcrSchema {
  const key = normalizeDocumentKey(
    [args.documentLabel, args.slotLabel, args.excerpt?.slice(0, 500) ?? ""].join(" "),
  );
  if (key.includes("受信通知") || key.includes("メール詳細")) {
    return TAX_RECEIPT_SCHEMA;
  }
  if (key.includes("納付税額一覧表") || key.includes("納付税額")) {
    return TAX_PAYMENT_SUMMARY_SCHEMA;
  }
  if (
    key.includes("法人税") ||
    key.includes("申告書") ||
    key.includes("別表")
  ) {
    return CORP_TAX_RETURN_SCHEMA;
  }
  return GENERIC_SCHEMA;
}

/** 書類種別ごとの正規化スキーマに投影する。値が無ければ missing で必ず残す。 */
function projectToCanonical(
  extractedById: Map<string, { value: string; confidence: number }>,
  fallbackTitle: string,
  schema: CanonicalOcrSchema,
): FieldExtractionItem[] {
  return schema.fields.map((def) => {
    const hit = extractedById.get(def.field_id);
    let value = hit?.value?.trim() ?? "";
    let confidence = hit?.confidence ?? 0;
    if (def.field_id === "ocr_document_title") {
      // 分類ラベルを基本の書類種別とし、種目など高信頼の抽出があれば優先
      if (hit && hit.confidence >= 0.7) {
        value = hit.value;
        confidence = hit.confidence;
      } else if (fallbackTitle.trim()) {
        value = fallbackTitle.trim();
        confidence = 0.75;
      }
    }
    return makeField(def.field_id, def.label, value, confidence, def.target);
  });
}

export function buildExtractionReviewFromClassifyMeta(
  classifyMeta: ClassifyPersistMetadata | null | undefined,
  options: { slotId: string; slotLabel?: string },
): ExtractionReviewPayload | null {
  if (!classifyMeta) return null;

  const documentLabel =
    classifyMeta.best?.label?.trim() ||
    options.slotLabel?.trim() ||
    "資料";
  const schema = resolveCanonicalSchema({
    documentLabel,
    slotLabel: options.slotLabel,
    excerpt: classifyMeta.text_excerpt,
  });

  const hasSignal =
    !!classifyMeta.field_extractions?.length ||
    !!classifyMeta.extracted_profile ||
    !!classifyMeta.text_excerpt?.trim();
  if (!hasSignal) return null;

  if (schema.id === "generic" && classifyMeta.field_extractions?.length) {
    const fields = classifyMeta.field_extractions.map((field) => ({ ...field }));
    const needsReview =
      classifyMeta.extraction_review_status === "needs_review" ||
      fields.some((field) => field.status !== "extracted" || !field.value);

    return {
      slot_id: options.slotId,
      document_label: documentLabel,
      schema_version: classifyMeta.schema_version ?? 0,
      review_status: needsReview ? "needs_review" : "complete",
      fields,
      extracted_profile: classifyMeta.extracted_profile,
    };
  }

  /** 各ソースから field_id → 最良値を集約（confidence が高い方を優先） */
  const extractedById = new Map<string, { value: string; confidence: number }>();
  const remember = (fieldId: string, value: string | null, confidence: number) => {
    const clean = (value ?? "").trim();
    if (!clean) return;
    const existing = extractedById.get(fieldId);
    if (!existing || confidence > existing.confidence) {
      extractedById.set(fieldId, { value: clean, confidence });
    }
  };

  const schemaFieldIds = new Set(schema.fields.map((field) => field.field_id));

  /** 選択スキーマ外の構造化抽出（スキーマ由来のみ）は末尾に温存する */
  const structuredExtras: FieldExtractionItem[] = [];

  if (classifyMeta.field_extractions?.length) {
    for (const field of classifyMeta.field_extractions) {
      remember(field.field_id, field.value, field.confidence);
      if (!schemaFieldIds.has(field.field_id)) {
        structuredExtras.push({ ...field });
      }
    }
  }
  if (classifyMeta.extracted_profile) {
    for (const [fieldId, value] of Object.entries(classifyMeta.extracted_profile)) {
      if (typeof value === "string") remember(fieldId, value, 0.7);
    }
  }
  if (classifyMeta.text_excerpt?.trim()) {
    // 推定はノイズが多いので、正規化スキーマに一致する項目のみ採用する
    for (const field of inferFieldsFromTextExcerpt(classifyMeta.text_excerpt)) {
      if (CANONICAL_FIELD_IDS.has(field.field_id)) {
        remember(field.field_id, field.value, field.confidence);
      }
    }
  }

  const fields = [
    ...projectToCanonical(extractedById, documentLabel, schema),
    ...structuredExtras,
  ];

  const needsReview =
    classifyMeta.extraction_review_status === "needs_review" ||
    fields.some((field) => field.status !== "extracted" || !field.value);

  return {
    slot_id: options.slotId,
    document_label: documentLabel,
    schema_version: classifyMeta.schema_version ?? 0,
    review_status: needsReview ? "needs_review" : "complete",
    fields,
    extracted_profile: classifyMeta.extracted_profile,
  };
}

export type OcrFieldDisplaySource = "ocr" | "manual_master" | "manual_session";

export type OcrFieldRow = FieldExtractionItem & {
  ocrValue: string;
  displayValue: string;
  source: OcrFieldDisplaySource;
  sessionEdited: boolean;
};

export function buildOcrFieldRows(args: {
  review: ExtractionReviewPayload;
  clientProfile?: Record<string, string>;
  clientProfileMeta?: Record<string, ProfileFieldMeta>;
  sessionDraft?: Record<string, string>;
  sessionEditedIds?: Set<string>;
}): OcrFieldRow[] {
  const { review, clientProfile, clientProfileMeta, sessionDraft, sessionEditedIds } = args;
  return review.fields.map((field) => {
    const ocrValue = (field.value ?? "").trim();
    const masterValue = (clientProfile?.[field.field_id] ?? "").trim();
    const masterMeta = clientProfileMeta?.[field.field_id];
    const sessionValue = (sessionDraft?.[field.field_id] ?? "").trim();
    const sessionEdited = sessionEditedIds?.has(field.field_id) ?? false;

    if (sessionEdited && sessionValue) {
      return {
        ...field,
        ocrValue,
        displayValue: sessionValue,
        source: "manual_session",
        sessionEdited: true,
      };
    }
    if (masterMeta?.source === "manual" && masterValue) {
      return {
        ...field,
        ocrValue,
        displayValue: masterValue,
        source: "manual_master",
        sessionEdited: false,
      };
    }
    if (ocrValue) {
      return {
        ...field,
        ocrValue,
        displayValue: ocrValue,
        source: "ocr",
        sessionEdited: false,
      };
    }
    if (masterValue) {
      return {
        ...field,
        ocrValue,
        displayValue: masterValue,
        source: masterMeta?.source === "ocr" ? "ocr" : "manual_master",
        sessionEdited: false,
      };
    }
    return {
      ...field,
      ocrValue,
      displayValue: sessionValue,
      source: "ocr",
      sessionEdited: false,
    };
  });
}
