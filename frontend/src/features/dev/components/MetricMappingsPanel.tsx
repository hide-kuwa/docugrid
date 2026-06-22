"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { MetricMappingFormModal } from "@/features/dev/components/MetricMappingFormModal";
import {
  createMetricMapping,
  deleteMetricMapping,
  EMPTY_MAPPING_FORM,
  exportMetricMappings,
  fetchMetricMappings,
  importMetricMappingsCsv,
  mappingToForm,
  reloadMetricMappings,
  statusLabel,
  statusTone,
  updateMetricMapping,
  validateMetricMappingsCsv,
  type ImportMode,
  type MetricMappingItem,
  type MetricMappingWriteBody,
} from "@/lib/metric-mappings-api";

type Tab = "list" | "csv";

export function MetricMappingsPanel() {
  const [tab, setTab] = useState<Tab>("list");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mappings, setMappings] = useState<MetricMappingItem[]>([]);
  const [meta, setMeta] = useState<{ version: number; config_path: string } | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [formInitial, setFormInitial] = useState<MetricMappingWriteBody>(EMPTY_MAPPING_FORM);
  const [saving, setSaving] = useState(false);

  const [csvText, setCsvText] = useState("");
  const [csvBusy, setCsvBusy] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode>("merge");
  const [validateResult, setValidateResult] = useState<{
    valid: boolean;
    errors: string[];
    row_count: number;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchMetricMappings();
      setMappings(res.mappings);
      setMeta({ version: res.version, config_path: res.config_path });
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setFormMode("create");
    setFormInitial({ ...EMPTY_MAPPING_FORM });
    setFormOpen(true);
  };

  const openEdit = (m: MetricMappingItem) => {
    setFormMode("edit");
    setFormInitial(mappingToForm(m));
    setFormOpen(true);
  };

  const onSave = async (body: MetricMappingWriteBody) => {
    setSaving(true);
    setError(null);
    try {
      if (formMode === "create") await createMetricMapping(body);
      else await updateMetricMapping(body.metric_key, body);
      setFormOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (m: MetricMappingItem) => {
    if (!window.confirm(`「${m.label_ja}」(${m.metric_key}) を削除しますか？`)) return;
    try {
      await deleteMetricMapping(m.metric_key);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました");
    }
  };

  const onExport = async () => {
    setCsvBusy(true);
    try {
      const res = await exportMetricMappings();
      setCsvText(res.csv_text);
      setTab("csv");
    } catch (e) {
      setError(e instanceof Error ? e.message : "エクスポートに失敗しました");
    } finally {
      setCsvBusy(false);
    }
  };

  const onReload = async () => {
    setCsvBusy(true);
    try {
      await reloadMetricMappings();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "再読込に失敗しました");
    } finally {
      setCsvBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <p className="text-xs text-slate-400">
            metric_key ↔ 勘定科目 / Auto-Vouch field / 資料スロット（C6）
          </p>
          {meta ? (
            <p className="mt-1 font-mono text-[10px] text-slate-500">
              v{meta.version} · {mappings.length} mappings
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white"
          >
            <Plus className="h-3.5 w-3.5" />
            追加
          </button>
          <button
            type="button"
            onClick={() => void onExport()}
            disabled={csvBusy}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-bold text-slate-200"
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </button>
          <button
            type="button"
            onClick={() => void onReload()}
            className="inline-flex items-center gap-1 rounded-lg border border-amber-600/40 bg-amber-950/40 px-3 py-1.5 text-xs font-bold text-amber-200"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            再読込
          </button>
        </div>
      </div>

      <div className="flex gap-1 rounded-lg border border-slate-700 bg-slate-900/60 p-1">
        <TabBtn active={tab === "list"} onClick={() => setTab("list")}>
          一覧
        </TabBtn>
        <TabBtn active={tab === "csv"} onClick={() => setTab("csv")}>
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
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-900/80">
            <table className="min-w-full text-left text-[11px] text-slate-300">
              <thead className="bg-slate-800/80 text-[10px] font-black uppercase text-slate-500">
                <tr>
                  <th className="border-b border-slate-700 px-3 py-2">指標</th>
                  <th className="border-b border-slate-700 px-3 py-2">metric_key</th>
                  <th className="border-b border-slate-700 px-3 py-2">field_id</th>
                  <th className="border-b border-slate-700 px-3 py-2">科目</th>
                  <th className="border-b border-slate-700 px-3 py-2">スロット</th>
                  <th className="border-b border-slate-700 px-3 py-2">状態</th>
                  <th className="w-16 border-b border-slate-700 px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {mappings.map((m) => (
                  <tr key={m.metric_key} className="hover:bg-slate-800/40">
                    <td className="border-b border-slate-800 px-3 py-2 font-bold text-white">
                      {m.label_ja}
                    </td>
                    <td className="border-b border-slate-800 px-3 py-2 font-mono text-[10px] text-slate-400">
                      {m.metric_key}
                    </td>
                    <td className="border-b border-slate-800 px-3 py-2 font-mono text-[10px]">
                      {m.field_id}
                    </td>
                    <td className="border-b border-slate-800 px-3 py-2">
                      {m.account_code ? `${m.account_code} ${m.account_name}` : m.account_name || "—"}
                    </td>
                    <td className="border-b border-slate-800 px-3 py-2 font-mono text-[10px]">
                      {m.slot_id || "—"}
                    </td>
                    <td className="border-b border-slate-800 px-3 py-2">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusTone(m.status)}`}
                      >
                        {statusLabel(m.status)}
                      </span>
                    </td>
                    <td className="border-b border-slate-800 px-2 py-2">
                      <div className="flex gap-1">
                        <button type="button" onClick={() => openEdit(m)} className="text-slate-500 hover:text-amber-300">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void onDelete(m)}
                          className="text-slate-500 hover:text-red-300"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
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
            className="min-h-[240px] w-full rounded-lg border border-slate-600 bg-slate-950 p-3 font-mono text-[10px] text-slate-200"
            value={csvText}
            onChange={(e) => {
              setCsvText(e.target.value);
              setValidateResult(null);
            }}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={csvBusy || !csvText.trim()}
              onClick={async () => {
                setCsvBusy(true);
                try {
                  setValidateResult(await validateMetricMappingsCsv(csvText));
                } finally {
                  setCsvBusy(false);
                }
              }}
              className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-bold text-slate-200"
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
              onClick={async () => {
                setCsvBusy(true);
                try {
                  await importMetricMappingsCsv(csvText, importMode);
                  await load();
                  setTab("list");
                } catch (e) {
                  setError(e instanceof Error ? e.message : "インポート失敗");
                } finally {
                  setCsvBusy(false);
                }
              }}
              className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white"
            >
              インポート
            </button>
          </div>
          {validateResult ? (
            <p className={`text-xs ${validateResult.valid ? "text-emerald-300" : "text-red-300"}`}>
              {validateResult.valid
                ? `OK — ${validateResult.row_count} rows`
                : validateResult.errors.join("; ")}
            </p>
          ) : null}
        </div>
      ) : null}

      <MetricMappingFormModal
        open={formOpen}
        mode={formMode}
        initial={formInitial}
        saving={saving}
        onClose={() => setFormOpen(false)}
        onSave={(b) => void onSave(b)}
      />
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
        active ? "bg-amber-600 text-white" : "text-slate-400"
      }`}
    >
      {children}
    </button>
  );
}
