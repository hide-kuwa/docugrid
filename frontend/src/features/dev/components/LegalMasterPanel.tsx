"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Download,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Search,
  Sprout,
} from "lucide-react";
import {
  domainLabel,
  exportLegalMasterCsv,
  fetchLegalMasterEntries,
  formatValue,
  importLegalMasterCsv,
  seedLegalMaster,
  validateLegalMasterCsv,
  type ImportMode,
  type LegalMasterEntry,
} from "@/lib/legal-master-api";

type Tab = "list" | "csv";

export function LegalMasterPanel() {
  const [tab, setTab] = useState<Tab>("list");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<LegalMasterEntry[]>([]);
  const [meta, setMeta] = useState<{ entry_count: number; db_path: string } | null>(null);
  const [domainFilter, setDomainFilter] = useState("");
  const [asOf, setAsOf] = useState("2025-06-01");
  const [previewKey, setPreviewKey] = useState("consumption_tax.standard_rate");
  const [previewResult, setPreviewResult] = useState<string | null>(null);

  const [csvText, setCsvText] = useState("");
  const [csvBusy, setCsvBusy] = useState(false);
  const [validateResult, setValidateResult] = useState<{
    valid: boolean;
    errors: string[];
    row_count: number;
  } | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>("merge");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchLegalMasterEntries({
        domain: domainFilter || undefined,
        asOf: asOf || undefined,
      });
      setEntries(res.entries);
      setMeta({ entry_count: res.entry_count, db_path: res.db_path });
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [domainFilter, asOf]);

  useEffect(() => {
    void load();
  }, [load]);

  const onExport = async () => {
    setCsvBusy(true);
    setError(null);
    try {
      const res = await exportLegalMasterCsv(domainFilter || undefined);
      setCsvText(res.csv_text);
      setTab("csv");
    } catch (e) {
      setError(e instanceof Error ? e.message : "エクスポートに失敗しました");
    } finally {
      setCsvBusy(false);
    }
  };

  const onSeed = async () => {
    setCsvBusy(true);
    setError(null);
    try {
      await seedLegalMaster();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "シードに失敗しました");
    } finally {
      setCsvBusy(false);
    }
  };

  const onValidateCsv = async () => {
    setCsvBusy(true);
    setError(null);
    try {
      const res = await validateLegalMasterCsv(csvText);
      setValidateResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "検証に失敗しました");
    } finally {
      setCsvBusy(false);
    }
  };

  const onImportCsv = async () => {
    if (!window.confirm(importMode === "replace" ? "全件置換しますか？" : "マージしますか？")) return;
    setCsvBusy(true);
    setError(null);
    try {
      await importLegalMasterCsv(csvText, importMode);
      setValidateResult(null);
      await load();
      setTab("list");
    } catch (e) {
      setError(e instanceof Error ? e.message : "インポートに失敗しました");
    } finally {
      setCsvBusy(false);
    }
  };

  const onPreview = () => {
    const match = entries.find((e) => e.master_key === previewKey);
    if (!match) {
      setPreviewResult(`as_of=${asOf}: 該当キーなし（フィルタ後一覧に無い場合があります）`);
      return;
    }
    setPreviewResult(
      `${match.label_ja}: ${formatValue(match)}（${match.valid_from} 〜 ${match.valid_to || "現行"}）`,
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-slate-400">
            法定基準値の履歴マスタ（valid_from / valid_to）。法令改定は CSV で投入（C5）。
          </p>
          {meta ? (
            <p className="mt-1 font-mono text-[10px] text-slate-500">
              {meta.entry_count} entries · {meta.db_path}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void onSeed()}
            disabled={csvBusy}
            className="inline-flex items-center gap-1 rounded-lg border border-emerald-700/50 px-3 py-1.5 text-xs font-bold text-emerald-200 hover:bg-emerald-950/40 disabled:opacity-50"
          >
            <Sprout className="h-3.5 w-3.5" />
            シード
          </button>
          <button
            type="button"
            onClick={() => void onExport()}
            disabled={csvBusy}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1 rounded-lg border border-amber-600/40 bg-amber-950/40 px-3 py-1.5 text-xs font-bold text-amber-200 hover:bg-amber-950/70"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            再読込
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-700 bg-slate-900/60 p-3">
        <label className="text-[10px] text-slate-500">
          as_of（一覧フィルタ）
          <input
            type="date"
            className="mt-1 block rounded border border-slate-600 bg-slate-950 px-2 py-1 text-xs text-slate-200"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
          />
        </label>
        <label className="text-[10px] text-slate-500">
          domain
          <select
            className="mt-1 block rounded border border-slate-600 bg-slate-950 px-2 py-1 text-xs text-slate-200"
            value={domainFilter}
            onChange={(e) => setDomainFilter(e.target.value)}
          >
            <option value="">すべて</option>
            <option value="consumption_tax">消費税</option>
            <option value="deduction_amount">控除額</option>
            <option value="income_tax_bracket">所得税累進</option>
            <option value="income_tax_surcharge">所得税加算</option>
          </select>
        </label>
        <div className="flex flex-1 flex-wrap items-end gap-2">
          <label className="min-w-[12rem] flex-1 text-[10px] text-slate-500">
            プレビュー master_key
            <input
              className="mt-1 w-full rounded border border-slate-600 bg-slate-950 px-2 py-1 font-mono text-xs text-slate-200"
              value={previewKey}
              onChange={(e) => setPreviewKey(e.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={onPreview}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-600"
          >
            <Search className="h-3.5 w-3.5" />
            一覧から確認
          </button>
        </div>
      </div>
      {previewResult ? (
        <p className="rounded-lg border border-blue-800/40 bg-blue-950/30 px-3 py-2 text-xs text-blue-200">
          {previewResult}
        </p>
      ) : null}

      <div className="flex gap-1 rounded-lg border border-slate-700 bg-slate-900/60 p-1">
        <TabBtn active={tab === "list"} onClick={() => setTab("list")}>
          一覧
        </TabBtn>
        <TabBtn active={tab === "csv"} onClick={() => setTab("csv")}>
          <FileSpreadsheet className="mr-1 inline h-3 w-3" />
          CSV
        </TabBtn>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-800/50 bg-red-950/30 px-4 py-3 text-xs text-red-200">
          {error}
        </div>
      ) : null}

      {tab === "list" ? (
        loading ? (
          <div className="flex justify-center py-12 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-900/80">
            <table className="min-w-full border-collapse text-left text-[11px] text-slate-300">
              <thead className="bg-slate-800/80 text-[10px] font-black uppercase text-slate-500">
                <tr>
                  <th className="border-b border-slate-700 px-3 py-2">ドメイン</th>
                  <th className="border-b border-slate-700 px-3 py-2">名称</th>
                  <th className="border-b border-slate-700 px-3 py-2">master_key</th>
                  <th className="border-b border-slate-700 px-3 py-2">値</th>
                  <th className="border-b border-slate-700 px-3 py-2">valid_from</th>
                  <th className="border-b border-slate-700 px-3 py-2">valid_to</th>
                  <th className="border-b border-slate-700 px-3 py-2">根拠</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-800/40">
                    <td className="border-b border-slate-800 px-3 py-2">{domainLabel(e.domain)}</td>
                    <td className="border-b border-slate-800 px-3 py-2 font-bold text-white">
                      {e.label_ja}
                    </td>
                    <td className="border-b border-slate-800 px-3 py-2 font-mono text-[10px] text-slate-400">
                      {e.master_key}
                    </td>
                    <td className="border-b border-slate-800 px-3 py-2">{formatValue(e)}</td>
                    <td className="border-b border-slate-800 px-3 py-2">{e.valid_from}</td>
                    <td className="border-b border-slate-800 px-3 py-2">{e.valid_to || "—"}</td>
                    <td className="border-b border-slate-800 px-3 py-2 text-slate-500">
                      {e.source_law || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      {tab === "csv" ? (
        <div className="space-y-3 rounded-xl border border-slate-700 bg-slate-900/80 p-4">
          <textarea
            className="min-h-[280px] w-full rounded-lg border border-slate-600 bg-slate-950 p-3 font-mono text-[10px] text-slate-200 focus:border-amber-500 focus:outline-none"
            value={csvText}
            onChange={(e) => {
              setCsvText(e.target.value);
              setValidateResult(null);
            }}
            placeholder="domain,master_key,label_ja,..."
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={csvBusy || !csvText.trim()}
              onClick={() => void onValidateCsv()}
              className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
            >
              検証
            </button>
            <select
              className="rounded-lg border border-slate-600 bg-slate-950 px-2 py-1.5 text-xs text-slate-200"
              value={importMode}
              onChange={(e) => setImportMode(e.target.value as ImportMode)}
            >
              <option value="merge">マージ</option>
              <option value="replace">置換</option>
            </select>
            <button
              type="button"
              disabled={csvBusy || !csvText.trim()}
              onClick={() => void onImportCsv()}
              className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-500 disabled:opacity-50"
            >
              インポート
            </button>
          </div>
          {validateResult ? (
            <div
              className={`rounded-lg border px-3 py-2 text-xs ${
                validateResult.valid
                  ? "border-emerald-800/50 text-emerald-200"
                  : "border-red-800/50 text-red-200"
              }`}
            >
              {validateResult.valid ? (
                <p>OK — {validateResult.row_count} rows</p>
              ) : (
                <ul className="list-inside list-disc">
                  {validateResult.errors.map((msg) => (
                    <li key={msg}>{msg}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-xs font-bold ${
        active ? "bg-amber-600 text-white" : "text-slate-400 hover:text-slate-200"
      }`}
    >
      {children}
    </button>
  );
}
