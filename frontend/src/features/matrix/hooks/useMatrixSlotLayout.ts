"use client";

import { useCallback, useMemo, useState } from "react";
import type { NavClient } from "@/lib/client-nav";
import {
  loadAllSlotLayouts,
  resolveSlotLayout,
  type SlotLayout,
} from "@/lib/slot-layout-storage";
import { resolveLayoutSlotIds, slotIdAtIndex } from "@/lib/slot-layout-ops";
import { applySlotLayoutWithScope, type SlotLayoutScope } from "@/lib/slot-layout-scope";
import { buildSlotStorageKeyFromSlotId } from "@/lib/slot-ids";
import {
  isDataPeriodIndex,
  isPermPeriodIndex,
} from "@/lib/period-nav";

type UseMatrixSlotLayoutParams = {
  currentClientId: string;
  periodKey: string;
  activePeriodIdx: number;
  activeMode: "year" | "month";
  navClients: NavClient[];
  assignedClientIds: string[];
  allVisibleClientIds: string[];
};

export function useMatrixSlotLayout({
  currentClientId,
  periodKey,
  activePeriodIdx,
  activeMode,
  navClients,
  assignedClientIds,
  allVisibleClientIds,
}: UseMatrixSlotLayoutParams) {
  const defaultSlotLabels = useMemo(() => {
    if (isDataPeriodIndex(activePeriodIdx)) return [];
    if (isPermPeriodIndex(activePeriodIdx))
      return ["定款", "履歴事項全部証明書", "株主名簿", "設立届出書", "関係図"];
    if (activeMode === "year")
      return [
        "税務代理権限証書",
        "法人税申告書",
        "勘定科目内訳明細書",
        "法人事業概況説明書",
        "決算報告書",
        "総勘定元帳",
        "消費税申告書",
      ];
    return ["月次試算表", "通帳コピー", "請求書綴り", "給与台帳"];
  }, [activePeriodIdx, activeMode]);

  const slotLayoutKey = `${currentClientId}:${periodKey}`;
  const [slotLayoutStore, setSlotLayoutStore] = useState<Record<string, SlotLayout>>(() =>
    typeof window !== "undefined" ? loadAllSlotLayouts() : {},
  );
  const [layoutEditScope, setLayoutEditScope] = useState<SlotLayoutScope>("current");
  const [selectedLayoutClientIds, setSelectedLayoutClientIds] = useState<string[]>([]);

  const layoutScopeStaffClients = useMemo(
    () => navClients.map((c) => ({ id: c.id, name: c.name })),
    [navClients],
  );

  const currentSlotLayout = useMemo(
    () => resolveSlotLayout(slotLayoutKey, defaultSlotLabels, slotLayoutStore),
    [slotLayoutKey, defaultSlotLabels, slotLayoutStore],
  );
  const slotLabels = currentSlotLayout.labels;
  const slotDisplayOrder = currentSlotLayout.order;
  const layoutSlotIds = useMemo(
    () => resolveLayoutSlotIds(currentSlotLayout, periodKey),
    [currentSlotLayout, periodKey],
  );

  const slotKeyFor = useCallback(
    (slotIndex: number) =>
      buildSlotStorageKeyFromSlotId(
        currentClientId,
        periodKey,
        slotIdAtIndex(currentSlotLayout, periodKey, slotIndex),
      ),
    [currentClientId, periodKey, currentSlotLayout],
  );

  const applySlotLayout = useCallback(
    (layout: SlotLayout) => {
      const updated = applySlotLayoutWithScope(
        layoutEditScope,
        {
          currentClientId,
          periodKey,
          staffClientIds: assignedClientIds,
          orgClientIds: allVisibleClientIds,
          selectedClientIds: selectedLayoutClientIds,
        },
        layout,
      );
      setSlotLayoutStore(updated);
    },
    [
      layoutEditScope,
      currentClientId,
      periodKey,
      assignedClientIds,
      allVisibleClientIds,
      selectedLayoutClientIds,
    ],
  );

  return {
    currentSlotLayout,
    slotLabels,
    slotDisplayOrder,
    layoutSlotIds,
    slotKeyFor,
    applySlotLayout,
    layoutEditScope,
    setLayoutEditScope,
    selectedLayoutClientIds,
    setSelectedLayoutClientIds,
    layoutScopeStaffClients,
  };
}
