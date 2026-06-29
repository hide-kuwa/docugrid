"use client";

import { useCallback, useEffect, useState } from "react";
import {
  GRID_DISPLAY_PREFERENCES_CHANGED,
  loadGridSlotTagsVisibility,
  saveGridSlotTagsVisibility,
  type SlotTagsVisibility,
} from "@/lib/grid-display-preferences";

export function useGridSlotTagsVisibility() {
  const [mode, setMode] = useState<SlotTagsVisibility>("hover");

  useEffect(() => {
    setMode(loadGridSlotTagsVisibility());
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<SlotTagsVisibility>).detail;
      setMode(detail ?? loadGridSlotTagsVisibility());
    };
    window.addEventListener(GRID_DISPLAY_PREFERENCES_CHANGED, onChange);
    return () => window.removeEventListener(GRID_DISPLAY_PREFERENCES_CHANGED, onChange);
  }, []);

  const update = useCallback((next: SlotTagsVisibility) => {
    saveGridSlotTagsVisibility(next);
    setMode(next);
  }, []);

  return { mode, update } as const;
}
