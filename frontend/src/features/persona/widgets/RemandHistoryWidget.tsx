"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  listReviewTimeline,
  type ReviewTimelineItem,
} from "@/features/pdf-viewer/lib/review-events";

type Props = {
  clientIds: string[];
  clientNameById: Record<string, string>;
  maxItems?: number;
};

export function RemandHistoryWidget({
  clientIds,
  clientNameById,
  maxItems = 12,
}: Props) {
  const [events, setEvents] = useState<ReviewTimelineItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (clientIds.length === 0) {
      setEvents([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    void (async () => {
      try {
        const batches = await Promise.all(
          clientIds.slice(0, 12).map((clientId) =>
            listReviewTimeline({ clientId, limit: 30 }, controller.signal),
          ),
        );
        const remands = batches
          .flat()
          .filter((e) => e.event_type === "remand")
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(0, maxItems);
        setEvents(remands);
      } catch {
        setEvents([]);
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [clientIds, maxItems]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        差戻し履歴を読み込み中…
      </div>
    );
  }

  if (events.length === 0) {
    return <p className="text-sm text-slate-500">差戻し履歴はありません。</p>;
  }

  return (
    <ul className="space-y-2">
      {events.map((event) => (
        <li
          key={event.id}
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
        >
          <p className="font-bold text-slate-800">
            {clientNameById[event.client_id] ?? event.client_id}
            <span className="ml-2 font-normal text-slate-500">
              {event.slot_label || event.slot_id}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-slate-600">
            {event.reason || event.action_title || "差戻し"}
          </p>
          <p className="mt-1 text-[10px] text-slate-400">
            {event.created_at.slice(0, 16).replace("T", " ")}
            {event.actor_email ? ` · ${event.actor_email}` : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}
