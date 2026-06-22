"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import type { DocugridUser } from "@/lib/auth";
import { unseenTours } from "@/lib/feature-tours";
import { FeatureTour } from "./FeatureTour";

type Props = {
  user: DocugridUser | null;
  /** Trigger a specific tour (e.g. when pending review appears) */
  triggerTourId?: string | null;
  onTriggerConsumed?: () => void;
};

export function FeatureTourHost({ user, triggerTourId, onTriggerConsumed }: Props) {
  const [activeTourId, setActiveTourId] = useState<string | null>(null);
  const [unseenCount, setUnseenCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    const unseen = unseenTours(user);
    setUnseenCount(unseen.length);
    if (unseen.length > 0 && !activeTourId) {
      const timer = window.setTimeout(() => setActiveTourId(unseen[0].id), 800);
      return () => window.clearTimeout(timer);
    }
  }, [user, activeTourId]);

  useEffect(() => {
    if (triggerTourId) {
      setActiveTourId(triggerTourId);
      onTriggerConsumed?.();
    }
  }, [triggerTourId, onTriggerConsumed]);

  const handleClose = () => {
    setActiveTourId(null);
    if (user) setUnseenCount(unseenTours(user).length);
  };

  return (
    <>
      {unseenCount > 0 && !activeTourId && (
        <div
          className="pointer-events-none fixed bottom-4 left-4 z-20 flex items-center gap-1.5 rounded-full bg-violet-600 px-3 py-1.5 text-[10px] font-bold text-white shadow-lg"
          title="未読の新機能ガイドがあります"
        >
          <Sparkles className="h-3 w-3" />
          新機能 {unseenCount}
        </div>
      )}
      <FeatureTour tourId={activeTourId} onClose={handleClose} />
    </>
  );
}
