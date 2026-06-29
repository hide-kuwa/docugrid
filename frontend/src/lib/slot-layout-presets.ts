/** 期間種別ごとの定型枠テンプレート（編集モードで一括追加用）。 */

export type SlotPresetItem = {
  id: string;
  label: string;
};

export type SlotPresetGroup = {
  id: string;
  title: string;
  items: SlotPresetItem[];
};

const COMMON_YEAR_PRESETS: SlotPresetItem[] = [
  { id: "officer_compensation", label: "役員報酬" },
  { id: "shareholders_meeting_minutes", label: "株主総会議事録" },
  { id: "board_minutes", label: "取締役会議事録" },
  { id: "loan_agreement", label: "金銭消費貸借契約書" },
  { id: "fixed_asset_register", label: "固定資産台帳" },
  { id: "tax_payment_certificate", label: "納税証明書" },
  { id: "withholding_slip", label: "源泉徴収票" },
  { id: "social_insurance", label: "社会保険関連" },
];

const COMMON_MONTH_PRESETS: SlotPresetItem[] = [
  { id: "expense_report", label: "経費精算" },
  { id: "receipt_bundle", label: "領収書綴り" },
  { id: "credit_card_statement", label: "クレジットカード明細" },
  { id: "sales_ledger", label: "売上帳" },
];

const COMMON_PERM_PRESETS: SlotPresetItem[] = [
  { id: "seal_certificate", label: "印鑑証明書" },
  { id: "registered_mail", label: "登記簿謄本" },
  { id: "officer_registry", label: "役員届" },
  { id: "business_license", label: "事業許可証" },
];

export function slotPresetGroupsForPeriod(periodKey: string): SlotPresetGroup[] {
  if (periodKey === "perm") {
    return [{ id: "perm-common", title: "法人基本", items: COMMON_PERM_PRESETS }];
  }
  if (periodKey.startsWith("month:")) {
    return [{ id: "month-common", title: "月次・経費", items: COMMON_MONTH_PRESETS }];
  }
  return [
    { id: "year-common", title: "決算・税務", items: COMMON_YEAR_PRESETS },
    {
      id: "year-monthly",
      title: "月次資料（年次フォルダ用）",
      items: COMMON_MONTH_PRESETS,
    },
  ];
}

export function flattenPresetsForPeriod(periodKey: string): SlotPresetItem[] {
  return slotPresetGroupsForPeriod(periodKey).flatMap((g) => g.items);
}
