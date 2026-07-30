"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Check,
  FileCheck2,
  FileX2,
  GripVertical,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import {
  createFormCatalogEntry,
  deleteFormCatalogEntry,
  EMPTY_FORM,
  fetchFormCatalogSampleCoverage,
  formToWriteBody,
  reorderFormCatalog,
  updateFormCatalogEntry,
  type FormCatalogForm,
  type FormCatalogListResponse,
  type FormCatalogSampleCoverageItem,
  type FormCatalogWriteBody,
} from "@/lib/form-catalog-api";
import { fetchDevDocumentCategories } from "@/lib/document-categories-api";

/** 非エンジニア向けの様式・AI分類ルール。form_catalog をやさしい表で追加・編集する。 */

type Props = {
  data: FormCatalogListResponse | null;
  onReload: () => Promise<void>;
  error: string | null;
  setError: (v: string | null) => void;
};

const CATEGORY_OPTIONS = [
  { value: "corp_tax", label: "法人税" },
  { value: "consumption_tax", label: "消費税" },
  { value: "income_tax", label: "所得税" },
  { value: "local_tax", label: "地方税" },
  { value: "common", label: "共通・その他" },
];

const REGION_OPTIONS = [
  { value: "any", label: "どこでも" },
  { value: "top_right", label: "ページ右上" },
  { value: "top", label: "ページ上部" },
  { value: "header", label: "ヘッダー" },
];

function categoryLabel(value: string | null | undefined): string {
  if (!value) return "";
  return CATEGORY_OPTIONS.find((c) => c.value === value)?.label ?? value;
}

function keywordsOf(form: FormCatalogForm): string {
  const first = form.anchors?.[0]?.any_of ?? [];
  return first.filter(Boolean).join("、");
}

type CoverageMap = Record<string, FormCatalogSampleCoverageItem>;
type CategoryMap = Record<string, { id: string; label: string }>;

function MiddleCategoryBadge({ cat }: { cat: { id: string; label: string } | undefined }) {
  if (!cat) {
    return <span className="text-[10px] text-slate-600">未分類</span>;
  }
  return (
    <span className="inline-flex rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] font-bold text-indigo-200">
      {cat.label}
    </span>
  );
}

function PdfStatusBadge({ cov }: { cov: FormCatalogSampleCoverageItem | undefined }) {
  if (cov?.configured) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300"
        title={
          cov.last_uploaded_at
            ? `サンプル ${cov.sample_count} 件 / 注釈 ${cov.annotation_count} 件`
            : undefined
        }
      >
        <FileCheck2 className="h-3 w-3" />
        設定済{cov.sample_count > 1 ? ` (${cov.sample_count})` : ""}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-700/60 px-2 py-0.5 text-[10px] font-bold text-slate-400">
      <FileX2 className="h-3 w-3" />
      未設定
    </span>
  );
}

type Draft = {
  base: FormCatalogWriteBody;
  formId: string;
  labelJa: string;
  role: string;
  category: string;
  required: boolean;
  region: string;
  keywords: string;
  notes: string;
};

function draftFromForm(form: FormCatalogForm | null): Draft {
  if (!form) {
    return {
      base: { ...EMPTY_FORM },
      formId: "",
      labelJa: "",
      role: "body",
      category: "",
      required: false,
      region: "any",
      keywords: "",
      notes: "",
    };
  }
  const body = formToWriteBody(form);
  return {
    base: body,
    formId: form.form_id,
    labelJa: form.label_ja,
    role: form.role || "body",
    category: form.maps_to?.category ?? "",
    required: Boolean(form.maps_to?.required),
    region: form.anchors?.[0]?.region ?? "any",
    keywords: keywordsOf(form),
    notes: form.notes ?? "",
  };
}

