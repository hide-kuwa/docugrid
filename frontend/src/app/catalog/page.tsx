"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowDownUp, ExternalLink, Eye, Loader2, RefreshCw, Table2 } from "lucide-react";
import { AuthNavButtons } from "@/components/AuthNavButtons";
import { CatalogSlotPreview } from "@/features/docugrid/components/CatalogSlotPreview";
import {
  fetchCatalogCategories,
  fetchDocumentCatalog,
  type CatalogCategoryFields,
  type CatalogPayload,
  type CatalogRow,
} from "@/features/docugrid/lib/document-catalog-api";
import { createOcrJob, pollOcrJob, type OcrJobItem } from "@/features/docugrid/lib/ocr-jobs-api";
import { propagateSlotNormalizeResult } from "@/features/org/org-directory-events";
import { buildMatrixDeepLink } from "@/lib/matrix-deep-link";
import { checkSession, loadCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/authorization";
import { canAccessDevConsole } from "@/lib/app-surface";
import { getPostLoginPath } from "@/lib/persona";
import { DevConsoleChrome } from "@/components/dev/DevConsoleChrome";

function formatYen(n: number | null | undefined): string {
  if (n == null || n <= 0) return "—";
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}億円`;
  return `${Math.round(n / 10_000)}万円`;
}

function submissionLabel(row: CatalogPayload["rows"][0]): string {
  if (!row.submitted) return "未提出";
  if (row.logical_status === "approved") return "承認済";
  if (row.metadata_status === "needs_review") return "要確認";
  return "提出済";
}

function CatalogPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const needsReviewOnly = searchParams.get("needs_review") === "1";
  const user = loadCurrentUser();
  const [authOk, setAuthOk] = useState(false);
  const [categories, setCategories] = useState<CatalogCategoryFields[]>([]);
  const [categoryId, setCategoryId] = useState("tax_return_corporate");
  const [periodKey, setPeriodKey] = useState("year:2");
  const [sort, setSort] = useState("client_name");
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [payload, setPayload] = useState<CatalogPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewRow, setPreviewRow] = useState<CatalogRow | null>(null);
  const [ocrBusyId, setOcrBusyId] = useState<string | null>(null);

  const activeCategory = useMemo(
    () => categories.find((c) => c.category_id === categoryId),
    [categories, categoryId],
  );

  useEffect(() => {
    void (async () => {
      const session = await checkSession();
      if (session !== "ok") {
        router.replace(session === "offline" ? "/login?reason=offline" : "/login?reason=session");
        return;
      }
      if (!hasPermission(user, "document.view")) {
        router.replace("/");
        return;
      }
      if (!canAccessDevConsole(loadCurrentUser())) {
        router.replace(getPostLoginPath(loadCurrentUser()));
        return;
      }
      setAuthOk(true);
    })();
  }, [router, user]);

  useEffect(() => {
    if (!authOk) return;
    void (async () => {
      try {
        const cats = await fetchCatalogCategories();
        setCategories(cats);
        if (cats.length > 0 && !cats.some((c) => c.category_id === categoryId)) {
          setCategoryId(cats[0].category_id);
          setPeriodKey(cats[0].default_period_key);
        }
      } catch {
        setError("カテゴリ定義の取得に失敗しました");
      }
    })();
  }, [authOk, categoryId]);

  const reload = useCallback(async () => {
    if (!authOk || !categoryId) return;
    setLoading(true);
    setError(null);
    try {
      setPayload(
        await fetchDocumentCatalog({
          categoryId,
          periodKey,
          sort,
          order,
          metadataStatus: needsReviewOnly ? "needs_review" : undefined,
        }),
      );
    } catch {
      setError("カタログの取得に失敗しました");
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [authOk, categoryId, periodKey, sort, order, needsReviewOnly]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onCategoryChange = (id: string) => {
    setCategoryId(id);
    const cat = categories.find((c) => c.category_id === id);
    if (cat) setPeriodKey(cat.default_period_key);
  };

  const toggleSort = (fieldId: string) => {
    if (sort === fieldId) {
      setOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSort(fieldId);
      setOrder(fieldId === "client_name" ? "asc" : "desc");
    }
  };

  const runOcrForRow = async (row: CatalogRow) => {
    if (!row.current_version_id || !row.submitted) return;
    setOcrBusyId(row.client_id);
    setError(null);
    try {
      const job = await createOcrJob({
        clientId: row.client_id,
        documentVersionId: row.current_version_id,
        periodKey: row.period_key,
        slotId: row.category_id,
        slotLabel: row.slot_label || undefined,
      });
      const finished: OcrJobItem = await pollOcrJob(job.id, row.client_id);
      const norm = finished.result?.normalize_result as
        | import("@/features/docugrid/lib/slot-documents").NormalizeResultPayload
        | undefined;
      propagateSlotNormalizeResult(row.client_id, norm ?? null);
      await reload();
    } catch {
      setError("OCR 再抽出に失敗しました");
    } finally {
      setOcrBusyId(null);
    }
  };

  if (!authOk) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const sortFields = activeCategory?.sort_fields ?? [];

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-700">
      <DevConsoleChrome title="書類カタログ" subtitle="顧問先横断の提出・OCR 要確認（開発ツール）" />
      <header className="border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4">
          <Link
            href="/dev"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
          >
            開発コンソール
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            マトリクス
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 text-lg font-black text-slate-800">
              <Table2 className="h-5 w-5 text-indigo-600" />
              書類カタログ
            </h1>
            <p className="text-xs text-slate-500">
              書類種別ごとに顧問先横断で提出状況を一覧します（Phase A）
            </p>
          </div>
          <AuthNavButtons variant="light" />
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 p-6">
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <label className="text-xs font-bold text-slate-600">
            書類種別
            <select
              className="mt-1 block min-w-[12rem] rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              value={categoryId}
              onChange={(e) => onCategoryChange(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c.category_id} value={c.category_id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold text-slate-600">
            期間キー
            <input
              className="mt-1 block w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-mono"
              value={periodKey}
              onChange={(e) => setPeriodKey(e.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={() => {
              const next = !needsReviewOnly;
              const q = new URLSearchParams(searchParams.toString());
              if (next) q.set("needs_review", "1");
              else q.delete("needs_review");
              router.replace(`/catalog${q.size ? `?${q}` : ""}`);
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
              needsReviewOnly
                ? "bg-amber-100 text-amber-900 ring-1 ring-amber-300"
                : "border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            要確認のみ
          </button>
          {payload ? (
            <p className="text-xs text-slate-500">
              提出 {payload.submitted_count}/{payload.client_count} 社 · 指標期{" "}
              <span className="font-bold">{payload.fiscal_label}</span>
            </p>
          ) : null}
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold text-slate-600">
              <tr>
                {sortFields.map((f) => (
                  <th key={f.id} className="px-3 py-2">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-indigo-700"
                      onClick={() => toggleSort(f.id)}
                    >
                      {f.label}
                      {sort === f.id ? (
                        <ArrowDownUp className="h-3 w-3" />
                      ) : null}
                    </button>
                  </th>
                ))}
                <th className="px-3 py-2 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={sortFields.length + 1} className="px-3 py-8 text-center text-slate-400">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </td>
                </tr>
              ) : payload && payload.rows.length > 0 ? (
                payload.rows.map((row) => (
                  <tr key={row.client_id} className="border-t border-slate-100 hover:bg-slate-50/80">
                    {sortFields.map((f) => {
                      if (f.id === "client_name") {
                        return (
                          <td key={f.id} className="px-3 py-2 font-semibold text-slate-800">
                            <div className="flex flex-wrap items-center gap-2">
                              <span>{row.client_name}</span>
                              {row.submitted ? (
                                <Link
                                  href={buildMatrixDeepLink({
                                    clientId: row.client_id,
                                    periodKey: row.period_key,
                                    slotId: row.category_id,
                                  })}
                                  className="inline-flex items-center gap-0.5 text-[10px] font-bold text-indigo-600 hover:underline"
                                  title="マトリクスで開く"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  マトリクス
                                </Link>
                              ) : null}
                            </div>
                          </td>
                        );
                      }
                      if (f.id === "submission") {
                        return (
                          <td key={f.id} className="px-3 py-2">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                !row.submitted
                                  ? "bg-rose-100 text-rose-800"
                                  : row.logical_status === "approved"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-amber-100 text-amber-900"
                              }`}
                            >
                              {submissionLabel(row)}
                            </span>
                          </td>
                        );
                      }
                      if (f.id === "uploaded_at") {
                        return (
                          <td key={f.id} className="px-3 py-2 text-xs text-slate-500">
                            {row.uploaded_at
                              ? new Date(row.uploaded_at).toLocaleDateString("ja-JP")
                              : "—"}
                          </td>
                        );
                      }
                      const val = row.fields[f.id];
                      return (
                        <td key={f.id} className="px-3 py-2 font-mono text-xs text-slate-700">
                          {formatYen(val)}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right">
                      {row.submitted && row.slot_document_id ? (
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            title="プレビュー"
                            className="rounded border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100"
                            onClick={() => setPreviewRow(row)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          {row.current_version_id ? (
                            <button
                              type="button"
                              title="OCR 再抽出"
                              disabled={ocrBusyId === row.client_id}
                              className="rounded border border-indigo-200 p-1.5 text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                              onClick={() => void runOcrForRow(row)}
                            >
                              {ocrBusyId === row.client_id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <RefreshCw className="h-3.5 w-3.5" />
                              )}
                            </button>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={sortFields.length + 1} className="px-3 py-8 text-center text-slate-400">
                    データがありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
      <CatalogSlotPreview row={previewRow} onClose={() => setPreviewRow(null)} />
    </div>
  );
}

export default function CatalogPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      }
    >
      <CatalogPageContent />
    </Suspense>
  );
}
