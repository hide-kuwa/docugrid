"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import {
  fetchCatalogCategories,
  fetchDocumentCatalog,
  type CatalogRow,
} from "@/features/docugrid/lib/document-catalog-api";
import { buildMatrixDeepLink } from "@/lib/matrix-deep-link";

type Props = {
  maxItems?: number;
};

export function ClassifyQueueWidget({ maxItems = 8 }: Props) {
  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void (async () => {
      try {
        const categories = await fetchCatalogCategories(controller.signal);
        const batches = await Promise.all(
          categories.map((cat) =>
            fetchDocumentCatalog(
              {
                categoryId: cat.category_id,
                periodKey: cat.default_period_key,
                metadataStatus: "needs_review",
              },
              controller.signal,
            ),
          ),
        );
        const merged = batches.flatMap((p) => p.rows);
        setRows(merged.slice(0, maxItems));
      } catch {
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [maxItems]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        要確認を検索中…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        OCR 要確認の資料はありません。{" "}
        <Link href="/catalog" className="font-bold text-indigo-600 hover:underline">
          書類カタログ
        </Link>
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-1.5">
        {rows.map((row) => (
          <li
            key={`${row.client_id}-${row.category_id}-${row.period_key}`}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2 text-sm"
          >
            <div className="min-w-0">
              <p className="font-bold text-amber-950">{row.client_name}</p>
              <p className="text-xs text-amber-800">
                {row.slot_label || row.category_id} · 信頼度要確認
              </p>
            </div>
            {row.submitted ? (
              <Link
                href={buildMatrixDeepLink({
                  clientId: row.client_id,
                  periodKey: row.period_key,
                  slotId: row.category_id,
                })}
                className="inline-flex items-center gap-0.5 text-xs font-bold text-indigo-600 hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                開く
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
      <Link
        href="/catalog?needs_review=1"
        className="text-xs font-bold text-indigo-600 hover:underline"
      >
        カタログで要確認のみ表示 →
      </Link>
    </div>
  );
}
