"use client";

import { useCallback, useEffect, useState } from "react";
import type { WipKind } from "@/components/work-in-progress";
import {
  fetchFeatureSurfaces,
  type FeatureSurface,
  type FeatureSurfaceMode,
} from "./feature-surfaces-api";

export type FeatureSurfaceView = {
  loading: boolean;
  mode: FeatureSurfaceMode;
  writesAllowed: boolean;
  showSample: boolean;
  wipKind: WipKind | null;
  title: string;
  badge: string;
  description: string;
  message: string;
  surface: FeatureSurface | null;
  refresh: () => void;
};

const MODE_MESSAGE: Record<FeatureSurfaceMode, string> = {
  live: "",
  preview: "見本・デモ表示です。本番の保存・確定はまだできません。",
  planned: "工事中です。見本の枠だけ表示しています。",
  partial: "一部未完成です。表示はできますが変更の保存は制限されます。",
};

let cache: { firmId?: string; byId: Record<string, FeatureSurface>; at: number } | null = null;
const CACHE_MS = 30_000;

async function loadSurface(featureId: string): Promise<FeatureSurface | null> {
  const now = Date.now();
  if (!cache || now - cache.at > CACHE_MS) {
    const data = await fetchFeatureSurfaces();
    const byId: Record<string, FeatureSurface> = {};
    for (const s of data.surfaces) byId[s.id] = s;
    cache = { firmId: data.firmId, byId, at: now };
  }
  return cache.byId[featureId] ?? null;
}

export function invalidateFeatureSurfacesCache() {
  cache = null;
}

/** 画面側で工事中/見本バナーを出すためのフック（設定のモードを読む） */
export function useFeatureSurface(featureId: string): FeatureSurfaceView {
  const [surface, setSurface] = useState<FeatureSurface | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    invalidateFeatureSurfacesCache();
    setLoading(true);
    void loadSurface(featureId)
      .then((s) => setSurface(s))
      .catch(() => setSurface(null))
      .finally(() => setLoading(false));
  }, [featureId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void loadSurface(featureId)
      .then((s) => {
        if (!cancelled) setSurface(s);
      })
      .catch(() => {
        if (!cancelled) setSurface(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [featureId]);

  const mode: FeatureSurfaceMode = surface?.mode ?? "planned";
  return {
    loading,
    mode,
    writesAllowed: surface?.writes_allowed ?? false,
    showSample: surface?.show_sample ?? true,
    wipKind: (surface?.wip_kind as WipKind | null) ?? (mode === "live" ? null : "planned"),
    title: surface?.title ?? "準備中",
    badge: surface?.badge ?? "工事中",
    description: surface?.description ?? "",
    message: MODE_MESSAGE[mode],
    surface,
    refresh,
  };
}
