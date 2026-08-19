"use client";

import { useEffect, useState } from "react";
import {
  fetchDocumentStatus,
  type DocumentStatusSummary,
} from "@/features/docugrid/lib/document-status";
import { listReviewTimeline, type ReviewTimelineItem } from "@/features/pdf-viewer/lib/review-events";

export function useMatrixClientStatus(
  canViewDocument: boolean,
  clientId: string,
  periodKey: string,
  statusNonce: number,
) {
  const [docStatus, setDocStatus] = useState<DocumentStatusSummary | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<ReviewTimelineItem[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  useEffect(() => {
    if (!canViewDocument) return;
    if (!clientId || clientId === "unknown") {
      setDocStatus(null);
      return;
    }
    const controller = new AbortController();
    let active = true;
    void (async () => {
      try {
        const summary = await fetchDocumentStatus(clientId, controller.signal);
        if (active) setDocStatus(summary);
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          console.warn("Failed to load document status:", err);
        }
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [canViewDocument, clientId, statusNonce]);

  useEffect(() => {
    if (!canViewDocument) return;
    if (!clientId || clientId === "unknown") return;
    const controller = new AbortController();
    let active = true;
    setTimelineLoading(true);
    void (async () => {
      try {
        const events = await listReviewTimeline(
          { clientId, periodKey, limit: 40 },
          controller.signal,
        );
        if (active) setTimelineEvents(events);
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          console.warn("Timeline load failed:", err);
        }
      } finally {
        if (active) setTimelineLoading(false);
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [canViewDocument, clientId, periodKey, statusNonce]);

  return { docStatus, timelineEvents, timelineLoading };
}
