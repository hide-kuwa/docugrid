"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Download,
  FileSearch,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { FormCatalogLearnPanel } from "@/features/dev/components/FormCatalogLearnPanel";
import { DocumentMasterPanel } from "@/features/dev/components/DocumentMasterPanel";
import { DocumentTypesPanel } from "@/features/dev/components/DocumentTypesPanel";
import { DocumentCategoriesPanel } from "@/features/dev/components/DocumentCategoriesPanel";
import {
  createFormCatalogEntry,
  deleteFormCatalogEntry,
  EMPTY_FORM,
  exportFormCatalogYaml,
  fetchFormCatalog,
  formToWriteBody,
  importFormCatalogYaml,
  reloadFormCatalog,
  scanFormCatalogPdf,
  updateFormCatalogEntry,
  type FormCatalogForm,
  type FormCatalogListResponse,
  type FormCatalogScanResult,
  type FormCatalogWriteBody,
} from "@/lib/form-catalog-api";

type Tab = "types" | "categories" | "forms" | "learn" | "test" | "advanced";
type LoadState = "loading" | "ready" | "error";

function roleBadge(role: string) {
  if (role === "skip") return "bg-slate-200 text-slate-700";
  return "bg-violet-100 text-violet-800";
}

function AdvancedFormCatalogPanel({
  data,
  onReload,
  error,
  setError,
}: {
  data: FormCatalogListResponse | null;
  onReload: () => Promise<void>;
  error: string | null;
  setError: (v: string | null) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [formInitial, setFormInitial] = useState<FormCatalogWriteBody>(EMPTY_FORM);
  const [editFormId, setEditFormId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [yamlText, setYamlText] = useState("");
  const [yamlBusy, setYamlBusy] = useState(false);

  const onReloadClick = async () => {
    setReloading(true);
    setError(null);
    try {
      await reloadFormCatalog();
      await onReload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "再読込に失敗しました");
    } finally {
      setReloading(false);
    }
  };

  const openCreate = () => {
    setFormMode("create");
    setEditFormId(null);
    setFormInitial({ ...EMPTY_FORM, anchors: [{ region: "top_right", any_of: [""] }] });
    setFormOpen(true);
  };

  const openEdit = (form: FormCatalogForm) => {
    setFormMode("edit");
    setEditFormId(form.form_id);
    setFormInitial(formToWriteBody(form));
    setFormOpen(true);
  };

  const onSaveForm = async () => {
    const body: FormCatalogWriteBody = {
      ...formInitial,
      form_id: formInitial.form_id.trim(),
      label_ja: formInitial.label_ja.trim(),
      anchors: (formInitial.anchors ?? [])
        .map((a) => ({
          region: a.region || "any",
          any_of: (a.any_of ?? []).map((s) => s.trim()).filter(Boolean),
        }))
        .filter((a) => a.any_of.length > 0),
      must_not: (formInitial.must_not ?? []).map((s) => s.trim()).filter(Boolean),
      filename_hints: (formInitial.filename_hints ?? []).map((s) => s.trim()).filter(Boolean),
    };
    if (!body.form_id || !body.label_ja) {
      setError("form_id と label_ja は必須です");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (formMode === "create") await createFormCatalogEntry(body);
      else if (editFormId) await updateFormCatalogEntry(editFormId, body);
      setFormOpen(false);
      await onReload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        エンジニア向け: YAML / form_id による直接編集。通常は「参考資料で覚える」タブを使ってください。
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void onReloadClick()}
          disabled={reloading}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${reloading ? "animate-spin" : ""}`} />
          再読込
        </button>
        <button
          type="button"
          onClick={async () => {
            setYamlBusy(true);
            try {
              const res = await exportFormCatalogYaml();
              setYamlText(res.yaml_text);
            } catch (e) {
              setError(e instanceof Error ? e.message : "エクスポートに失敗");
            } finally {
              setYamlBusy(false);
            }
          }}
          disabled={yamlBusy}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-800"
        >
          <Download className="h-3.5 w-3.5" />
          YAML エクスポート
        </button>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1 rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-600"
        >
          <Plus className="h-3.5 w-3.5" />
          様式追加
        </button>
      </div>

      {data ? (
        <ul className="space-y-2">
          {data.forms.map((form) => {
            const open = expandedId === form.form_id;
            return (
              <li key={form.form_id} className="rounded-xl border border-slate-700 bg-slate-900/80">
                <div className="flex items-start gap-2 p-4">
                  <button
                    type="button"
                    onClick={() => setExpandedId(open ? null : form.form_id)}
                    className="mt-0.5 text-slate-400 hover:text-white"
                  >
                    {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-white">{form.label_ja}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-slate-500">{form.form_id}</p>
                  </div>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => openEdit(form)} className="rounded p-1.5 text-slate-400 hover:text-white">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!window.confirm(`削除: ${form.label_ja}?`)) return;
                        try {
                          await deleteFormCatalogEntry(form.form_id);
                          await onReload();
                        } catch (e) {
                          setError(e instanceof Error ? e.message : "削除失敗");
                        }
                      }}
                      className="rounded p-1.5 text-slate-400 hover:text-red-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {open ? (
                  <div className="border-t border-slate-800 px-4 py-3 text-[11px] text-slate-300">
                    {(form.anchors ?? []).map((a, i) => (
                      <p key={i}>
                        {a.region}: {(a.any_of ?? []).join(" / ")}
                      </p>
                    ))}
                    {form.notes ? <p className="mt-2 text-slate-500">{form.notes}</p> : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      <textarea
        className="h-48 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-slate-200"
        value={yamlText}
        onChange={(e) => setYamlText(e.target.value)}
        placeholder="YAML（エクスポートまたは貼り付け）"
      />
      <button
        type="button"
        disabled={yamlBusy || !yamlText.trim()}
        onClick={async () => {
          setYamlBusy(true);
          try {
            await importFormCatalogYaml(yamlText, "merge");
            await onReload();
          } catch (e) {
            setError(e instanceof Error ? e.message : "インポート失敗");
          } finally {
            setYamlBusy(false);
          }
        }}
        className="rounded-lg bg-slate-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
      >
        YAML マージインポート
      </button>

      {formOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-600 bg-slate-900 p-5">
            <h2 className="text-sm font-bold text-white">{formMode === "create" ? "様式追加" : "編集"}</h2>
            <div className="mt-4 space-y-2 text-xs">
              <input
                className="w-full rounded border border-slate-600 bg-slate-950 px-2 py-1.5 font-mono text-white"
                placeholder="form_id"
                value={formInitial.form_id}
                disabled={formMode === "edit"}
                onChange={(e) => setFormInitial((p) => ({ ...p, form_id: e.target.value }))}
              />
              <input
                className="w-full rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-white"
                placeholder="表示名"
                value={formInitial.label_ja}
                onChange={(e) => setFormInitial((p) => ({ ...p, label_ja: e.target.value }))}
              />
              <input
                className="w-full rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-white"
                placeholder="キーワード（カンマ区切り）"
                value={(formInitial.anchors?.[0]?.any_of ?? []).join(", ")}
                onChange={(e) =>
                  setFormInitial((p) => ({
                    ...p,
                    anchors: [{ region: "any", any_of: e.target.value.split(",").map((s) => s.trim()) }],
                  }))
                }
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setFormOpen(false)} className="rounded border border-slate-600 px-3 py-1.5 text-xs text-slate-300">
                キャンセル
              </button>
              <button type="button" disabled={saving} onClick={() => void onSaveForm()} className="rounded bg-amber-500 px-3 py-1.5 text-xs font-bold text-amber-950">
                保存
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TestScanPanel({
  data,
  error,
  setError,
}: {
  data: FormCatalogListResponse | null;
  error: string | null;
  setError: (v: string | null) => void;
}) {
  const scanInputRef = useRef<HTMLInputElement>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanResult, setScanResult] = useState<FormCatalogScanResult | null>(null);

  const onScanPdf = async (file: File | null) => {
    if (!file) return;
    setScanBusy(true);
    setError(null);
    setScanResult(null);
    try {
      setScanResult(await scanFormCatalogPdf(file, data?.max_scan_pages));
    } catch (e) {
      setError(e instanceof Error ? e.message : "スキャンに失敗しました");
    } finally {
      setScanBusy(false);
    }
  };

  return (
    <div className="space-y-4 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
      <p className="text-xs text-slate-400">
        学習を反映したあと、実際の束 PDF でページ判定を試します。
      </p>
      <input
        ref={scanInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          void onScanPdf(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={scanBusy}
        onClick={() => scanInputRef.current?.click()}
        className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-xs font-bold text-white hover:bg-violet-500 disabled:opacity-50"
      >
        {scanBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        PDF をテストスキャン
      </button>
      {scanResult ? (
        <div className="space-y-3 text-xs">
          {scanResult.package_forms.map((seg) => (
            <div key={`${seg.form_id}-${seg.start_page}`} className="rounded-lg border border-violet-800/40 bg-violet-950/30 px-3 py-2 text-violet-100">
              <strong>{seg.label_ja ?? seg.form_id}</strong> — p.{seg.start_page}
              {seg.end_page > seg.start_page ? `–${seg.end_page}` : ""}
            </div>
          ))}
          <table className="w-full text-[11px]">
            <tbody>
              {scanResult.pages.map((row) => (
                <tr key={row.page} className="border-b border-slate-800">
                  <td className="py-1 pr-2 text-slate-500">{row.page}</td>
                  <td className="py-1">{row.label_ja ?? "—"}</td>
                  <td className="py-1 text-slate-500">{(row.reasons ?? []).join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <FileSearch className="h-4 w-4" />
          PDF をアップロードして判定結果を確認
        </p>
      )}
    </div>
  );
}

export function FormCatalogPanel() {
  const [tab, setTab] = useState<Tab>("types");
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<FormCatalogListResponse | null>(null);

  const load = useCallback(async () => {
    setLoadState("loading");
    try {
      setData(await fetchFormCatalog());
      setLoadState("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (
    loadState === "loading" &&
    tab !== "learn" &&
    tab !== "types" &&
    tab !== "categories" &&
    tab !== "forms"
  ) {
    return (
      <div className="flex items-center gap-2 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        読み込み中…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-slate-700 pb-2">
        {(
          [
            ["types", "書類種別"],
            ["categories", "カテゴリ（中分類）"],
            ["forms", "様式・AI分類"],
            ["learn", "参考資料で覚える"],
            ["test", "判定テスト"],
            ["advanced", "上級者向け"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
              tab === id ? "bg-indigo-700 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && tab !== "learn" && tab !== "types" && tab !== "categories" && tab !== "forms" ? (
        <p className="rounded-lg border border-red-800/50 bg-red-950/40 px-3 py-2 text-xs text-red-200">{error}</p>
      ) : null}

      {tab === "types" ? <DocumentTypesPanel error={error} setError={setError} /> : null}
      {tab === "categories" ? <DocumentCategoriesPanel error={error} setError={setError} /> : null}
      {tab === "forms" ? (
        <DocumentMasterPanel data={data} onReload={load} error={error} setError={setError} />
      ) : null}
      {tab === "learn" ? <FormCatalogLearnPanel /> : null}
      {tab === "test" ? <TestScanPanel data={data} error={error} setError={setError} /> : null}
      {tab === "advanced" ? (
        <AdvancedFormCatalogPanel data={data} onReload={load} error={error} setError={setError} />
      ) : null}
    </div>
  );
}
