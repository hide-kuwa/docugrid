import type { AuthoringTemplate } from "@/features/authoring/types";

import {
  ensureAuthoringSlot,
  targetSlotLabelForTemplate,
  type EnsureAuthoringSlotResult,
} from "./authoring-slot-target";

export type AuthoringSlotTarget = EnsureAuthoringSlotResult;

/** ひな形から保存先スロットを確定（なければ枠を追加）。 */
export function resolveAuthoringSlot(
  template: AuthoringTemplate,
  slotLabels: string[],
  displayOrder: number[],
  renderTargetSlotLabel?: string,
): AuthoringSlotTarget {
  const target = targetSlotLabelForTemplate(template, renderTargetSlotLabel);
  return ensureAuthoringSlot(target, slotLabels, displayOrder);
}
