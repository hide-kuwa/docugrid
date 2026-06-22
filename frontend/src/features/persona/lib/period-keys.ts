/** Client workspace period tabs (aligned with backend requirements.py). */

export type ClientPeriodOption = {
  key: string;
  label: string;
};

export const CLIENT_PERIOD_OPTIONS: ClientPeriodOption[] = [
  { key: "year:1", label: "決算（当年）" },
  { key: "month:1", label: "月次（直近）" },
  { key: "perm", label: "永続" },
];

export const periodKeyLabel = (periodKey: string): string => {
  const found = CLIENT_PERIOD_OPTIONS.find((p) => p.key === periodKey);
  if (found) return found.label;
  if (periodKey === "perm") return "永続";
  const [mode, idx] = periodKey.split(":");
  if (mode === "year") return `決算 ${idx}`;
  if (mode === "month") return `月次 ${idx}`;
  return periodKey;
};
