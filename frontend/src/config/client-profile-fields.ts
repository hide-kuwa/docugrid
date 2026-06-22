/** 顧客管理プロフィール — 文字項目定義（7 カテゴリ） */

export type ProfileFieldSource = "manual" | "ocr" | "master" | "import";

export type ProfileFieldMeta = {
  source: ProfileFieldSource;
  sourceDocumentLabel?: string;
  sourceSlotId?: string;
  sourcePeriodKey?: string;
  updatedAt?: string;
  updatedBy?: string;
  updatedById?: string;
};

export type ProfileFieldChange = {
  value: string;
  previousValue?: string;
  source: ProfileFieldSource;
  updatedAt: string;
  updatedBy?: string;
  updatedById?: string;
};

export const MAX_PROFILE_HISTORY_PER_FIELD = 100;

export const MASTER_EDITABLE_FIELD_IDS = ["_name", "_fiscal_month"] as const;

export const PROFILE_FIELD_SOURCE_LABELS: Record<ProfileFieldSource, string> = {
  manual: "手動入力",
  ocr: "OCR読取",
  master: "マスタ",
  import: "インポート",
};

export type ClientProfileField = {
  id: string;
  label: string;
  multiline?: boolean;
};

export type ClientProfileSection = {
  id: string;
  title: string;
  fields: ClientProfileField[];
};

