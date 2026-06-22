"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Loader2, Search, X } from "lucide-react";
import { AuthoringPageEditor } from "@/features/authoring/components/AuthoringPageEditor";
import {
  exportAuthoringPdf,
  listAuthoringTemplates,
  renderAuthoringTemplate,
} from "@/features/authoring/api";
import { targetSlotLabelForTemplate } from "@/features/authoring/lib/authoring-slot-target";
import { resolveAuthoringSlot } from "@/features/authoring/lib/resolve-slot";
import type { AuthoringTemplate } from "@/features/authoring/types";
import { isBuiltinVariable, labelForVariable } from "@/features/authoring/types";
import type { SlotLayout } from "@/lib/slot-layout-storage";

type Props = {
  open: boolean;
  onClose: () => void;
  clientId: string;
  clientName: string;
  slotLabels: string[];
  displayOrder: number[];
  onApplySlotLayout: (layout: SlotLayout) => void;
  onSaveToSlot: (
    file: File,
    slotIndex: number,
    slotLabel: string,
  ) => Promise<{ persisted: boolean }>;
};

type Step = "pick" | "edit";

export function AuthoringWizardModal({
  open,
  onClose,
  clientId,
  clientName,
  slotLabels,
  displayOrder,
  onApplySlotLayout,
  onSaveToSlot,
}: Props) {
  const [step, setStep] = useState<Step>("pick");
  const [templates, setTemplates] = useState<AuthoringTemplate[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AuthoringTemplate | null>(null);
  const [editorText, setEditorText] = useState("");
  const [slotIndex, setSlotIndex] = useState(0);
  const [saveSlotLabel, setSaveSlotLabel] = useState("");
  const [slotLocked, setSlotLocked] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q),
    );
  }, [templates, query]);

  const reset = useCallback(() => {
    setStep("pick");
    setQuery("");
    setSelected(null);
    setEditorText("");
    setSlotIndex(0);
    setSaveSlotLabel("");
    setSlotLocked(false);
    setMissing([]);
    setError("");
    setMessage("");
  }, []);

  useEffect(() => {
    if (!open) {
      reset();
      return;
    }
    void (async () => {
      try {
        const data = await listAuthoringTemplates(clientId);
        setTemplates([...data.global, ...data.local]);
      } catch {
        setError("ひな形の読み込みに失敗しました。");
      }
    })();
  }, [open, clientId, reset]);

  const applySlotTarget = useCallback(
    (
      template: AuthoringTemplate,
      renderTargetSlotLabel?: string,
    ) => {
      const target = targetSlotLabelForTemplate(template, renderTargetSlotLabel);
      const slot = resolveAuthoringSlot(
        template,
        slotLabels,
        displayOrder,
        renderTargetSlotLabel,
      );
      if (slot.layout) {
        onApplySlotLayout(slot.layout);
      }
      setSlotIndex(slot.slotIndex);
      setSaveSlotLabel(slot.slotLabel);
      setSlotLocked(Boolean(target));
    },
    [slotLabels, displayOrder, onApplySlotLayout],
  );

  const loadTemplate = async (template: AuthoringTemplate) => {
    setLoading(true);
    setError("");
    setSelected(template);
    try {
      const result = await renderAuthoringTemplate(template.id, clientId, {});
      setEditorText(result.renderedBody);
      setMissing(result.missingVariables);
      applySlotTarget(template, result.targetSlotLabel);
      setStep("edit");
    } catch {
      setError("ひな形の読み込みに失敗しました。");
      setSelected(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selected || !editorText.trim()) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const title = selected.title.replace(/（.+）/, "").trim();
      const blob = await exportAuthoringPdf({
        clientId,
        title: "",
        body: editorText,
      });
      const safeName = `${clientName}_${title}.pdf`.replace(/[\\/:*?"<>|]+/g, "_");
      const file = new File([blob], safeName, { type: "application/pdf" });

      const label =
        saveSlotLabel ||
        slotLabels[slotIndex] ||
        `枠 ${slotIndex + 1}`;
      const { persisted } = await onSaveToSlot(file, slotIndex, label);
      setMessage(
        persisted
          ? `「${label}」に PDF を保存しました。`
          : `PDF を生成しましたが、サーバー保存に失敗しました（ローカルのみ）。`,
      );
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch {
      setError("PDF の生成または保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  };

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-2 backdrop-blur-sm md:p-4">
      <div className="flex max-h-[96vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <h2 className="text-sm font-black text-slate-800">文書作成</h2>
            <p className="text-[11px] text-slate-500">{clientName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
            aria-label="閉じる"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {step === "pick" && (
          <div className="flex min-h-0 flex-1 flex-col p-5">
            <p className="text-xs text-slate-600">作成する文書の種類を選んでください（検索可）</p>
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="議事録、契約書…"
                className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm"
                autoFocus
              />
            </div>
            <ul className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto">
              {filtered.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void loadTemplate(t)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-left transition-colors hover:border-indigo-300 hover:bg-indigo-50/50 disabled:opacity-50"
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-indigo-500" />
                      <span className="text-sm font-bold text-slate-800">
                        {t.scope === "global" ? "【公式】" : "【独自】"}
                        {t.title}
                      </span>
                    </div>
                    {t.description && (
                      <p className="mt-1 pl-6 text-[11px] text-slate-500">{t.description}</p>
                    )}
                  </button>
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="py-8 text-center text-sm text-slate-400">該当するひな形がありません</li>
              )}
            </ul>
            {loading && (
              <p className="mt-2 flex items-center justify-center gap-2 text-xs text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                基本情報を読み込み中…
              </p>
            )}
          </div>
        )}

        {step === "edit" && selected && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-800">{selected.title}</h3>
              <button
                type="button"
                onClick={() => setStep("pick")}
                className="text-[11px] font-bold text-indigo-600 hover:underline"
              >
                ひな形を選び直す
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              顧客マスタ・顧客詳細から基本情報を自動入力済みです。A4 の完成イメージのまま編集できます。
            </p>
            {missing.length > 0 && (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                未入力の項目: {missing.map((v) => labelForVariable(v)).join("、")}
                {!isBuiltinVariable(missing[0] ?? "") && " — 本文内で直接追記してください"}
              </p>
            )}
            <AuthoringPageEditor value={editorText} onChange={setEditorText} />
            <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4">
              <div className="text-xs text-slate-600">
                保存先の枠
                {slotLocked ? (
                  <p className="mt-1 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-sm font-bold text-indigo-900">
                    {saveSlotLabel}
                    <span className="ml-2 text-[10px] font-normal text-indigo-600">
                      自動
                    </span>
                  </p>
                ) : (
                  <select
                    className="mt-1 block min-w-[12rem] rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                    value={slotIndex}
                    onChange={(e) => {
                      const idx = Number(e.target.value);
                      setSlotIndex(idx);
                      setSaveSlotLabel(slotLabels[idx] ?? `枠 ${idx + 1}`);
                    }}
                  >
                    {slotLabels.map((label, idx) => (
                      <option key={`${label}-${idx}`} value={idx}>
                        {label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="ml-auto flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  disabled={saving || !editorText.trim()}
                  onClick={() => void handleSave()}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? "PDF 化・保存中…" : "PDF 化して枠に保存"}
                </button>
              </div>
            </div>
          </div>
        )}

        {(error || message) && (
          <div className="border-t border-slate-100 px-5 py-2">
            {error && <p className="text-xs font-bold text-red-600">{error}</p>}
            {message && <p className="text-xs font-bold text-emerald-700">{message}</p>}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** 枠を編集の横に置く起動ボタン */
export function AuthoringWizardTrigger({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="shrink-0 flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-800 shadow-sm hover:bg-indigo-100 disabled:opacity-50"
    >
      <FileText className="h-3.5 w-3.5" />
      文書作成
    </button>
  );
}