function splitKeywords(raw: string): string[] {
  return raw
    .split(/[,\n、]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function slugSuggestion(): string {
  return `doc_${Date.now().toString(36)}`;
}

function FormRowCells({
  form,
  cov,
  cat,
}: {
  form: FormCatalogForm;
  cov: FormCatalogSampleCoverageItem | undefined;
  cat: { id: string; label: string } | undefined;
}) {
  return (
    <>
      <td className="px-3 py-2">
        <MiddleCategoryBadge cat={cat} />
      </td>
      <td className="px-3 py-2 text-slate-300">
        {categoryLabel(form.maps_to?.category) || (form.maps_to?.tax_type ?? "—")}
      </td>
      <td className="px-3 py-2">
        {form.maps_to?.required ? (
          <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-200">
            必須
          </span>
        ) : (
          <span className="text-[10px] text-slate-500">任意</span>
        )}
      </td>
      <td className="px-3 py-2 text-slate-400">
        <span className="line-clamp-2">{keywordsOf(form) || "—"}</span>
      </td>
      <td className="px-3 py-2">
        {form.role === "skip" ? (
          <span className="rounded-full bg-slate-700 px-2 py-0.5 text-[10px] text-slate-300">
            対象外
          </span>
        ) : (
          <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] text-violet-200">
            本体
          </span>
        )}
      </td>
      <td className="px-3 py-2">
        <PdfStatusBadge cov={cov} />
      </td>
    </>
  );
}

function SortableFormRow({
  form,
  cov,
  cat,
}: {
  form: FormCatalogForm;
  cov: FormCatalogSampleCoverageItem | undefined;
  cat: { id: string; label: string } | undefined;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: form.form_id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`border-t border-slate-800 bg-slate-900 ${
        isDragging ? "relative z-10 opacity-90 ring-2 ring-amber-400" : ""
      }`}
    >
      <td className="w-8 px-2 py-2">
        <button
          type="button"
          className="cursor-grab touch-none text-slate-500 hover:text-white active:cursor-grabbing"
          title="ドラッグして並べ替え"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </td>
      <td className="px-3 py-2">
        <p className="font-bold text-white">{form.label_ja}</p>
        <p className="font-mono text-[10px] text-slate-500">{form.form_id}</p>
      </td>
      <FormRowCells form={form} cov={cov} cat={cat} />
    </tr>
  );
}

