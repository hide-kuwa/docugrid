"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Database, FileText, Loader2, Search } from "lucide-react";
import {
  relatedDocumentsForField,
  isRelatedDocumentAvailable,
  type RelatedDocumentRef,
} from "@/config/client-field-sources";
import {
  CLIENT_PROFILE_SECTIONS,
  resolveFieldProvenance,
  type ProfileFieldSource,
} from "@/config/client-profile-fields";
import type { OrgClient } from "@/config/organization";
import { FieldHistoryPanel } from "@/features/client-data/FieldHistoryPanel";
import { readMasterFieldValue, type FieldChangeActor } from "@/lib/client-field-mutations";
import { patchClientField } from "@/lib/client-master-api";

type Row = {
  section: string;
  label: string;
  value: string;
  fieldId: string;
  editable: boolean;
  multiline: boolean;
};

type Props = {
  client: OrgClient;
  canEdit?: boolean;
  editor?: FieldChangeActor;
  onClientPatched?: (client: OrgClient) => void;
  filledSlotKeys?: ReadonlySet<string>;
  onOpenRelatedDocument?: (ref: RelatedDocumentRef) => void;
};

const READONLY_MASTER_FIELDS = new Set(["_id", "_category", "_tags"]);

function categoryLabel(category: OrgClient["category"]): string {
  return category === "corporate" ? "法人" : "個人";
}

function buildRows(client: OrgClient): Row[] {
  const profile = client.profile ?? {};
  const master: Row[] = [
    {
      section: "マスタ",
      label: "顧問先ID",
      value: client.id,
      fieldId: "_id",
      editable: false,
      multiline: false,
    },
    {
      section: "マスタ",
      label: "顧問先名",
      value: client.name,
      fieldId: "_name",
      editable: true,
      multiline: false,
    },
    {
      section: "マスタ",
      label: "決算月",
      value: client.fiscalMonth ? `${client.fiscalMonth}` : "",
      fieldId: "_fiscal_month",
      editable: true,
      multiline: false,
    },
    {
      section: "マスタ",
      label: "法人・個人区分",
      value: categoryLabel(client.category),
      fieldId: "_category",
      editable: false,
      multiline: false,
    },
    {
      section: "マスタ",
      label: "タグ",
      value: (client.tags ?? []).join("、"),
      fieldId: "_tags",
      editable: false,
      multiline: false,
    },
  ];

  const profileRows: Row[] = CLIENT_PROFILE_SECTIONS.flatMap((section) =>
    section.fields.map((field) => ({
      section: section.title.replace(/^\d+\.\s*/, ""),
      label: field.label,
      value: (profile[field.id] ?? "").trim(),
      fieldId: field.id,
      editable: true,
      multiline: !!field.multiline,
    })),
  );

  return [...master, ...profileRows];
}

const SOURCE_BADGE_CLASS: Record<ProfileFieldSource | "unknown", string> = {
  manual: "border-indigo-200 bg-indigo-50 text-indigo-700",
  ocr: "border-emerald-200 bg-emerald-50 text-emerald-700",
  master: "border-slate-200 bg-slate-100 text-slate-600",
  import: "border-violet-200 bg-violet-50 text-violet-700",
  unknown: "border-slate-200 bg-slate-50 text-slate-400",
};

function SourceBadge({
  source,
  label,
  detail,
  updatedBy,
  updatedAt,
}: {
  source: ProfileFieldSource | "unknown";
  label: string;
  detail?: string;
  updatedBy?: string;
  updatedAt?: string;
}) {
  const when =
    updatedAt &&
    (() => {
      try {
        return new Date(updatedAt).toLocaleString("ja-JP", {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });
      } catch {
        return undefined;
      }
    })();

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span
        className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${SOURCE_BADGE_CLASS[source]}`}
      >
        {label}
      </span>
      {detail ? (
        <span className="text-[10px] text-slate-500" title="元資料">
          ← {detail}
        </span>
      ) : null}
      {updatedBy || when ? (
        <span className="text-[10px] text-slate-400">
          {updatedBy ?? "不明"}
          {when ? ` · ${when}` : ""}
        </span>
      ) : null}
    </span>
  );
}

function RelatedDocumentChips({
  fieldId,
  filledSlotKeys,
  onOpen,
}: {
  fieldId: string;
  filledSlotKeys: ReadonlySet<string>;
  onOpen?: (ref: RelatedDocumentRef) => void;
}) {
  const docs = relatedDocumentsForField(fieldId);
  if (docs.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {docs.map((doc) => {
        const available = isRelatedDocumentAvailable(doc, filledSlotKeys);
        const key = `${doc.periodKey}:${doc.slotId}`;
        if (onOpen && available) {
          return (
            <button
              key={key}
              type="button"
              onClick={() => onOpen(doc)}
              className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 transition-colors hover:bg-blue-100"
              title={`${doc.label}を開く`}
            >
              <FileText className="h-3 w-3 shrink-0" />
              {doc.label}
            </button>
          );
        }
        return (
          <span
            key={key}
            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[10px] font-semibold ${
              available
                ? "border-slate-200 bg-white text-slate-500"
                : "border-dashed border-slate-200 bg-slate-50 text-slate-300"
            }`}
            title={available ? doc.label : `${doc.label}（未アップロード）`}
          >
            <FileText className="h-3 w-3 shrink-0" />
            {doc.label}
          </span>
        );
      })}
    </div>
  );
}