export const CLIENT_PROFILE_SECTIONS: ClientProfileSection[] = [
  {
    id: "basic",
    title: "1. 基本情報",
    fields: [
      { id: "customer_code", label: "顧客コード" },
      { id: "customer_name", label: "顧客名" },
      { id: "customer_name_kana", label: "顧客名かな" },
      { id: "mailing_address", label: "送付先住所", multiline: true },
      { id: "head_office_address", label: "本店住所", multiline: true },
      { id: "email", label: "メールアドレス" },
      { id: "phone", label: "電話番号" },
      { id: "fax", label: "FAX番号" },
      { id: "appointment_method", label: "アポイントの取り方" },
      { id: "industry_type", label: "業種区分" },
      { id: "business_description", label: "事業内容", multiline: true },
      { id: "entity_major", label: "法人・個人区分（大分類）" },
      { id: "entity_minor", label: "法人・個人区分（小分類）" },
      { id: "established_date", label: "設立年月日" },
      { id: "capital", label: "資本金" },
      { id: "list_display_setting", label: "顧客一覧表示設定" },
      { id: "fee_payment_method", label: "報酬支払方法" },
      { id: "contract_content", label: "契約内容（ファイル名・登録日・サイズ）", multiline: true },
      { id: "handling_notes", label: "対応時の注意点", multiline: true },
      { id: "tax_audit_history", label: "税務調査履歴", multiline: true },
      { id: "banks", label: "取引銀行", multiline: true },
      { id: "remarks", label: "備考", multiline: true },
    ],
  },
  {
    id: "filing",
    title: "2. 申告関係",
    fields: [
      { id: "fiscal_year_end_date", label: "決算日" },
      { id: "filing_date", label: "申告日" },
      { id: "filing_method", label: "申告方法" },
      { id: "filing_category", label: "申告区分" },
      {
        id: "consumption_tax",
        label: "消費税（届出書、申告区分/簡易・法則、インボイス）",
        multiline: true,
      },
      { id: "corporate_number", label: "法人番号" },
      { id: "shareholder_count", label: "株主の総数" },
      { id: "issued_shares", label: "発行済株式の総数" },
      { id: "shareholders_with_voting_rights", label: "議決権を有する株主数" },
      { id: "voting_rights_total", label: "議決権の総数" },
      { id: "shareholders_attending", label: "出席株主数" },
      { id: "voting_rights_attending", label: "出席株主の議決権数" },
      { id: "tax_office", label: "所轄税務署" },
      { id: "prefectural_tax_office", label: "所轄都道府県税事務所" },
      { id: "municipal_tax_office", label: "所轄市町村税事務所" },
      { id: "etax_user_id", label: "e-Tax／利用者識別番号" },
      { id: "etax_pin", label: "e-Tax／利用者識別番号（暗証番号）" },
      { id: "eltax_user_id", label: "eLTax／利用者ID" },
      { id: "eltax_pin", label: "eLTax／利用者ID（暗証番号）" },
      { id: "accounting_software", label: "会計ソフト" },
      { id: "processing_manual", label: "処理マニュアル", multiline: true },
      { id: "tax_returns", label: "申告書", multiline: true },
    ],
  },
  {
    id: "notifications",
    title: "3. 届出関係",
    fields: [
      { id: "corp_blue_return_application", label: "法人／青色申告の承認申請書" },
      { id: "income_blue_return_application", label: "所得税／青色申告の承認申請書" },
      {
        id: "income_blue_family_employee_notice",
        label: "所得税／青色事業専従者給与に関する届出・変更届出書",
      },
      {
        id: "invoice_registration_application",
        label: "消費税／適格請求書発行事業者の登録申請書",
      },
      { id: "consumption_tax_election_notice", label: "消費税／課税事業者選択届出書" },
      {
        id: "consumption_tax_election_withdrawal",
        label: "消費税／課税事業者選択不適用届出書",
      },
    ],
  },
  {
    id: "payroll",
    title: "4. 給与・源泉所得税・年末調整関係",
    fields: [
      { id: "officer_count", label: "役員数" },
      { id: "officer_relative_count", label: "内 親族数" },
      { id: "employee_count", label: "従業員数" },
      { id: "year_end_adjustment", label: "年末調整" },
      { id: "officer_compensation", label: "役員報酬（代表取締役・月額）" },
      { id: "director1_monthly_salary", label: "取締役1・月額報酬" },
      { id: "director2_monthly_salary", label: "取締役2・月額報酬" },
      { id: "total_monthly_salary", label: "役員報酬合計（月額）" },
      { id: "payroll", label: "給与" },
      { id: "withholding_tax", label: "源泉所得税（納特）" },
      { id: "resident_tax", label: "住民税" },
    ],
  },
  {
    id: "people",
    title: "5. 人物情報",
    fields: [
      { id: "representative_name", label: "代表者／氏名" },
      { id: "director1_name", label: "取締役1／氏名" },
      { id: "director2_name", label: "取締役2／氏名" },
      { id: "accounting_contact_name", label: "経理担当者／氏名" },
      { id: "referrer", label: "紹介者" },
      {
        id: "personnel_info",
        label: "個人情報（コード、氏名、所属、役職、メール、ユーザID、最終ログイン）",
        multiline: true,
      },
    ],
  },
  {
    id: "estate_proposal",
    title: "6. 相続・償却資産・提案",
    fields: [
      { id: "inheritance_details", label: "相続詳細", multiline: true },
      { id: "depreciation_asset_tax", label: "償却資産税" },
      { id: "profit_taxable_income", label: "利益（課税所得）" },
      { id: "assets_taxable_estate", label: "資産（課税遺産額）" },
      { id: "insurance_policies", label: "保険証券", multiline: true },
      { id: "insurance_needs", label: "保険ニーズ", multiline: true },
      { id: "real_estate_income_tax_needs", label: "不動産所得税節税ニーズ", multiline: true },
      { id: "real_estate_inheritance_tax_needs", label: "不動産相続税節税ニーズ", multiline: true },
      { id: "will_prospect", label: "遺言見込", multiline: true },
      { id: "trust_needs", label: "信託ニーズ", multiline: true },
      { id: "lifetime_consulting_needs", label: "生前コンサルニーズ", multiline: true },
      { id: "incorporation", label: "法人化" },
      { id: "proposal_metrics", label: "提案指標", multiline: true },
    ],
  },
  {
    id: "fees_staff_system",
    title: "7. 報酬・工数・担当者・システム設定",
    fields: [
      { id: "fee_by_service_type", label: "業務分類別報酬設定", multiline: true },
      { id: "planned_hours", label: "予定工数設定", multiline: true },
      { id: "filing_info_list", label: "申告情報（一覧）", multiline: true },
      {
        id: "staff_assignments",
        label:
          "担当者設定（コード、氏名、所属、権限、紹介、主担当者、基本、給与、勤怠、会計、表示順、コメント）",
        multiline: true,
      },
      {
        id: "option_settings",
        label:
          "オプション設定（顧客向け勤怠管理利用状況、WEB明細利用状況、電子会議室／リアクション通知対象者）",
        multiline: true,
      },
    ],
  },
];

export const CLIENT_PROFILE_FIELD_IDS = CLIENT_PROFILE_SECTIONS.flatMap((section) =>
  section.fields.map((field) => field.id),
);

export type ClientProfileData = Partial<Record<string, string>>;

export function emptyClientProfile(): ClientProfileData {
  return {};
}

export function sanitizeClientProfile(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const allowed = new Set(CLIENT_PROFILE_FIELD_IDS);
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!allowed.has(key)) continue;
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

const PROFILE_FIELD_SOURCES = new Set<ProfileFieldSource>([
  "manual",
  "ocr",
  "master",
  "import",
]);

