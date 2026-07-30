"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import {
  fetchDevDocumentCategories,
  reloadDevDocumentCategories,
  type DocumentCategory,
  type DocumentCategoryListResponse,
} from "@/lib/document-categories-api";

/** 書類カテゴリ（中分類）の参照パネル。document_categories.yaml と様式の所属を表示。 */

type Props = {
  error: string | null;
  setError: (v: string | null) => void;
};

function CategoryRow({ cat }: { cat: DocumentCategory }) {
  const [open, setOpen] = useState(false);
  const hasForms = cat.forms.length > 0;
  return (
    <li className="rounded-xl border border-slate-700 bg-slate-900/70">
      <div className="flex items-center gap-2 p-3">
        <button
          type="button"
          onClick={() => hasForms && setOpen((v) => !v)}
          disabled={!hasForms}
          className="text-slate-400 hover:text-white disabled:opacity-30"
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white">{cat.label}</p>
          <p className="mt-0.5 font-mono text-[10px] text-slate-500">
            {cat.id}
            {cat.type_id ? ` · 大分類: ${cat.type_id}` : ""}
          </p>
        </div>
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
            hasForms ? "bg-violet-900/60 text-violet-200" : "bg-slate-800 text-slate-500"
          }`}
        >
          様式 {cat.form_count}
        </span>
      </div>
      {open && hasForms ? (
        <ul className="border-t border-slate-800 px-4 py-2 text-[11px] text-slate-300">
          {cat.forms.map((f) => (
            <li key={f.form_id} className="flex items-center gap-2 py-0.5">
              <span className="font-mono text-slate-500">{f.form_id}</span>
              <span>{f.label_ja}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function DocumentCategoriesPanel({ error, setError }: Props) {
  const [data, setData] = useState<DocumentCategoryListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchDevDocumentCategories());
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [setError]);

  useEffect(() => {
    void load();
  }, [load]);

  const onReload = async () => {
    setReloading(true);
    setError(null);
    try {
      setData(await reloadDevDocumentCategories());
    } catch (e) {
      setError(e instanceof Error ? e.message : "再読込に失敗しました");
    } finally {
      setReloading(false);
    }
  };

  const grouped = useMemo(() => {
    const map = new Map<string, DocumentCategory[]>();
    for (const cat of data?.categories ?? []) {
      const key = cat.group || "その他";
      const arr = map.get(key) ?? [];
      arr.push(cat);
      map.set(key, arr);
    }
    return Array.from(map.entries());
  }, [data]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        読み込み中…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-violet-800/40 bg-violet-950/30 px-4 py-3 text-xs text-violet-100/90">
        <p className="font-bold text-violet-200">書類カテゴリ（中分類）</p>
        <p className="mt-1 leading-relaxed text-violet-100/70">
          大分類（書類種別）と様式（別表・受信通知）の間の中分類です。法人税申告書・消費税申告書・科目内訳書・概況書
          などの束を定義し、様式は
          <code className="rounded bg-slate-800 px-1">maps_to</code>
          （tax_type / slot_label / type_id / category）で自動的にここへ紐付きます。
          定義の編集は <code className="rounded bg-slate-800 px-1">config/document_categories.yaml</code> です。
        </p>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-400">
          {data
            ? `${data.category_count} カテゴリ · v${data.version} · 未分類 ${data.unmatched_count} 様式`
            : "—"}
        </p>
        <button
          type="button"
          onClick={() => void onReload()}
          disabled={reloading}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${reloading ? "animate-spin" : ""}`} />
          YAML 再読込
        </button>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-800/50 bg-red-950/40 px-3 py-2 text-xs text-red-200">{error}</p>
      ) : null}

      <div className="space-y-4">
        {grouped.map(([group, cats]) => (
          <div key={group}>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">{group}</p>
            <ul className="space-y-2">
              {cats.map((cat) => (
                <CategoryRow key={cat.id} cat={cat} />
              ))}
            </ul>
          </div>
        ))}
      </div>

      {data && data.unmatched.length > 0 ? (
        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-500/80">
            未分類（中分類に紐付いていない様式）
          </p>
          <ul className="rounded-xl border border-amber-800/40 bg-amber-950/20 px-4 py-2 text-[11px] text-amber-100/80">
            {data.unmatched.map((f) => (
              <li key={f.form_id} className="flex items-center gap-2 py-0.5">
                <span className="font-mono text-amber-200/60">{f.form_id}</span>
                <span>{f.label_ja}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
