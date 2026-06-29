"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Loader2, Plus, Save, Trash2 } from "lucide-react";
import {
  createReviewChecklistTemplate,
  deleteReviewChecklistTemplate,
  fetchReviewChecklistTemplate,
  setDefaultReviewChecklistTemplate,
  updateReviewChecklistTemplate,
  type ReviewChecklistCatalog,
  type ReviewChecklistTemplateSummary,
} from "@/features/review-checklist/review-checklist-api";
import type { ReviewChecklistSection, ReviewChecklistTemplate } from "@/features/review-checklist/schema";
import { hasPermission } from "@/lib/authorization";
import type { DocugridUser } from "@/lib/auth";

type Props = {
  catalog: ReviewChecklistCatalog;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCatalogChange: () => void;
  currentUser: DocugridUser | null;
};

function newSection(): ReviewChecklistSection {
  return {
    id: `section-${Date.now().toString(36)}`,
    title: "新しいセクション",
    sheetLabel: "新しいセクション",
    kind: "checklist",
    items: [],
  };
}

export function ReviewChecklistTemplateEditor({
  catalog,
  selectedId,
  onSelect,
  onCatalogChange,
  currentUser,
}: Props) {
  const canEdit = hasPermission(currentUser, "settings.manage");
  const [template, setTemplate] = useState<ReviewChecklistTemplate | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadTemplate = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      setTemplate(await fetchReviewChecklistTemplate(id));
    } catch {
      setError("テンプレートの読み込みに失敗しました。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) void loadTemplate(selectedId);
    else setTemplate(null);
  }, [selectedId, loadTemplate]);

  const handleSave = async () => {
    if (!template || !canEdit) return;
    if (template.scope === "global") {
      setError("公式テンプレートは「複製して編集」してください。");
      return;
    }
    const id = template.id || template.templateId;
    setSaving(true);
    setMessage("");
    setError(null);
    try {
      const saved = await updateReviewChecklistTemplate(id, {
        title: template.title,
        description: template.description,
        periodTypes: template.periodTypes,
        sections: template.sections,
      });
      setTemplate(saved);
      setMessage("保存しました。");
      onCatalogChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = async (source: ReviewChecklistTemplateSummary) => {
    if (!canEdit) return;
    try {
      const created = await createReviewChecklistTemplate({
        title: `${source.title}（コピー）`,
        sourceTemplateId: source.id,
      });
      onCatalogChange();
      onSelect(created.id || created.templateId);
      setMessage("複製しました。内容を編集して保存してください。");
    } catch {
      setError("複製に失敗しました。");
    }
  };

  const handleCreateBlank = async () => {
    if (!canEdit) return;
    try {
      const created = await createReviewChecklistTemplate({
        title: "新しいチェックリスト",
      });
      onCatalogChange();
      onSelect(created.id || created.templateId);
    } catch {
      setError("作成に失敗しました。");
    }
  };

  const handleDelete = async (id: string) => {
    if (!canEdit || !window.confirm("このチェックリスト定義を削除しますか？")) return;
    try {
      await deleteReviewChecklistTemplate(id);
      onCatalogChange();
      onSelect(catalog.defaultTemplateId);
      setMessage("削除しました。");
    } catch {
      setError("削除に失敗しました（デフォルト指定中は削除できません）。");
    }
  };

  const updateSection = (index: number, patch: Partial<ReviewChecklistSection>) => {
    if (!template) return;
    const sections = [...template.sections];
    sections[index] = { ...sections[index], ...patch };
    setTemplate({ ...template, sections });
  };

  const addItem = (sectionIndex: number) => {
    if (!template) return;
    const sections = [...template.sections];
    const section = sections[sectionIndex];
    const n = section.items.filter((i) => i.kind === "question").length + 1;
    sections[sectionIndex] = {
      ...section,
      items: [
        ...section.items,
        {
          id: `item-${Date.now().toString(36)}`,
          kind: "question",
          number: String(n),
          label: "",
          indent: 0,
        },
      ],
    };
    setTemplate({ ...template, sections });
  };

  const updateItem = (
    sectionIndex: number,
    itemIndex: number,
    patch: Partial<ReviewChecklistSection["items"][number]>,
  ) => {
    if (!template) return;
    const sections = [...template.sections];
    const items = [...sections[sectionIndex].items];
    items[itemIndex] = { ...items[itemIndex], ...patch };
    sections[sectionIndex] = { ...sections[sectionIndex], items };
    setTemplate({ ...template, sections });
  };

  const removeItem = (sectionIndex: number, itemIndex: number) => {
    if (!template) return;
    const sections = [...template.sections];
    sections[sectionIndex] = {
      ...sections[sectionIndex],
      items: sections[sectionIndex].items.filter((_, i) => i !== itemIndex),
    };
    setTemplate({ ...template, sections });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
      <aside className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-slate-500">チェックリスト種類</p>
          {canEdit && (
            <button
              type="button"
              onClick={() => void handleCreateBlank()}
              className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-white"
            >
              <Plus className="h-3 w-3" />
              新規
            </button>
          )}
        </div>
        <ul className="space-y-1">
          {catalog.templates.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onSelect(t.id)}
                className={`w-full rounded-lg border px-3 py-2 text-left text-xs ${
                  selectedId === t.id
                    ? "border-violet-300 bg-violet-50"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <p className="font-bold text-slate-800">{t.title}</p>
                <p className="mt-0.5 text-[10px] text-slate-500">
                  {t.scope === "global" ? "公式" : "事務所独自"} · {t.itemCount} 項目
                  {catalog.defaultTemplateId === t.id ? " · 既定" : ""}
                </p>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="min-w-0 space-y-4">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            読み込み中…
          </div>
        )}

        {!loading && template && (
          <>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs text-slate-500">
                  {template.scope === "global" ? "公式（読み取り専用）" : "事務所独自（編集可）"}
                </p>
                <input
                  value={template.title}
                  disabled={!canEdit || template.scope === "global"}
                  onChange={(e) => setTemplate({ ...template, title: e.target.value })}
                  className="mt-1 w-full max-w-lg rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {canEdit && template.scope === "global" && (
                  <button
                    type="button"
                    onClick={() =>
                      void handleDuplicate({
                        id: template.id,
                        templateId: template.templateId,
                        scope: template.scope,
                        title: template.title,
                        description: template.description,
                        periodTypes: template.periodTypes,
                        sectionCount: template.sections.length,
                        itemCount: 0,
                      })
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    複製して編集
                  </button>
                )}
                {canEdit && template.scope === "local" && (
                  <>
                    <button
                      type="button"
                      onClick={() => void handleSave()}
                      disabled={saving}
                      className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-60"
                    >
                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      保存
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void setDefaultReviewChecklistTemplate(template.id).then(() => {
                          onCatalogChange();
                          setMessage("既定のチェックリストに設定しました。");
                        })
                      }
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
                    >
                      既定にする
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(template.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      削除
                    </button>
                  </>
                )}
              </div>
            </div>

            <textarea
              value={template.description}
              disabled={!canEdit || template.scope === "global"}
              onChange={(e) => setTemplate({ ...template, description: e.target.value })}
              rows={2}
              placeholder="説明"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />

            {template.sections.map((section, sIdx) => (
              <div key={section.id} className="rounded-xl border border-slate-200 p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={section.title}
                    disabled={!canEdit || template.scope === "global"}
                    onChange={(e) => updateSection(sIdx, { title: e.target.value, sheetLabel: e.target.value })}
                    className="flex-1 rounded border border-slate-200 px-2 py-1 text-sm font-bold"
                  />
                  {canEdit && template.scope === "local" && (
                    <button
                      type="button"
                      onClick={() => addItem(sIdx)}
                      className="text-xs font-bold text-violet-700 hover:underline"
                    >
                      + 項目を追加
                    </button>
                  )}
                </div>
                <ul className="space-y-2">
                  {section.items
                    .filter((i) => i.kind === "question" || i.kind === "adjustment_point")
                    .map((item, iIdx) => {
                      const realIdx = section.items.indexOf(item);
                      return (
                        <li key={item.id} className="flex gap-2">
                          <input
                            value={item.number ?? ""}
                            disabled={!canEdit || template.scope === "global"}
                            onChange={(e) => updateItem(sIdx, realIdx, { number: e.target.value })}
                            className="w-12 rounded border border-slate-200 px-1 py-1 text-xs"
                            placeholder="No"
                          />
                          <textarea
                            value={item.label}
                            disabled={!canEdit || template.scope === "global"}
                            onChange={(e) => updateItem(sIdx, realIdx, { label: e.target.value })}
                            rows={2}
                            placeholder="確認事項"
                            className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1 text-sm"
                          />
                          {canEdit && template.scope === "local" && (
                            <button
                              type="button"
                              onClick={() => removeItem(sIdx, realIdx)}
                              className="shrink-0 text-red-600"
                              aria-label="削除"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </li>
                      );
                    })}
                </ul>
              </div>
            ))}

            {canEdit && template.scope === "local" && (
              <button
                type="button"
                onClick={() =>
                  setTemplate({ ...template, sections: [...template.sections, newSection()] })
                }
                className="text-xs font-bold text-violet-700 hover:underline"
              >
                + セクションを追加
              </button>
            )}
          </>
        )}

        {message && <p className="text-xs text-emerald-700">{message}</p>}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