export function sanitizeClientProfileMeta(
  raw: unknown,
): Record<string, ProfileFieldMeta> {
  if (!raw || typeof raw !== "object") return {};
  const allowed = new Set(CLIENT_PROFILE_FIELD_IDS);
  const out: Record<string, ProfileFieldMeta> = {};
  for (const [fieldId, meta] of Object.entries(raw as Record<string, unknown>)) {
    if (!allowed.has(fieldId) || !meta || typeof meta !== "object") continue;
    const source = (meta as ProfileFieldMeta).source;
    if (!PROFILE_FIELD_SOURCES.has(source)) continue;
    const cleaned: ProfileFieldMeta = { source };
    const label = (meta as ProfileFieldMeta).sourceDocumentLabel;
    if (typeof label === "string" && label.trim()) cleaned.sourceDocumentLabel = label.trim();
    const slotId = (meta as ProfileFieldMeta).sourceSlotId;
    if (typeof slotId === "string" && slotId.trim()) cleaned.sourceSlotId = slotId.trim();
    const periodKey = (meta as ProfileFieldMeta).sourcePeriodKey;
    if (typeof periodKey === "string" && periodKey.trim()) {
      cleaned.sourcePeriodKey = periodKey.trim();
    }
    const updatedAt = (meta as ProfileFieldMeta).updatedAt;
    if (typeof updatedAt === "string" && updatedAt.trim()) cleaned.updatedAt = updatedAt.trim();
    const updatedBy = (meta as ProfileFieldMeta).updatedBy;
    if (typeof updatedBy === "string" && updatedBy.trim()) cleaned.updatedBy = updatedBy.trim();
    const updatedById = (meta as ProfileFieldMeta).updatedById;
    if (typeof updatedById === "string" && updatedById.trim()) cleaned.updatedById = updatedById.trim();
    out[fieldId] = cleaned;
  }
  return out;
}

export function sanitizeClientProfileHistory(
  raw: unknown,
): Record<string, ProfileFieldChange[]> {
  if (!raw || typeof raw !== "object") return {};
  const allowed = new Set([
    ...CLIENT_PROFILE_FIELD_IDS,
    ...MASTER_EDITABLE_FIELD_IDS,
  ]);
  const out: Record<string, ProfileFieldChange[]> = {};
  for (const [fieldId, entries] of Object.entries(raw as Record<string, unknown>)) {
    if (!allowed.has(fieldId) || !Array.isArray(entries)) continue;
    const cleaned: ProfileFieldChange[] = [];
    for (const entry of entries.slice(0, MAX_PROFILE_HISTORY_PER_FIELD)) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as ProfileFieldChange;
      const source = PROFILE_FIELD_SOURCES.has(e.source) ? e.source : "manual";
      if (typeof e.updatedAt !== "string" || !e.updatedAt.trim()) continue;
      const row: ProfileFieldChange = {
        value: typeof e.value === "string" ? e.value : "",
        source,
        updatedAt: e.updatedAt.trim(),
      };
      if (typeof e.previousValue === "string") row.previousValue = e.previousValue;
      if (typeof e.updatedBy === "string" && e.updatedBy.trim()) row.updatedBy = e.updatedBy.trim();
      if (typeof e.updatedById === "string" && e.updatedById.trim()) {
        row.updatedById = e.updatedById.trim();
      }
      cleaned.push(row);
    }
    if (cleaned.length > 0) out[fieldId] = cleaned;
  }
  return out;
}

export function profileFieldMultiline(fieldId: string): boolean {
  return CLIENT_PROFILE_SECTIONS.some((section) =>
    section.fields.some((field) => field.id === fieldId && field.multiline),
  );
}

export function resolveFieldProvenance(
  fieldId: string,
  value: string,
  profileMeta: Record<string, ProfileFieldMeta> | undefined,
): {
  source: ProfileFieldSource | "unknown" | null;
  label: string;
  detail?: string;
} {
  const meta = profileMeta?.[fieldId];
  if (meta) {
    const label = PROFILE_FIELD_SOURCE_LABELS[meta.source];
    const detail =
      meta.source === "ocr"
        ? meta.sourceDocumentLabel?.trim() || undefined
        : undefined;
    return { source: meta.source, label, detail };
  }
  if (!value.trim()) return { source: null, label: "" };
  if (fieldId.startsWith("_")) {
    return { source: "master", label: PROFILE_FIELD_SOURCE_LABELS.master };
  }
  return { source: "unknown", label: "未記録" };
}
