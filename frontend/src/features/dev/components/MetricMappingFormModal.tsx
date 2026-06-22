"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import type { MetricMappingWriteBody } from "@/lib/metric-mappings-api";

const inputClass =
  "w-full rounded-lg border border-slate-600 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-100 focus:border-amber-500 focus:outline-none";

type Props = {
  open: boolean;
  mode: "create" | "edit";
  initial: MetricMappingWriteBody;
  saving: boolean;
  onClose: () => void;
  onSave: (body: MetricMappingWriteBody) => void;
};

export function MetricMappingFormModal({
  open,
  mode,
  initial,
  saving,
  onClose,
  onSave,
}: Props) {
  const [form, setForm] = useState(initial);
  useEffect(() => {
    if (open) setForm(initial);
  }, [open, initial]);

  if (!open) return null;

  const set = <K extends keyof MetricMappingWriteBody>(k: K, v: MetricMappingWriteBody[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
          <h2 className="text-sm font-bold text-white">
            {mode === "create" ? "指標マップを追加" : "指標マップを編集"}
          </h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form
          className="space-y-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSave(form);
          }}
        >
          <Field label="metric_key" required>
            <input
              className={inputClass}
              value={form.metric_key}
              disabled={mode === "edit"}
              onChange={(e) => set("metric_key", e.target.value)}
              required
            />
          </Field>
          <Field label="名称 (label_ja)" required>
            <input
              className={inputClass}
              value={form.label_ja}
              onChange={(e) => set("label_ja", e.target.value)}
              required
            />
          </Field>
          <Field label="field_id (Auto-Vouch)" required>
            <input
              className={inputClass}
              value={form.field_id}
              placeholder="acct.revenue"
              onChange={(e) => set("field_id", e.target.value)}
              required
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="科目コード">
              <input
                className={inputClass}
                value={form.account_code ?? ""}
                onChange={(e) => set("account_code", e.target.value)}
              />
            </Field>
            <Field label="科目名">
              <input
                className={inputClass}
                value={form.account_name ?? ""}
                onChange={(e) => set("account_name", e.target.value)}
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="slot_id">
              <input
                className={inputClass}
                value={form.slot_id ?? ""}
                onChange={(e) => set("slot_id", e.target.value)}
              />
            </Field>
            <Field label="period_key">
              <input
                className={inputClass}
                value={form.period_key ?? ""}
                placeholder="month:1"
                onChange={(e) => set("period_key", e.target.value)}
              />
            </Field>
          </div>
          <Field label="資料ラベル">
            <input
              className={inputClass}
              value={form.document_label ?? ""}
              onChange={(e) => set("document_label", e.target.value)}
            />
          </Field>
          <Field label="状態">
            <select
              className={inputClass}
              value={form.status ?? "planned"}
              onChange={(e) =>
                set("status", e.target.value as MetricMappingWriteBody["status"])
              }
            >
              <option value="planned">planned</option>
              <option value="active">active</option>
              <option value="deprecated">deprecated</option>
            </select>
          </Field>
          <Field label="notes">
            <textarea
              className={`${inputClass} min-h-[3rem]`}
              value={form.notes ?? ""}
              onChange={(e) => set("notes", e.target.value)}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-bold text-slate-300"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold text-slate-500">
        {label}
        {required ? <span className="text-amber-400"> *</span> : null}
      </span>
      {children}
    </label>
  );
}
