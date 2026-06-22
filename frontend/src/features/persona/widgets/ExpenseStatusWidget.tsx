"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { listCaptureItems } from "@/features/capture/lib/capture-api";
import type { CaptureItem } from "@/features/capture/types";

const STATUS_LABEL: Record<string, string> = {
  processing: "処理中",
  needs_review: "要確認",
  ok: "確認済",
  confirmed: "確定",
};

type Props = {
  clientId: string;
};

export function ExpenseStatusWidget({ clientId }: Props) {
  const [items, setItems] = useState<CaptureItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId) return;
    const controller = new AbortController();
    setLoading(true);
    void (async () => {
      try {
        setItems(await listCaptureItems(clientId, { signal: controller.signal }));
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [clientId]);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of items) {
      map[item.status] = (map[item.status] ?? 0) + 1;
    }
    return map;
  }, [items]);

  const needsReview = useMemo(
    () => items.filter((i) => i.status === "needs_review").slice(0, 5),
    [items],
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        精算状況を読み込み中…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        キャプチャの領収書はまだありません。{" "}
        <Link href="/capture" className="font-bold text-violet-600 hover:underline">
          撮影して提出
        </Link>
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {Object.entries(counts).map(([status, n]) => (
          <span
            key={status}
            className={`rounded-full px-2.5 py-1 text-xs font-bold ${
              status === "needs_review"
                ? "bg-amber-100 text-amber-900"
                : "bg-slate-100 text-slate-700"
            }`}
          >
            {STATUS_LABEL[status] ?? status} {n}
          </span>
        ))}
      </div>
      {needsReview.length > 0 ? (
        <ul className="space-y-1.5 text-sm">
          {needsReview.map((item) => (
            <li key={item.id} className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2">
              <p className="font-semibold text-amber-950">{item.title || item.file_name}</p>
              {item.audit_message ? (
                <p className="mt-0.5 text-xs text-amber-800">{item.audit_message}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <Link href="/capture" className="text-xs font-bold text-violet-600 hover:underline">
        キャプチャ画面で詳細を確認 →
      </Link>
    </div>
  );
}
