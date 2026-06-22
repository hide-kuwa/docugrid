import type { AuthoringTemplate } from "@/features/authoring/types";
import type { SlotLayout } from "@/lib/slot-layout-storage";

/** 公式ひな形 ID → 保存先枠名 */
const SLOT_BY_TEMPLATE_ID: Record<string, string> = {
  "global-officer-compensation-minutes": "役員報酬",
  "global-loan-agreement-stub": "金銭消費貸借契約書",
};

/** タイトルキーワード → 保存先枠名（上記より優先度低） */
const SLOT_BY_TITLE_KEYWORD: [string, string][] = [
  ["役員報酬", "役員報酬"],
  ["株主総会", "株主総会議事録"],
  ["金銭消費貸借", "金銭消費貸借契約書"],
];

export function targetSlotLabelForTemplate(
  template: Pick<AuthoringTemplate, "id" | "title" | "targetSlotLabel">,
  renderTarget?: string,
): string {
  const fromRender = (renderTarget ?? "").trim();
  if (fromRender) return fromRender;
  const fromTemplate = (template.targetSlotLabel ?? "").trim();
  if (fromTemplate) return fromTemplate;
  const byId = SLOT_BY_TEMPLATE_ID[template.id];
  if (byId) return byId;
  for (const [keyword, label] of SLOT_BY_TITLE_KEYWORD) {
    if (template.title.includes(keyword)) return label;
  }
  return "";
}

function findSlotByLabel(slotLabels: string[], target: string): number {
  const exact = slotLabels.findIndex((label) => label === target);
  if (exact >= 0) return exact;
  return slotLabels.findIndex(
    (label) => label.includes(target) || target.includes(label),
  );
}

export type EnsureAuthoringSlotResult = {
  slotIndex: number;
  slotLabel: string;
  /** 新規枠を追加した場合のレイアウト更新 */
  layout?: SlotLayout;
};

/** ひな形の保存先枠を確定する。存在しなければ末尾に枠を追加する。 */
export function ensureAuthoringSlot(
  targetLabel: string,
  slotLabels: string[],
  displayOrder: number[],
): EnsureAuthoringSlotResult {
  const target = targetLabel.trim();
  if (!target) {
    const idx = displayOrder[0] ?? 0;
    return {
      slotIndex: idx,
      slotLabel: slotLabels[idx] ?? `枠 ${idx + 1}`,
    };
  }

  const matched = findSlotByLabel(slotLabels, target);
  if (matched >= 0) {
    return {
      slotIndex: matched,
      slotLabel: slotLabels[matched] ?? target,
    };
  }

  const newIndex = slotLabels.length;
  return {
    slotIndex: newIndex,
    slotLabel: target,
    layout: {
      labels: [...slotLabels, target],
      order: [...displayOrder, newIndex],
    },
  };
}
