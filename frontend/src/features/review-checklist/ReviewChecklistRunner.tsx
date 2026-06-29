"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileDown, Loader2, Save } from "lucide-react";
import {
  exportReviewChecklistPdf,
  fetchReviewChecklistBundle,
  fetchReviewChecklistCatalog,
  fetchReviewChecklistPrefill,
  saveReviewChecklistInstance,
  type ReviewChecklistCatalog,
} from "@/features/review-checklist/review-checklist-api";
import {
  STATUS_OPTIONS,
  WORKFLOW_LABELS,
  type ReviewChecklistInstance,
  type ReviewChecklistItemState,
  type ReviewChecklistSection,
  type ReviewChecklistTemplate,
} from "@/features/review-checklist/schema";
import {
  canEditReviewChecklist,
  canManageReviewChecklistWorkflow,
} from "@/features/review-checklist/permissions";
import type { DocugridUser } from "@/lib/auth";

type Props = {
  clientId: string;
  periodKey: string;
  templateId?: string;
  onTemplateIdChange?: (templateId: string) => void;
  clientName?: string;
  user: DocugridUser | null;
  compact?: boolean;
};

export function ReviewChecklistRunner({
  clientId,
  periodKey,
  templateId,
  onTemplateIdChange,
  clientName,
  user,
  compact = false,
}: Props) {
  const canEdit = canEditReviewChecklist(user);
  const canManageWorkflow = canManageReviewChecklistWorkflow(user);
  const [catalog, setCatalog] = useState<ReviewChecklistCatalog | null>(null);
  const [activeTemplateId, setActiveTemplateId] = useState(templateId ?? "");
  const [template, setTemplate] = useState<ReviewChecklistTemplate | null>(null);
  const [instance, setInstance] = useState<ReviewChecklistInstance | null>(null);
  const [header, setHeader] = useState<Record<string, string>>({});
  const [itemStates, setItemStates] = useState<Record<string, ReviewChecklistItemState>>({});
  const [workflowStatus, setWorkflowStatus] = useState("draft");
  const [circulationMemo, setCirculationMemo] = useState("");
  const [activeSectionId, setActiveSectionId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setActiveSectionId("");
  }, [clientId, periodKey, activeTemplateId]);

  useEffect(() => {
    if (templateId) setActiveTemplateId(templateId);
  }, [templateId]);

  useEffect(() => {
    void fetchReviewChecklistCatalog()
      .then((data) => {
        setCatalog(data);
        if (!activeTemplateId) {
          const id = templateId ?? data.defaultTemplateId;
          setActiveTemplateId(id);
        }
      })
      .catch(() => undefined);
  }, [activeTemplateId, templateId]);

  const reload = useCallback(async () => {
    if (!clientId || !periodKey || !activeTemplateId) return;
    setLoading(true);
    setError(null);
    try {
      const bundle = await fetchReviewChecklistBundle(clientId, periodKey, activeTemplateId);
      setTemplate(bundle.template);
      setInstance(bundle.instance);
      let nextHeader = bundle.instance.header ?? {};
      if (!Object.values(nextHeader).some(Boolean)) {
        const prefill = await fetchReviewChecklistPrefill(clientId, periodKey);
        nextHeader = { ...prefill, ...nextHeader };
      }
      setHeader(nextHeader);
      setItemStates(bundle.instance.itemStates ?? {});
      setWorkflowStatus(bundle.instance.workflowStatus || "draft");
      setCirculationMemo(bundle.instance.circulationMemo || "");
      const sections = bundle.template.sections ?? [];
      if (sections.length) {
        setActiveSectionId(sections[0].id);
      }
    } catch {
      setError("チェックリストの読み込みに失敗しました。");
    } finally {
      setLoading(false);
    }
  }, [activeTemplateId, clientId, periodKey]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const sections = template?.sections ?? [];
  const activeSection = sections.find((s) => s.id === activeSectionId) ?? sections[0];

  const progress = instance?.progress ?? { total: 0, checked: 0 };

  const updateItem = (itemId: string, patch: Partial<ReviewChecklistItemState>) => {
    setItemStates((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], ...patch },
    }));
  };

  const handleSave = async (nextWorkflow?: string) => {
    if (!canEdit) return;
    setSaving(true);
    setMessage("");
    try {
      const saved = await saveReviewChecklistInstance({
        client_id: clientId,
        period_key: periodKey,
        template_id: activeTemplateId,
        header,
        itemStates: itemStates as Record<string, Record<string, string>>,
        workflowStatus: nextWorkflow ?? workflowStatus,
        circulationMemo,
      });
      setInstance(saved);
      setWorkflowStatus(saved.workflowStatus);
      setMessage("保存しました。");
    } catch {
      setError("保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  };

  const handleExportPdf = async () => {
    if (!canManageWorkflow) return;
    setExporting(true);
    setMessage("");
    try {
      await handleSave(workflowStatus === "draft" ? "in_circulation" : workflowStatus);
      const blob = await exportReviewChecklistPdf(clientId, periodKey, activeTemplateId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `checklist-${clientName || clientId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage("PDF を出力しました。");
    } catch {
      setError("PDF 出力に失敗しました。");
    } finally {
      setExporting(false);
    }
  };

  const sectionProgress = useMemo(() => {
    if (!activeSection) return { done: 0, total: 0 };
    const questions = activeSection.items.filter(
      (i) => i.kind === "question" || i.kind === "adjustment_point",
    );
    const done = questions.filter((q) => {
      const st = itemStates[q.id];
      if (q.kind === "adjustment_point") {
        return Boolean(st?.result?.trim() || st?.label?.trim());
      }
      return st?.status && st.status !== "pending";
    }).length;
    return { done, total: questions.length };
  }, [activeSection, itemStates]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        読み込み中…
      </div>
    );
  }

  if (error && !template) {
    return <p className="py-4 text-sm text-red-600">{error}</p>;
  }

  if (instance && !instance.applicable) {
    return <p className="text-sm text-slate-500">この期間にはチェックリストは適用されません。</p>;
  }

  return (
    <div className="space-y-4">
      {catalog && catalog.templates.length > 1 && (
        <label className="block text-xs">
          <span className="font-bold text-slate-600">チェックリスト種類</span>
          <select
            value={activeTemplateId}
            onChange={(e) => {
              setActiveTemplateId(e.target.value);
              onTemplateIdChange?.(e.target.value);
            }}
            className="mt-1 w-full max-w-md rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold"
          >
            {catalog.templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
                {t.scope === "global" ? "（公式）" : ""}
              </option>
            ))}
          </select>
        </label>
      )}

      {!compact && template && (
        <header className="space-y-1">
          <h2 className="text-base font-bold text-slate-800">{template.title}</h2>
          <p className="text-xs text-slate-500">{template.description}</p>
        </header>
      )}

      <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-3">
        <p className="text-xs font-bold text-slate-500">
          {canManageWorkflow ? "ヘッダ（マスタから自動入力・編集可）" : "基本情報"}
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {(template?.headerFields ?? []).map((field) => (
            <label key={field.id} className="block text-xs">
              <span className="font-bold text-slate-600">{field.label}</span>
              <input
                value={header[field.id] ?? ""}
                disabled={!canEdit}
                placeholder={field.placeholder}
                onChange={(e) => setHeader((h) => ({ ...h, [field.id]: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </label>
          ))}
        </div>
        {canManageWorkflow && (
          <label className="block text-xs">
            <span className="font-bold text-slate-600">所内回覧メモ</span>
            <textarea
              value={circulationMemo}
              disabled={!canEdit}
              onChange={(e) => setCirculationMemo(e.target.value)}
              rows={2}
              placeholder="回覧時の連絡事項など"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            />
          </label>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => setActiveSectionId(section.id)}
              className={`rounded-lg px-2.5 py-1 text-xs font-bold ${
                activeSection?.id === section.id
                  ? "bg-violet-600 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {section.sheetLabel || section.title}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          全体 {progress.checked}/{progress.total}
          {activeSection ? ` · このシート ${sectionProgress.done}/${sectionProgress.total}` : ""}
        </p>
      </div>

      {activeSection && (
        <SectionTable
          section={activeSection}
          itemStates={itemStates}
          canEdit={canEdit}
          onUpdate={updateItem}
        />
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
        {canManageWorkflow && (
          <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
            ステータス
            <select
              value={workflowStatus}
              disabled={!canEdit}
              onChange={(e) => setWorkflowStatus(e.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-normal"
            >
              {Object.entries(WORKFLOW_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}
        {canEdit && (
          <>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              保存
            </button>
            {canManageWorkflow && (
              <>
                <button
                  type="button"
                  disabled={exporting}
                  onClick={() => void handleExportPdf()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  {exporting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FileDown className="h-3.5 w-3.5" />
                  )}
                  PDF 出力（所内資料）
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSave("completed")}
                  className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
                >
                  完了にする
                </button>
              </>
            )}
          </>
        )}
        {!canEdit && (
          <p className="text-xs text-slate-500">閲覧のみ（編集権限がありません）</p>
        )}
        {message && <span className="text-xs text-emerald-700">{message}</span>}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  );
}

function SectionTable({
  section,
  itemStates,
  canEdit,
  onUpdate,
}: {
  section: ReviewChecklistSection;
  itemStates: Record<string, ReviewChecklistItemState>;
  canEdit: boolean;
  onUpdate: (id: string, patch: Partial<ReviewChecklistItemState>) => void;
}) {
  if (section.kind === "adjustments") {
    return (
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100 text-left text-xs font-bold text-slate-600">
            <tr>
              <th className="w-12 px-2 py-2">No.</th>
              <th className="px-2 py-2">Point．</th>
              <th className="px-2 py-2">Result．</th>
            </tr>
          </thead>
          <tbody>
            {section.items.map((item) => {
              const st = itemStates[item.id] ?? {};
              return (
                <tr key={item.id} className="border-t border-slate-100">
                  <td className="px-2 py-2 align-top font-mono text-xs">{item.number}</td>
                  <td className="px-2 py-2">
                    <input
                      disabled={!canEdit}
                      value={st.label ?? item.label ?? ""}
                      onChange={(e) => onUpdate(item.id, { label: e.target.value })}
                      placeholder="要調事項"
                      className="w-full rounded border border-slate-200 px-2 py-1 text-sm"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      disabled={!canEdit}
                      value={st.result ?? ""}
                      onChange={(e) => onUpdate(item.id, { result: e.target.value })}
                      placeholder="結果・対応"
                      className="w-full rounded border border-slate-200 px-2 py-1 text-sm"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-100 text-left text-xs font-bold text-slate-600">
          <tr>
            <th className="w-10 px-2 py-2">No.</th>
            <th className="min-w-[14rem] px-2 py-2">確認事項</th>
            <th className="w-24 px-2 py-2">確認済</th>
            <th className="min-w-[8rem] px-2 py-2">確認資料</th>
            <th className="min-w-[10rem] px-2 py-2">チェック者コメント</th>
            <th className="min-w-[8rem] px-2 py-2">回答</th>
          </tr>
        </thead>
        <tbody>
          {section.items.map((item) => {
            if (item.kind === "group_header") {
              return (
                <tr key={item.id} className="bg-violet-50/60">
                  <td colSpan={6} className="px-3 py-2 text-xs font-bold text-violet-900">
                    {item.label}
                  </td>
                </tr>
              );
            }
            if (item.kind !== "question") return null;
            const st = itemStates[item.id] ?? {};
            const indent = item.indent ? "pl-4" : "";
            return (
              <tr key={item.id} className="border-t border-slate-100 align-top">
                <td className="px-2 py-2 font-mono text-xs text-slate-500">{item.number}</td>
                <td className={`px-2 py-2 text-slate-800 ${indent}`}>
                  <span className="whitespace-pre-wrap text-sm">{item.label}</span>
                </td>
                <td className="px-2 py-2">
                  <select
                    disabled={!canEdit}
                    value={st.status ?? "pending"}
                    onChange={(e) => onUpdate(item.id, { status: e.target.value })}
                    className="w-full rounded border border-slate-200 px-1 py-1 text-sm"
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-2">
                  <input
                    disabled={!canEdit}
                    value={st.reference ?? ""}
                    onChange={(e) => onUpdate(item.id, { reference: e.target.value })}
                    className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                  />
                </td>
                <td className="px-2 py-2">
                  <textarea
                    disabled={!canEdit}
                    value={st.comment ?? ""}
                    onChange={(e) => onUpdate(item.id, { comment: e.target.value })}
                    rows={2}
                    className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    disabled={!canEdit}
                    value={st.answer ?? ""}
                    onChange={(e) => onUpdate(item.id, { answer: e.target.value })}
                    className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