export function DocumentMasterPanel({ data, onReload, error, setError }: Props) {
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(() => draftFromForm(null));
  const [saving, setSaving] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);
  const [orderedForms, setOrderedForms] = useState<FormCatalogForm[]>([]);
  const [savingOrder, setSavingOrder] = useState(false);
  const [coverage, setCoverage] = useState<CoverageMap>({});
  const [categoryByForm, setCategoryByForm] = useState<CategoryMap>({});
  const [unconfiguredOnly, setUnconfiguredOnly] = useState(false);

  useEffect(() => {
    setOrderedForms(data?.forms ?? []);
  }, [data]);

  const loadCoverage = useCallback(async () => {
    try {
      const res = await fetchFormCatalogSampleCoverage();
      const map: CoverageMap = {};
      for (const item of res.items) map[item.form_id] = item;
      setCoverage(map);
    } catch {
      /* PDF 設定状況は補助情報。取得失敗は致命的でない */
    }
  }, []);

  const loadCategories = useCallback(async () => {
    try {
      const res = await fetchDevDocumentCategories();
      const map: CategoryMap = {};
      for (const cat of res.categories) {
        for (const f of cat.forms) {
          map[f.form_id] = { id: cat.id, label: cat.label };
        }
      }
      setCategoryByForm(map);
    } catch {
      /* 中分類は補助情報。取得失敗は致命的でない */
    }
  }, []);

  useEffect(() => {
    void loadCoverage();
    void loadCategories();
  }, [loadCoverage, loadCategories, data]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const forms = useMemo(() => {
    let list = data?.forms ?? [];
    const q = query.trim();
    if (q) {
      list = list.filter(
        (f) =>
          f.label_ja.includes(q) ||
          f.form_id.includes(q) ||
          keywordsOf(f).includes(q),
      );
    }
    if (unconfiguredOnly) {
      list = list.filter((f) => !coverage[f.form_id]?.configured);
    }
    return list;
  }, [data, query, unconfiguredOnly, coverage]);

  const coverageSummary = useMemo(() => {
    const all = data?.forms ?? [];
    const total = all.length;
    const configured = all.filter((f) => coverage[f.form_id]?.configured).length;
    return { total, configured, remaining: total - configured };
  }, [data, coverage]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOrderedForms((prev) => {
      const oldIndex = prev.findIndex((f) => f.form_id === active.id);
      const newIndex = prev.findIndex((f) => f.form_id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const enterReorder = () => {
    setQuery("");
    setOrderedForms(data?.forms ?? []);
    setError(null);
    setReorderMode(true);
  };

  const cancelReorder = () => {
    setOrderedForms(data?.forms ?? []);
    setReorderMode(false);
  };

  const saveOrder = async () => {
    setSavingOrder(true);
    setError(null);
    try {
      await reorderFormCatalog(orderedForms.map((f) => f.form_id));
      await onReload();
      setReorderMode(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "並べ替えの保存に失敗しました");
    } finally {
      setSavingOrder(false);
    }
  };

  const openCreate = () => {
    setMode("create");
    setEditId(null);
    setDraft(draftFromForm(null));
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (form: FormCatalogForm) => {
    setMode("edit");
    setEditId(form.form_id);
    setDraft(draftFromForm(form));
    setError(null);
    setModalOpen(true);
  };

  const patch = (next: Partial<Draft>) => setDraft((prev) => ({ ...prev, ...next }));

  const onSave = async () => {
    const labelJa = draft.labelJa.trim();
    const formId = (draft.formId.trim() || slugSuggestion()).toLowerCase();
    if (!labelJa) {
      setError("書類名を入力してください");
      return;
    }
    if (!/^[a-z][a-z0-9._-]*$/.test(formId)) {
      setError("識別ID は英小文字で始まる英数字（例: corp_tax_beppyo_2）にしてください");
      return;
    }
    const keywords = splitKeywords(draft.keywords);
    const anchorsRest = (draft.base.anchors ?? []).slice(1);
    const body: FormCatalogWriteBody = {
      ...draft.base,
      form_id: formId,
      label_ja: labelJa,
      role: draft.role,
      maps_to: {
        ...(draft.base.maps_to ?? {}),
        category: draft.category || null,
        required: draft.required ? true : null,
      },
      anchors: keywords.length
        ? [{ region: draft.region, any_of: keywords }, ...anchorsRest]
        : anchorsRest,
      notes: draft.notes.trim(),
    };

    setSaving(true);
    setError(null);
    try {
      if (mode === "create") await createFormCatalogEntry(body);
      else if (editId) await updateFormCatalogEntry(editId, body);
      setModalOpen(false);
      await onReload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (form: FormCatalogForm) => {
    if (!window.confirm(`「${form.label_ja}」を様式一覧から削除しますか？`)) return;
    setError(null);
    try {
      await deleteFormCatalogEntry(form.form_id);
      await onReload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-slate-400">
          <p>受信通知・別表など、書類の種類を登録します。ここで覚えさせた書類は自動分類とページ索引に使われます。</p>
          {data ? (
            <p className="mt-1 inline-flex items-center gap-1.5">
              <FileCheck2 className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-slate-300">
                参考 PDF 設定済 <span className="font-bold text-emerald-300">{coverageSummary.configured}</span> / 全{" "}
                {coverageSummary.total}
              </span>
              {coverageSummary.remaining > 0 ? (
                <span className="text-amber-300/80">（未設定 {coverageSummary.remaining}）</span>
              ) : (
                <span className="text-emerald-400/80">（すべて設定済）</span>
              )}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {reorderMode ? (
            <>
              <button
                type="button"
                onClick={cancelReorder}
                disabled={savingOrder}
                className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => void saveOrder()}
                disabled={savingOrder}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-emerald-950 hover:bg-emerald-400 disabled:opacity-50"
              >
                {savingOrder ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                並び順を保存
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={enterReorder}
                disabled={!data || data.forms.length < 2}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
              >
                <GripVertical className="h-3.5 w-3.5" />
                並べ替え
              </button>
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-amber-950 hover:bg-amber-400"
              >
                <Plus className="h-3.5 w-3.5" />
                書類を追加
              </button>
            </>
          )}
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-800/50 bg-red-950/40 px-3 py-2 text-xs text-red-200">
          {error}
        </p>
      ) : null}

      {reorderMode ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-950/30 px-3 py-2 text-xs text-amber-100">
          行の左端をドラッグして並べ替え、「並び順を保存」で確定します。並び順は自動分類・ページ索引の表示順に反映されます。
        </p>
      ) : (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="書類名・キーワードで絞り込み"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-xs text-slate-200 placeholder:text-slate-600"
            />
          </div>
          <button
            type="button"
            onClick={() => setUnconfiguredOnly((v) => !v)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold ${
              unconfiguredOnly
                ? "border-amber-500/60 bg-amber-500/15 text-amber-200"
                : "border-slate-700 text-slate-300 hover:bg-slate-800"
            }`}
            title="参考 PDF が未設定の様式だけを表示"
          >
            <FileX2 className="h-3.5 w-3.5" />
            未設定のみ
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-700">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-800/70 text-[10px] uppercase tracking-wide text-slate-400">
            <tr>
              {reorderMode ? <th className="w-8 px-2 py-2" /> : null}
              <th className="px-3 py-2 font-bold">書類名</th>
              <th className="px-3 py-2 font-bold">中分類</th>
              <th className="px-3 py-2 font-bold">カテゴリ</th>
              <th className="px-3 py-2 font-bold">必須</th>
              <th className="px-3 py-2 font-bold">見分けるキーワード</th>
              <th className="px-3 py-2 font-bold">役割</th>
              <th className="px-3 py-2 font-bold">参考PDF</th>
              {reorderMode ? null : <th className="px-3 py-2" />}
            </tr>
          </thead>
          {reorderMode ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={orderedForms.map((f) => f.form_id)}
                strategy={verticalListSortingStrategy}
              >
                <tbody>
                  {orderedForms.map((form) => (
                    <SortableFormRow
                      key={form.form_id}
                      form={form}
                      cov={coverage[form.form_id]}
                      cat={categoryByForm[form.form_id]}
                    />
                  ))}
                </tbody>
              </SortableContext>
            </DndContext>
          ) : (
            <tbody>
              {forms.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                    {data
                      ? unconfiguredOnly
                        ? "未設定の書類はありません"
                        : "該当する書類がありません"
                      : "読み込み中…"}
                  </td>
                </tr>
              ) : (
                forms.map((form) => (
                  <tr key={form.form_id} className="border-t border-slate-800 hover:bg-slate-800/40">
                    <td className="px-3 py-2">
                      <p className="font-bold text-white">{form.label_ja}</p>
                      <p className="font-mono text-[10px] text-slate-500">{form.form_id}</p>
                    </td>
                    <FormRowCells
                      form={form}
                      cov={coverage[form.form_id]}
                      cat={categoryByForm[form.form_id]}
                    />
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(form)}
                          className="rounded p-1.5 text-slate-400 hover:text-white"
                          title="編集"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void onDelete(form)}
                          className="rounded p-1.5 text-slate-400 hover:text-red-300"
                          title="削除"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          )}
        </table>
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-600 bg-slate-900 p-5">
            <h2 className="text-sm font-bold text-white">
              {mode === "create" ? "書類を追加" : "書類を編集"}
            </h2>

            <div className="mt-4 space-y-3 text-xs">
              <label className="block">
                <span className="mb-1 block font-semibold text-slate-300">書類名</span>
                <input
                  className="w-full rounded-lg border border-slate-600 bg-slate-950 px-2.5 py-2 text-white"
                  placeholder="例: 別表二、受信通知"
                  value={draft.labelJa}
                  onChange={(e) => patch({ labelJa: e.target.value })}
                />
              </label>

              <label className="block">
                <span className="mb-1 block font-semibold text-slate-300">
                  識別ID（英数字・内部用）
                </span>
                <input
                  className="w-full rounded-lg border border-slate-600 bg-slate-950 px-2.5 py-2 font-mono text-white disabled:opacity-60"
                  placeholder="例: corp_tax_beppyo_2（空欄なら自動）"
                  value={draft.formId}
                  disabled={mode === "edit"}
                  onChange={(e) => patch({ formId: e.target.value })}
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block font-semibold text-slate-300">カテゴリ</span>
                  <select
                    className="w-full rounded-lg border border-slate-600 bg-slate-950 px-2.5 py-2 text-white"
                    value={draft.category}
                    onChange={(e) => patch({ category: e.target.value })}
                  >
                    <option value="">未設定</option>
                    {CATEGORY_OPTIONS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block font-semibold text-slate-300">必須区分</span>
                  <select
                    className="w-full rounded-lg border border-slate-600 bg-slate-950 px-2.5 py-2 text-white"
                    value={draft.required ? "required" : "optional"}
                    onChange={(e) => patch({ required: e.target.value === "required" })}
                  >
                    <option value="optional">任意</option>
                    <option value="required">必須</option>
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="mb-1 block font-semibold text-slate-300">役割</span>
                <select
                  className="w-full rounded-lg border border-slate-600 bg-slate-950 px-2.5 py-2 text-white"
                  value={draft.role}
                  onChange={(e) => patch({ role: e.target.value })}
                >
                  <option value="body">本体書類</option>
                  <option value="skip">対象外（表紙・送付状など）</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block font-semibold text-slate-300">
                  見分けるキーワード（読点・カンマ・改行区切り）
                </span>
                <textarea
                  rows={3}
                  className="w-full resize-y rounded-lg border border-slate-600 bg-slate-950 px-2.5 py-2 text-white"
                  placeholder="例: 別表二、同族会社等の判定に関する明細書"
                  value={draft.keywords}
                  onChange={(e) => patch({ keywords: e.target.value })}
                />
              </label>

              <label className="block">
                <span className="mb-1 block font-semibold text-slate-300">
                  キーワードの出現位置
                </span>
                <select
                  className="w-full rounded-lg border border-slate-600 bg-slate-950 px-2.5 py-2 text-white"
                  value={draft.region}
                  onChange={(e) => patch({ region: e.target.value })}
                >
                  {REGION_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block font-semibold text-slate-300">メモ（任意）</span>
                <textarea
                  rows={2}
                  className="w-full resize-y rounded-lg border border-slate-600 bg-slate-950 px-2.5 py-2 text-white"
                  value={draft.notes}
                  onChange={(e) => patch({ notes: e.target.value })}
                />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
              >
                キャンセル
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void onSave()}
                className="rounded-lg bg-amber-500 px-4 py-1.5 text-xs font-bold text-amber-950 hover:bg-amber-400 disabled:opacity-50"
              >
                {saving ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
