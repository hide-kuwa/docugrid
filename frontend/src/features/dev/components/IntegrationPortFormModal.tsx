"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import {
  EMPTY_PORT_FORM,
  type IntegrationPortWriteBody,
} from "@/lib/integration-ports-api";

type Props = {
  open: boolean;
  mode: "create" | "edit";
  initial: IntegrationPortWriteBody;
  saving: boolean;
  onClose: () => void;
  onSave: (body: IntegrationPortWriteBody) => void;
};

const inputClass =
  "w-full rounded-lg border border-slate-600 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none";

export function IntegrationPortFormModal({
  open,
  mode,
  initial,
  saving,
  onClose,
  onSave,
}: Props) {
  const [form, setForm] = useState<IntegrationPortWriteBody>(initial);

  useEffect(() => {
    if (open) setForm(initial);
  }, [open, initial]);

  if (!open) return null;

  const set = <K extends keyof IntegrationPortWriteBody>(
    key: K,
    value: IntegrationPortWriteBody[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="port-form-title"
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-700 bg-slate-900 px-4 py-3">
          <h2 id="port-form-title" className="text-sm font-bold text-white">
            {mode === "create" ? "ポートを追加" : "ポートを編集"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:text-white"
            aria-label="閉じる"
          >
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
          <Field label="port_id" required>
            <input
              className={inputClass}
              value={form.port_id}
              disabled={mode === "edit"}
              placeholder="docugrid.metrics.example"
              onChange={(e) => set("port_id", e.target.value)}
              required
            />
          </Field>
          <Field label="連携名 (label_ja)" required>
            <input
              className={inputClass}
              value={form.label_ja}
              onChange={(e) => set("label_ja", e.target.value)}
              required
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="SSOT 所有者 (ssot_owner)">
              <input
                className={inputClass}
                value={form.ssot_owner ?? ""}
                placeholder="docugrid / tax-accounting"
                onChange={(e) => set("ssot_owner", e.target.value)}
              />
            </Field>
            <Field label="SSOT 表示名">
              <input
                className={inputClass}
                value={form.ssot_owner_label ?? ""}
                onChange={(e) => set("ssot_owner_label", e.target.value)}
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="手入力方針">
              <select
                className={inputClass}
                value={form.manual_policy ?? ""}
                onChange={(e) => set("manual_policy", e.target.value || null)}
              >
                <option value="">—</option>
                <option value="ssot_only">ssot_only</option>
                <option value="staging_only">staging_only</option>
                <option value="forbidden">forbidden</option>
              </select>
            </Field>
            <Field label="手入力ラベル">
              <input
                className={inputClass}
                value={form.manual_policy_label ?? ""}
                onChange={(e) => set("manual_policy_label", e.target.value)}
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="方向">
              <select
                className={inputClass}
                value={form.direction ?? ""}
                onChange={(e) => set("direction", e.target.value || null)}
              >
                <option value="">—</option>
                <option value="ingress">ingress</option>
                <option value="egress">egress</option>
              </select>
            </Field>
            <Field label="状態">
              <select
                className={inputClass}
                value={form.status ?? "planned"}
                onChange={(e) =>
                  set("status", e.target.value as IntegrationPortWriteBody["status"])
                }
              >
                <option value="planned">planned</option>
                <option value="active">active</option>
                <option value="deprecated">deprecated</option>
              </select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="source">
              <input
                className={inputClass}
                value={form.source ?? ""}
                onChange={(e) => set("source", e.target.value)}
              />
            </Field>
            <Field label="target">
              <input
                className={inputClass}
                value={form.target ?? ""}
                onChange={(e) => set("target", e.target.value)}
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="api_method">
              <input
                className={inputClass}
                value={form.api_method ?? ""}
                placeholder="POST / GET / INTERNAL"
                onChange={(e) => set("api_method", e.target.value)}
              />
            </Field>
            <Field label="api_path">
              <input
                className={inputClass}
                value={form.api_path ?? ""}
                onChange={(e) => set("api_path", e.target.value)}
              />
            </Field>
          </div>
          <Field label="idempotency_key_template">
            <input
              className={inputClass}
              value={form.idempotency_key_template ?? ""}
              onChange={(e) => set("idempotency_key_template", e.target.value)}
            />
          </Field>
          <Field label="notes">
            <textarea
              className={`${inputClass} min-h-[4rem]`}
              value={form.notes ?? ""}
              onChange={(e) => set("notes", e.target.value)}
            />
          </Field>

          <div className="flex justify-end gap-2 border-t border-slate-800 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-800"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-500 disabled:opacity-50"
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
