import { defaultSlotIdsForPeriod, slotIndexFromStableId, normalizeSlotId } from "./slot-ids";
import type { SlotLayout } from "./slot-layout-storage";
import type { SlotPresetItem } from "./slot-layout-presets";

const UNASSIGNED_SLOT_PREFIX = "unassigned_";

export function createCustomSlotId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `custom_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  }
  return `custom_${Date.now().toString(36)}`;
}

export function isDeletedSlotId(slotId: string): boolean {
  return slotId.startsWith("deleted_");
}

export function isUnassignedSlotId(slotId: string): boolean {
  return slotId.startsWith(UNASSIGNED_SLOT_PREFIX);
}

export function unassignedSlotIdForDoc(docId: string): string {
  return `${UNASSIGNED_SLOT_PREFIX}${docId}`;
}

/** レイアウトの各インデックスに対応する安定 slot_id を返す。 */
export function resolveLayoutSlotIds(layout: SlotLayout, periodKey: string): string[] {
  const defaults = defaultSlotIdsForPeriod(periodKey);
  return layout.labels.map((_, i) => {
    const fromLayout = layout.slotIds?.[i];
    if (fromLayout && !isUnassignedSlotId(fromLayout)) return fromLayout;
    return defaults[i] ?? `slot_${i}`;
  });
}

export function slotIdAtIndex(layout: SlotLayout, periodKey: string, slotIndex: number): string {
  return resolveLayoutSlotIds(layout, periodKey)[slotIndex] ?? `slot_${slotIndex}`;
}

function withSlotIds(layout: SlotLayout, periodKey: string): SlotLayout {
  const ids = resolveLayoutSlotIds(layout, periodKey);
  return { ...layout, slotIds: ids };
}

export function appendCustomSlot(layout: SlotLayout, label: string, periodKey: string): SlotLayout {
  const trimmed = label.trim();
  if (!trimmed) return layout;
  const base = withSlotIds(layout, periodKey);
  const newIndex = base.labels.length;
  const next: SlotLayout = {
    labels: [...base.labels, trimmed],
    order: [...base.order, newIndex],
    slotIds: [...(base.slotIds ?? []), createCustomSlotId()],
  };
  return next;
}

export function appendPresetSlots(
  layout: SlotLayout,
  presets: SlotPresetItem[],
  periodKey: string,
): SlotLayout {
  const base = withSlotIds(layout, periodKey);
  const existingIds = new Set(base.slotIds ?? []);
  const existingLabels = new Set(base.labels.map((l) => l.trim()));

  let next = base;
  for (const preset of presets) {
    if (existingIds.has(preset.id) || existingLabels.has(preset.label)) continue;
    const newIndex = next.labels.length;
    next = {
      labels: [...next.labels, preset.label],
      order: [...next.order, newIndex],
      slotIds: [...(next.slotIds ?? resolveLayoutSlotIds(next, periodKey)), preset.id],
    };
    existingIds.add(preset.id);
    existingLabels.add(preset.label);
  }
  return next;
}

export type RemoveSlotResult = {
  layout: SlotLayout;
  removedSlotId: string | null;
  removedLabel: string | null;
};

/** 枠定義をレイアウトから削除（インデックスを詰め直す）。 */
export function removeSlotAtIndex(
  layout: SlotLayout,
  slotIndex: number,
  periodKey: string,
): RemoveSlotResult {
  const base = withSlotIds(layout, periodKey);
  const n = base.labels.length;
  if (slotIndex < 0 || slotIndex >= n) {
    return { layout: base, removedSlotId: null, removedLabel: null };
  }
  if (n <= 1) {
    return { layout: base, removedSlotId: null, removedLabel: null };
  }

  const removedLabel = base.labels[slotIndex] ?? null;
  const removedSlotId = base.slotIds?.[slotIndex] ?? null;

  const labels = base.labels.filter((_, i) => i !== slotIndex);
  const slotIds = (base.slotIds ?? resolveLayoutSlotIds(base, periodKey)).filter(
    (_, i) => i !== slotIndex,
  );
  const order = base.order
    .filter((i) => i !== slotIndex)
    .map((i) => (i > slotIndex ? i - 1 : i));

  return {
    layout: { labels, order, slotIds },
    removedSlotId,
    removedLabel,
  };
}

export function renameSlotAtIndex(
  layout: SlotLayout,
  slotIndex: number,
  label: string,
  periodKey: string,
): SlotLayout {
  const base = withSlotIds(layout, periodKey);
  const next = [...base.labels];
  next[slotIndex] = label.trim() || (next[slotIndex] ?? `枠 ${slotIndex + 1}`);
  return { ...base, labels: next };
}

export function reorderSlots(layout: SlotLayout, order: number[], periodKey: string): SlotLayout {
  const base = withSlotIds(layout, periodKey);
  return { ...base, order };
}

/** レイアウト上の slot_id からインデックスを解決（追加枠・定型枠対応）。 */
export function slotIndexFromLayoutSlotId(
  layout: SlotLayout,
  periodKey: string,
  slotId: string,
): number {
  const ids = resolveLayoutSlotIds(layout, periodKey);
  const normalized = normalizeSlotId(periodKey, slotId);
  const fromLayout = ids.indexOf(normalized);
  if (fromLayout >= 0) return fromLayout;
  const legacy = slotIndexFromStableId(periodKey, slotId);
  return Number.isInteger(legacy) && legacy >= 0 ? legacy : -1;
}
