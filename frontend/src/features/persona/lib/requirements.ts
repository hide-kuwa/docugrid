/** Mirrors backend/services/requirements.py for slot index resolution. */

const REQUIREMENTS: Record<string, string[]> = {
  perm: ["定款", "履歴事項全部証明書", "株主名簿", "設立届出書"],
  year: ["決算報告書", "総勘定元帳", "法人税申告書", "消費税申告書"],
  month: ["月次試算表", "通帳コピー", "請求書綴り", "給与台帳"],
};

export const periodType = (periodKey: string): string => {
  if (!periodKey || periodKey === "perm") return "perm";
  return periodKey.split(":")[0];
};

export const slotIdForLabel = (periodKey: string, label: string): string | null => {
  const labels = REQUIREMENTS[periodType(periodKey)] ?? [];
  const idx = labels.indexOf(label);
  return idx >= 0 ? String(idx) : null;
};
