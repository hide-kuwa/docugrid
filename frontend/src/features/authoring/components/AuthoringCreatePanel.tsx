"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, X } from "lucide-react";

import {
  downloadRenderedText,
  listAuthoringTemplates,
  renderAuthoringTemplate,
} from "@/features/authoring/api";
import type { AuthoringTemplate } from "@/features/authoring/types";
import {
  isBuiltinVariable,
  labelForVariable,
} from "@/features/authoring/types";

type Props = {
  clientId: string;
  clientName: string;
};

export function AuthoringCreatePanel({ clientId, clientName }: Props) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<AuthoringTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState("");
  const [missing, setMissing] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selected = useMemo(
    () => templates.find((t) => t.id === selectedId) ?? null,
    [templates, selectedId],
  );

  const manualVariables = useMemo(() => {
    if (!selected) return [];
    return (selected.variables ?? []).filter((v) => !isBuiltinVariable(v));
  }, [selected]);

  const loadTemplates = useCallback(async () => {
    try {
      const data = await listAuthoringTemplates(clientId);
      const merged = [...data.global, ...data.local];
      setTemplates(merged);
      if (merged.length > 0 && !selectedId) {
        setSelectedId(merged[0]!.id);
      }
    } catch {
      setError("ひな形の読み込みに失敗しました。");
    }
  }, [clientId, selectedId]);

  useEffect(() => {
    if (open) void loadTemplates();
  }, [open, loadTemplates]);

  useEffect(() => {
    setValues({});
    setPreview("");
    setMissing([]);
  }, [selectedId]);

  const handleRender = async () => {
    if (!selectedId) return;
    setLoading(true);
    setError("");
    try {
      const result = await renderAuthoringTemplate(selectedId, clientId, values);
      setPreview(result.renderedBody);
      setMissing(result.missingVariables);
    } catch {
      setError("文書の生成に失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!preview || !selected) return;
    const safeName = `${clientName}_${selected.title}.txt`.replace(/[\\/:*?"<>|]+/g, "_");
    downloadRenderedText(safeName, preview);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50"
      >
        <FileText className="h-4 w-4" />
        文書作成
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-800">文書作成（ひな形）</h3>
          <p className="text-[11px] text-slate-500">顧問先: {clientName}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
          aria-label="閉じる"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <label className="block text-xs text-slate-600">
        ひな形
        <select
          className="mt-1 block w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.scope === "global" ? "【公式】" : "【独自】"}
              {t.title}
            </option>
          ))}
        </select>
      </label>

      {manualVariables.length > 0 && (
        <div className="mt-3 space-y-2">
          {manualVariables.map((name) => (
            <label key={name} className="block text-xs text-slate-600">
              {labelForVariable(name)}
              <input
                className="mt-1 block w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
                value={values[name] ?? ""}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [name]: e.target.value }))
                }
              />
            </label>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={loading || !selectedId}
          onClick={() => void handleRender()}
          className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? "生成中…" : "プレビュー生成"}
        </button>
        {preview && (
          <button
            type="button"
            onClick={handleDownload}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            テキストをダウンロード
          </button>
        )}
      </div>

      {missing.length > 0 && (
        <p className="mt-2 text-[11px] text-amber-700">
          未入力の変数: {missing.map((v) => labelForVariable(v)).join("、")}
        </p>
      )}
      {error && <p className="mt-2 text-[11px] text-red-600">{error}</p>}

      {preview && (
        <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-700">
          {preview}
        </pre>
      )}
    </div>
  );
}
