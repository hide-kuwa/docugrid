export type SlotLayout = {
  labels: string[];
  order: number[];
  /** labels と同じ長さの安定 slot_id（追加枠・定型枠用） */
  slotIds?: string[];
};

const STORAGE_KEY = "taxx-slot-layout:v1";

function isValidOrder(order: number[], n: number): boolean {
  if (order.length !== n) return false;
  const set = new Set(order);
  if (set.size !== n) return false;
  for (let i = 0; i < n; i++) {
    if (!set.has(i)) return false;
  }
  return true;
}

export function loadAllSlotLayouts(): Record<string, SlotLayout> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, SlotLayout>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function persistSlotLayout(layoutKey: string, layout: SlotLayout): void {
  if (typeof window === "undefined") return;
  try {
    const all = loadAllSlotLayouts();
    all[layoutKey] = layout;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* ignore quota */
  }
}

export function persistSlotLayoutBulk(
  layoutKeys: string[],
  layout: SlotLayout,
): Record<string, SlotLayout> {
  if (typeof window === "undefined") return {};
  const snapshot: SlotLayout = {
    labels: [...layout.labels],
    order: [...layout.order],
    ...(layout.slotIds ? { slotIds: [...layout.slotIds] } : {}),
  };
  try {
    const all = loadAllSlotLayouts();
    for (const key of layoutKeys) {
      all[key] = snapshot;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    return all;
  } catch {
    return loadAllSlotLayouts();
  }
}

export function resolveSlotLayout(
  layoutKey: string,
  defaultLabels: string[],
  stored: Record<string, SlotLayout>,
): SlotLayout {
  const saved = stored[layoutKey];
  if (
    saved &&
    saved.labels.length >= defaultLabels.length &&
    isValidOrder(saved.order, saved.labels.length)
  ) {
    return {
      labels: [...saved.labels],
      order: [...saved.order],
      ...(saved.slotIds ? { slotIds: [...saved.slotIds] } : {}),
    };
  }

  const n = defaultLabels.length;
  const baseOrder = Array.from({ length: n }, (_, i) => i);
  if (!saved || saved.labels.length !== n || !isValidOrder(saved.order, n)) {
    return { labels: [...defaultLabels], order: baseOrder };
  }
  return {
    labels: [...saved.labels],
    order: [...saved.order],
    ...(saved.slotIds ? { slotIds: [...saved.slotIds] } : {}),
  };
}
