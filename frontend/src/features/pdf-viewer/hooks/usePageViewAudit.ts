"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  batchCreateReviewEvents,
  type ReviewEventCreate,
  type SlotIdentity,
} from "@/features/pdf-viewer/lib/review-events";

const FLUSH_INTERVAL_MS = 8000;
const MIN_DWELL_MS = 300;

type PageViewAuditOptions = {
  enabled: boolean;
  slotIdentity?: SlotIdentity;
  currentPage: number;
  documentVersionId?: string;
  versionLabel?: string;
};

/** ビューア内のページ閲覧を page_view イベントとしてバッチ送信する。 */
export function usePageViewAudit({
  enabled,
  slotIdentity,
  currentPage,
  documentVersionId,
  versionLabel,
}: PageViewAuditOptions) {
  const dwellByPageRef = useRef<Map<number, number>>(new Map());
  const pageEnteredAtRef = useRef<number>(Date.now());
  const lastPageRef = useRef(currentPage);
  const versionRef = useRef({ documentVersionId, versionLabel });
  versionRef.current = { documentVersionId, versionLabel };

  const flush = useCallback(async () => {
    if (!slotIdentity || dwellByPageRef.current.size === 0) return;
    const entries = Array.from(dwellByPageRef.current.entries()).filter(([, ms]) => ms >= MIN_DWELL_MS);
    dwellByPageRef.current.clear();
    if (entries.length === 0) return;

    const events: ReviewEventCreate[] = entries.map(([page, dwell_ms]) => ({
      event_type: "page_view",
      status: "draft",
      action_title: `ページ ${page + 1} を閲覧`,
      version_label: versionRef.current.versionLabel,
      document_version_id: versionRef.current.documentVersionId,
      detail: JSON.stringify({ page, dwell_ms }),
    }));

    try {
      await batchCreateReviewEvents(slotIdentity, events);
    } catch (err) {
      console.warn("page_view batch failed:", err);
      for (const [page, dwell_ms] of entries) {
        dwellByPageRef.current.set(page, (dwellByPageRef.current.get(page) ?? 0) + dwell_ms);
      }
    }
  }, [slotIdentity]);

  useEffect(() => {
    if (!enabled || !slotIdentity) return;
    const now = Date.now();
    const prevPage = lastPageRef.current;
    const dwell = now - pageEnteredAtRef.current;
    if (dwell >= MIN_DWELL_MS) {
      dwellByPageRef.current.set(prevPage, (dwellByPageRef.current.get(prevPage) ?? 0) + dwell);
    }
    lastPageRef.current = currentPage;
    pageEnteredAtRef.current = now;
  }, [currentPage, enabled, slotIdentity]);

  useEffect(() => {
    if (!enabled || !slotIdentity) return;
    pageEnteredAtRef.current = Date.now();
    lastPageRef.current = currentPage;
    dwellByPageRef.current.clear();
  }, [enabled, slotIdentity?.clientId, slotIdentity?.periodKey, slotIdentity?.slotId]);

  useEffect(() => {
    if (!enabled || !slotIdentity) return;
    const timer = window.setInterval(() => {
      void flush();
    }, FLUSH_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
      const now = Date.now();
      const dwell = now - pageEnteredAtRef.current;
      if (dwell >= MIN_DWELL_MS) {
        dwellByPageRef.current.set(
          lastPageRef.current,
          (dwellByPageRef.current.get(lastPageRef.current) ?? 0) + dwell,
        );
      }
      void flush();
    };
  }, [enabled, slotIdentity, flush]);
}
