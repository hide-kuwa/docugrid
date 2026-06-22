/** 申告パッケージ AI 分類・テンプレートソート用スキーマ（DocuGrid Phase 1） */

export type TaxDocumentType =
  | "TAX_PROXY"
  | "CORP_TAX_RETURN"
  | "ACCOUNT_DETAILS"
  | "CORP_SUMMARY"
  | "TRIAL_BALANCE"
  | "CONSUMPTION_TAX"
  | "UNKNOWN";

export const TAX_DOCUMENT_TYPES: TaxDocumentType[] = [
  "TAX_PROXY",
  "CORP_TAX_RETURN",
  "ACCOUNT_DETAILS",
  "CORP_SUMMARY",
  "TRIAL_BALANCE",
  "CONSUMPTION_TAX",
  "UNKNOWN",
];

export const TAX_DOCUMENT_TYPE_LABELS: Record<TaxDocumentType, string> = {
  TAX_PROXY: "税務代理権限証書",
  CORP_TAX_RETURN: "法人税申告書",
  ACCOUNT_DETAILS: "勘定科目内訳明細書",
  CORP_SUMMARY: "法人事業概況説明書",
  TRIAL_BALANCE: "試算表・決算報告書",
  CONSUMPTION_TAX: "消費税申告書",
  UNKNOWN: "未分類",
};

export const TAX_TYPE_TO_SLOT_ID: Partial<Record<TaxDocumentType, string>> = {
  TAX_PROXY: "tax_proxy",
  CORP_TAX_RETURN: "tax_return_corporate",
  ACCOUNT_DETAILS: "account_details",
  CORP_SUMMARY: "corp_summary",
  TRIAL_BALANCE: "financial_report",
  CONSUMPTION_TAX: "tax_return_consumption",
};

export interface DocuGridItem {
  id: string;
  clientId: string;
  googleDriveFileId?: string;
  extractedType: TaxDocumentType;
  confidenceScore: number;
  createdAt: string;
  fileName: string;
  reason?: string;
  engine?: string;
}

export interface FirmDocumentTemplate {
  firmId: string;
  templateName: string;
  sortOrder: TaxDocumentType[];
  updatedAt?: string;
}

export const DEFAULT_PACKAGE_SORT_ORDER: TaxDocumentType[] = [
  "TAX_PROXY",
  "CORP_TAX_RETURN",
  "ACCOUNT_DETAILS",
  "CORP_SUMMARY",
  "TRIAL_BALANCE",
  "CONSUMPTION_TAX",
];

export const DEFAULT_FIRM_DOCUMENT_TEMPLATE: FirmDocumentTemplate = {
  firmId: "firm_default",
  templateName: "標準顧客納品用パッケージ",
  sortOrder: DEFAULT_PACKAGE_SORT_ORDER,
};

export const AiClassificationSchema = {
  type: "object",
  properties: {
    identifiedType: {
      type: "string",
      enum: [
        "TAX_PROXY",
        "CORP_TAX_RETURN",
        "ACCOUNT_DETAILS",
        "CORP_SUMMARY",
        "TRIAL_BALANCE",
        "CONSUMPTION_TAX",
        "UNKNOWN",
      ],
    },
    confidence: { type: "number" },
    reason: { type: "string" },
  },
  required: ["identifiedType", "confidence"],
  additionalProperties: false,
} as const;

export type ClassifiedPackageDocument = {
  fileName: string;
  identifiedType: TaxDocumentType;
  confidence: number;
  reason?: string;
  engine: string;
  slotId?: string | null;
  label?: string;
};

export type ClassifyBatchResult = {
  documents: ClassifiedPackageDocument[];
  capabilities?: {
    ocr_auto_extract_enabled: boolean;
    ai_openai_enabled: boolean;
    ai_gemini_enabled: boolean;
    ai_openai_key_configured: boolean;
    ai_gemini_key_configured: boolean;
    vision_enabled: boolean;
    vision_openai?: boolean;
    vision_gemini?: boolean;
  };
};

export function sortIndexForType(
  type: TaxDocumentType,
  sortOrder: TaxDocumentType[],
): number {
  const idx = sortOrder.indexOf(type);
  if (idx >= 0) return idx;
  if (type === "UNKNOWN") return sortOrder.length + 1;
  return sortOrder.length;
}

export function sortByTemplate<T extends { identifiedType: TaxDocumentType; fileName: string }>(
  docs: T[],
  sortOrder: TaxDocumentType[] = DEFAULT_PACKAGE_SORT_ORDER,
): T[] {
  return [...docs].sort((a, b) => {
    const ai = sortIndexForType(a.identifiedType, sortOrder);
    const bi = sortIndexForType(b.identifiedType, sortOrder);
    if (ai !== bi) return ai - bi;
    return a.fileName.localeCompare(b.fileName, "ja");
  });
}

export function labelForTaxType(type: TaxDocumentType): string {
  return TAX_DOCUMENT_TYPE_LABELS[type] ?? TAX_DOCUMENT_TYPE_LABELS.UNKNOWN;
}