function EditableValue({
  row,
  client,
  canEdit,
  editor,
  onSaved,
}: {
  row: Row;
  client: OrgClient;
  canEdit: boolean;
  editor?: FieldChangeActor;
  onSaved?: (client: OrgClient) => void;
}) {
  const rawValue = row.fieldId.startsWith("_")
    ? readMasterFieldValue(client, row.fieldId)
    : (client.profile?.[row.fieldId] ?? "");

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(rawValue);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(rawValue);
    setIsEditing(false);
    setError(null);
  }, [rawValue, client.id, row.fieldId]);

  const editable = canEdit && editor && row.editable && !READONLY_MASTER_FIELDS.has(row.fieldId);
  const dirty = draft !== rawValue;

  const displayValue =
    row.fieldId === "_fiscal_month" && rawValue ? `${rawValue}月` : rawValue;

  const cancel = () => {
    setDraft(rawValue);
    setIsEditing(false);
    setError(null);
  };

  const startEdit = () => {
    setDraft(rawValue);
    setIsEditing(true);
    setError(null);
  };

  const save = useCallback(async () => {
    if (!editable || !editor) return;
    if (!dirty) {
      setIsEditing(false);
      return;
    }
    if (row.fieldId === "_fiscal_month") {
      const n = Number.parseInt(draft, 10);
      if (!Number.isInteger(n) || n < 1 || n > 12) {
        setError("決算月は 1〜12 で入力してください。");
        return;
      }
    }
    if (row.fieldId === "_name" && !draft.trim()) {
      setError("顧問先名は必須です。");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await patchClientField(client.id, row.fieldId, draft, editor);
      onSaved?.(updated);
      setIsEditing(false);
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "反映に失敗しました。");
    } finally {
      setSaving(false);
    }
  }, [editable, editor, dirty, draft, row.fieldId, client.id, onSaved]);

  const inputClass =
    "w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100";

  const actionBtnBase =
    "inline-flex items-center justify-center rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors disabled:opacity-50";

  if (!isEditing) {
    return (
      <div className="space-y-1">
        <div className="flex items-start justify-between gap-3">
          <div
            className={`min-w-0 flex-1 text-sm leading-relaxed ${
              displayValue ? "text-slate-800" : "italic text-slate-300"
            } ${row.multiline ? "whitespace-pre-wrap" : ""}`}
          >
            {displayValue || "—"}
          </div>
          {editable ? (
            <button
              type="button"
              onClick={startEdit}
              className={`${actionBtnBase} shrink-0 border border-slate-200 bg-white text-slate-600 hover:bg-slate-50`}
            >
              変更
            </button>
          ) : null}
        </div>
        {savedFlash ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
            <Check className="h-3 w-3" />
            反映しました
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-violet-100 bg-violet-50/40 p-3">
      {row.multiline ? (
        <textarea
          rows={3}
          className={inputClass}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={saving}
          autoFocus
        />
      ) : row.fieldId === "_fiscal_month" ? (
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={12}
            className={`${inputClass} max-w-[5rem]`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={saving}
            autoFocus
          />
          <span className="text-sm text-slate-500">月</span>
        </div>
      ) : (
        <input
          type="text"
          className={inputClass}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={saving}
          autoFocus
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className={`${actionBtnBase} bg-violet-600 text-white hover:bg-violet-700`}
        >
          {saving ? (
            <>
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              決定中…
            </>
          ) : (
            "決定"
          )}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={saving}
          className={`${actionBtnBase} border border-slate-200 bg-white text-slate-600 hover:bg-slate-50`}
        >
          キャンセル
        </button>
        {dirty && !saving ? (
          <span className="text-[10px] text-amber-600">未確定の変更があります</span>
        ) : null}
        {error ? <span className="text-[10px] text-red-600">{error}</span> : null}
      </div>
    </div>
  );
}

export function ClientDataOverview({
  client,
  canEdit = false,
  editor,
  onClientPatched,
  filledSlotKeys,
  onOpenRelatedDocument,
}: Props) {
  const [query, setQuery] = useState("");
  const rows = useMemo(() => buildRows(client), [client]);
  const slotKeys = filledSlotKeys ?? new Set<string>();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.section.toLowerCase().includes(q) ||
        r.label.toLowerCase().includes(q) ||
        r.value.toLowerCase().includes(q) ||
        r.fieldId.toLowerCase().includes(q),
    );
  }, [rows, query]);

  const filled = rows.filter((r) => r.value.length > 0).length;
  const total = rows.length;
  const fillPercent = total > 0 ? Math.round((filled / total) * 100) : 0;

  const sections = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const row of filtered) {
      const list = map.get(row.section) ?? [];
      list.push(row);
      map.set(row.section, list);
    }
    return [...map.entries()];
  }, [filtered]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-slate-50">
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-4 md:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-violet-600">
              <Database className="h-3.5 w-3.5" />
              DATA
            </div>
            <h1 className="mt-1 text-xl font-black text-slate-800">{client.name}</h1>
            <p className="mt-1 text-sm text-slate-500">
              各項目の「変更」から編集し、「決定」で反映します。設定画面と常に同期され、変更履歴が残ります。
            </p>
          </div>
          <div className="rounded-xl border border-violet-100 bg-violet-50 px-4 py-2 text-right">
            <div className="text-[10px] font-bold uppercase tracking-wide text-violet-500">
              マスタ入力率
            </div>
            <div className="text-2xl font-black tabular-nums text-violet-700">{fillPercent}%</div>
            <div className="text-[10px] font-medium text-violet-600">
              入力済み {filled} / {total} 項目
            </div>
            <div className="mt-0.5 text-[9px] text-violet-400">※ マトリクス資料充足率とは別</div>
          </div>
        </div>
        <div className="relative mt-4 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="項目名・値で検索…"
            className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm"
          />
        </div>
        {canEdit && editor ? (
          <p className="mt-2 text-[11px] text-violet-700">
            「変更」→ 編集 → 「決定」で確定（{editor.name || editor.email} として記録）
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-slate-500">
          <span className="font-semibold">入力元:</span>
          <SourceBadge source="ocr" label="OCR読取" />
          <SourceBadge source="manual" label="手動入力" />
          <SourceBadge source="master" label="マスタ" />
          <span className="text-slate-400">・青いチップは関連資料を開けます</span>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
        {sections.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">該当する項目がありません</p>
        ) : (
          <div className="mx-auto max-w-5xl space-y-6">
            {sections.map(([sectionTitle, sectionRows]) => (
              <section
                key={sectionTitle}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
              >
                <h2 className="border-b border-slate-100 bg-slate-50/80 px-4 py-2.5 text-xs font-bold text-slate-600">
                  {sectionTitle}
                </h2>
                <div className="divide-y divide-slate-100">
                  {sectionRows.map((row) => {
                    const provenance = resolveFieldProvenance(
                      row.fieldId,
                      row.value,
                      client.profileMeta,
                    );
                    const meta = client.profileMeta?.[row.fieldId];
                    const history = client.profileHistory?.[row.fieldId] ?? [];
                    const lastChange = history[0];
                    const relatedDocs = relatedDocumentsForField(row.fieldId);
                    const showMeta =
                      (row.value.length > 0 || history.length > 0) &&
                      provenance.source &&
                      provenance.label;
                    const showDocs = relatedDocs.length > 0;

                    return (
                      <div
                        key={row.fieldId}
                        className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(8rem,14rem)_1fr] sm:gap-4"
                      >
                        <dt className="text-xs font-semibold text-slate-500">{row.label}</dt>
                        <dd className="min-w-0 space-y-2">
                          <EditableValue
                            row={row}
                            client={client}
                            canEdit={canEdit}
                            editor={editor}
                            onSaved={onClientPatched}
                          />
                          {(showMeta || showDocs || history.length > 0) && (
                            <div className="flex flex-col gap-2 border-t border-slate-50 pt-2">
                              <div className="flex flex-wrap items-center gap-2">
                                {showMeta && provenance.source ? (
                                  <SourceBadge
                                    source={provenance.source}
                                    label={provenance.label}
                                    detail={provenance.detail}
                                    updatedBy={meta?.updatedBy ?? lastChange?.updatedBy}
                                    updatedAt={meta?.updatedAt ?? lastChange?.updatedAt}
                                  />
                                ) : null}
                                <FieldHistoryPanel fieldLabel={row.label} history={history} />
                              </div>
                              {showDocs ? (
                                <RelatedDocumentChips
                                  fieldId={row.fieldId}
                                  filledSlotKeys={slotKeys}
                                  onOpen={onOpenRelatedDocument}
                                />
                              ) : null}
                            </div>
                          )}
                        </dd>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function profileFillPercent(client: OrgClient): number {
  const rows = buildRows(client);
  const filled = rows.filter((r) => r.value.length > 0).length;
  return rows.length > 0 ? Math.round((filled / rows.length) * 100) : 0;
}
