import { persistSlotLayoutBulk, type SlotLayout } from "./slot-layout-storage";

export type SlotLayoutScope = "current" | "staff" | "selected" | "org";

export type SlotLayoutScopeContext = {
  currentClientId: string;
  periodKey: string;
  staffClientIds: string[];
  orgClientIds: string[];
  selectedClientIds: string[];
};

export const SLOT_LAYOUT_SCOPE_LABELS: Record<SlotLayoutScope, string> = {
  current: "この会社",
  staff: "担当分",
  selected: "選択",
  org: "全社",
};

export function slotLayoutKey(clientId: string, periodKey: string): string {
  return `${clientId}:${periodKey}`;
}

function validClientId(id: string): boolean {
  return Boolean(id && id !== "unknown");
}

export function resolveLayoutTargetKeys(
  scope: SlotLayoutScope,
  ctx: SlotLayoutScopeContext,
): string[] {
  const keyFor = (id: string) => slotLayoutKey(id, ctx.periodKey);

  switch (scope) {
    case "current":
      return validClientId(ctx.currentClientId) ? [keyFor(ctx.currentClientId)] : [];
    case "staff":
      return ctx.staffClientIds.filter(validClientId).map(keyFor);
    case "selected":
      return ctx.selectedClientIds.filter(validClientId).map(keyFor);
    case "org":
      return ctx.orgClientIds.filter(validClientId).map(keyFor);
    default:
      return [];
  }
}

export function applySlotLayoutWithScope(
  scope: SlotLayoutScope,
  ctx: SlotLayoutScopeContext,
  layout: SlotLayout,
): Record<string, SlotLayout> {
  const keys = resolveLayoutTargetKeys(scope, ctx);
  if (keys.length === 0) {
    if (!validClientId(ctx.currentClientId)) return {};
    return persistSlotLayoutBulk([slotLayoutKey(ctx.currentClientId, ctx.periodKey)], layout);
  }
  return persistSlotLayoutBulk(keys, layout);
}
