"use client";

import { useCallback, useEffect, useState } from "react";
import type { DocugridUser } from "@/lib/auth";
import { unseenTours, resetTourSeen } from "@/lib/feature-tours";
import { FeatureTour } from "./FeatureTour";

type Props = {
  user: DocugridUser | null;
  /** Trigger a specific tour (e.g. when pending review appears) */
  triggerTourId?: string | null;
  onTriggerConsumed?: () => void;
};

/**
 * スポットライト本体のみ。入口 UI は左レールのヘルプ・フライアウト。
 * 開始: CustomEvent `docugrid:start-tour` { detail: { id } }
 */
export function FeatureTourHost({ user, triggerTourId, onTriggerConsumed }: Props) {
  const [activeTourId, setActiveTourId] = useState<string | null>(null);

  useEffect(() => {
    if (!user || activeTourId) return;
    const unseen = unseenTours(user);
    const auto = unseen.find((t) => t.autoStart);
    if (!auto) return;
    const timer = window.setTimeout(() => setActiveTourId(auto.id), 900);
    return () => window.clearTimeout(timer);
  }, [user, activeTourId]);

  useEffect(() => {
    if (triggerTourId) {
      resetTourSeen(triggerTourId);
      setActiveTourId(triggerTourId);
      onTriggerConsumed?.();
    }
  }, [triggerTourId, onTriggerConsumed]);

  useEffect(() => {
    const onStart = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (!id) return;
      resetTourSeen(id);
      setActiveTourId(id);
    };
    window.addEventListener("docugrid:start-tour", onStart);
    return () => window.removeEventListener("docugrid:start-tour", onStart);
  }, []);

  const handleClose = useCallback(() => {
    setActiveTourId(null);
  }, []);

  return <FeatureTour tourId={activeTourId} onClose={handleClose} />;
}
