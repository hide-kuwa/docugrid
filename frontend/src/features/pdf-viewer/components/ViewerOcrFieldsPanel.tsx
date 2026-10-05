"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, FileSearch, Loader2, Pencil } from "lucide-react";
import {
  CLIENT_PROFILE_FIELD_IDS,
  type ProfileFieldMeta,
} from "@/config/client-profile-fields";
import type { ClassifyPersistMetadata } from "@/features/docugrid/lib/classify";
import {
  applyExtractionFields,
  buildExtractionReviewFromClassifyMeta,
  buildOcrFieldRows,
  loadExtractionDraft,
  saveExtractionDraft,
  type OcrFieldDisplaySource,
} from "@/features/client-data/lib/extraction-api";
import { propagateSlotNormalizeResult } from "@/features/org/org-directory-events";
import type { NormalizeResultPayload } from "@/features/docugrid/lib/slot-documents";

type Props = {
  classifyMeta?: ClassifyPersistMetadata | null;
  slotId: string;
  slotLabel?: string;
  clientId: string;
  periodKey: string;
  clientProfile?: Record<string, string>;
  clientProfileMeta?: Record<string, ProfileFieldMeta>;
  onApplied?: (result: NormalizeResultPayload) => void;
};

const SOURCE_BADGE: Record<OcrFieldDisplaySource, string> = {
  ocr: "bg-emerald-50 text-emerald-800 border-emerald-200",
  manual_master: "bg-sky-50 text-sky-800 border-sky-200",
  manual_session: "bg-amber-50 text-amber-900 border-amber-300",
};

const SOURCE_LABEL: Record<OcrFieldDisplaySource, string> = {
  ocr: "OCR",
  manual_master: "手動（マスタ）",
  manual_session: "手動修正",
};

const DRAFT_SAVE_DEBOUNCE_MS = 600;

function statusClass(status: string): string {
  if (status === "extracted") return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (status === "low_confidence") return "bg-amber-50 text-amber-900 border-amber-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
}

export function ViewerOcrFieldsPanel({
  classifyMeta,
  slotId,
  slotLabel,
  clientId,
  periodKey,
  clientProfile,
  clientProfileMeta,
  onApplied,
}: Props) {
  const review = useMemo(
    () =>
      buildExtractionReviewFromClassifyMeta(classifyMeta, {
        slotId,
        slotLabel,
      }),
    [classifyMeta, slotId, slotLabel],
  );

  const [open, setOpen] = useState(true);
  const [sessionDraft, setSessionDraft] = useState<Record<string, string>>({});
  const [sessionEditedIds, setSessionEditedIds] = useState<Set<string>>(() => new Set());
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [draftSaveState, setDraftSaveState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextAutosaveRef = useRef(true);
  const draftIdentity = `${clientId}|${periodKey}|${slotId}`;

  // ベース値（OCR / マスタ）を組み立て
  useEffect(() => {
    if (!review) return;
    const init: Record<string, string> = {};
    for (const field of review.fields) {
      const master = (clientProfile?.[field.field_id] ?? "").trim();
      const meta = clientProfileMeta?.[field.field_id];
      if (meta?.source === "manual" && master) {
        init[field.field_id] = master;
      } else if (field.value) {
        init[field.field_id] = field.value;
      }
    }
    setSessionDraft(init);
    setSessionEditedIds(new Set());
    setDraftHydrated(false);
    setDraftSaveState("idle");
    setError(null);
    setMessage(null);
    skipNextAutosaveRef.current = true;
  }, [review, clientProfile, clientProfileMeta, classifyMeta?.classified_at, draftIdentity]);

  // サーバー上の手動修正ドラフトを重ねる（マスタ反映とは別）
  useEffect(() => {
    if (!review || !slotIdentityReady(clientId, periodKey, slotId)) return;
    let cancelled = false;
    void (async () => {
      try {
        const draft = await loadExtractionDraft({ clientId, periodKey, slotId });
        if (cancelled) return;
        if (draft.edited_ids.length > 0) {
          setSessionDraft((prev) => {
            const next = { ...prev };
            for (const id of draft.edited_ids) {
              const value = (draft.fields[id] ?? "").trim();
              if (value) next[id] = value;
            }
            return next;
          });
          setSessionEditedIds(new Set(draft.edited_ids));
        }
      } catch {
        // 下書き読込失敗は編集自体を止めない
      } finally {
        if (!cancelled) {
          setDraftHydrated(true);
          skipNextAutosaveRef.current = true;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [review, clientId, periodKey, slotId, classifyMeta?.classified_at, draftIdentity]);

  // 編集内容をデバウンス自動保存（マスタには触れない）
  useEffect(() => {
    if (!draftHydrated || !slotIdentityReady(clientId, periodKey, slotId)) return;
    if (skipNextAutosaveRef.current) {
      skipNextAutosaveRef.current = false;
      return;
    }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const editedIds = [...sessionEditedIds];
      const fields: Record<string, string> = {};
      for (const id of editedIds) {
        const value = (sessionDraft[id] ?? "").trim();
        if (value) fields[id] = value;
      }
      setDraftSaveState("saving");
      void saveExtractionDraft({
        clientId,
        periodKey,
        slotId,
        fields,
        editedIds,
      })
        .then(() => setDraftSaveState("saved"))
        .catch(() => setDraftSaveState("error"));
    }, DRAFT_SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [
    sessionDraft,
    sessionEditedIds,
    draftHydrated,
    clientId,
    periodKey,
    slotId,
  ]);

  const rows = useMemo(() => {
    if (!review) return [];
    return buildOcrFieldRows({
      review,
      clientProfile,
      clientProfileMeta,
      sessionDraft,
      sessionEditedIds,
    });
  }, [review, clientProfile, clientProfileMeta, sessionDraft, sessionEditedIds]);

  const dirtyCount = sessionEditedIds.size;
  const masterDirtyCount = useMemo(() => {
    const allowed = new Set(CLIENT_PROFILE_FIELD_IDS);
    let n = 0;
    for (const id of sessionEditedIds) {
      if (allowed.has(id) && (sessionDraft[id] ?? "").trim()) n += 1;
    }
    return n;
  }, [sessionEditedIds, sessionDraft]);

  const handleChange = useCallback(
    (fieldId: string, nextValue: string, ocrValue: string) => {
      setSessionDraft((prev) => ({ ...prev, [fieldId]: nextValue }));
      setSessionEditedIds((prev) => {
        const next = new Set(prev);
        const trimmed = nextValue.trim();
        if (!trimmed || trimmed === ocrValue.trim()) {
          next.delete(fieldId);
        } else {
          next.add(fieldId);
        }
        return next;
      });
      setMessage(null);
      setError(null);
    },
    [],
  );

  const handleApply = useCallback(async () => {
    if (!review || !slotIdentityReady(clientId, periodKey, slotId)) return;
    const allowedIds = new Set(CLIENT_PROFILE_FIELD_IDS);
    const fields: Record<string, string> = {};
    for (const row of rows) {
      if (!sessionEditedIds.has(row.field_id)) continue;
      if (!allowedIds.has(row.field_id)) continue;
      const value = (sessionDraft[row.field_id] ?? "").trim();
      if (value) fields[row.field_id] = value;
    }
    if (Object.keys(fields).length === 0) {
      const edited = [...sessionEditedIds];
      const hasDocumentOnly =
        edited.length > 0 && edited.every((id) => !allowedIds.has(id));
      setMessage(
        hasDocumentOnly
          ? "資料固有の項目は自動保存済みです。顧客マスタ項目を編集してから反映してください。"
          : "反映する変更がありません",
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await applyExtractionFields({
        clientId,
        periodKey,
        slotId,
        slotLabel,
        fields,
      });
      propagateSlotNormalizeResult(clientId, result);
      const appliedIds = new Set(Object.keys(fields));
      setSessionEditedIds((prev) => {
        const next = new Set(prev);
        for (const id of appliedIds) next.delete(id);
        return next;
      });
      skipNextAutosaveRef.current = true;
      setMessage("マスタへ反映しました（手動入力を優先）");
      onApplied?.(result);
    } catch {
      setError("マスタへの反映に失敗しました");
    } finally {
      setSaving(false);
    }
  }, [
    clientId,
    onApplied,
    periodKey,
    review,
    rows,
    sessionDraft,
    sessionEditedIds,
    slotId,
    slotLabel,
  ]);

  if (!review || rows.length === 0) {
    return null;
  }

  const draftStatusLabel =
    draftSaveState === "saving"
      ? "状態を保存中…"
      : draftSaveState === "saved"
        ? "状態を自動保存済み"
        : draftSaveState === "error"
          ? "状態の自動保存に失敗"
          : dirtyCount > 0 && draftHydrated
            ? "状態は自動保存されます"
            : null;

  return (
    <aside
      className={`flex shrink-0 flex-col border-l border-slate-200 bg-white transition-[width] duration-200 ${
        open ? "w-80" : "w-10"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center justify-between gap-2 border-b border-slate-100 px-2 py-2 text-left hover:bg-slate-50"
        title={open ? "OCR パネルを閉じる" : "OCR パネルを開く"}
      >
        {open ? (
          <>
            <span className="flex min-w-0 items-center gap-1.5 text-xs font-bold text-slate-800">
              <FileSearch className="h-3.5 w-3.5 shrink-0 text-violet-700" />
              <span className="truncate">OCR 読取</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
          </>
        ) : (
          <ChevronLeft className="mx-auto h-4 w-4 text-slate-500" />
        )}
      </button>

      {open ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="border-b border-slate-100 px-3 py-2">
            <p className="text-xs font-bold text-slate-800">{review.document_label}</p>
            <p className="mt-0.5 text-[10px] text-slate-500">
              {rows.length} 項目
              {dirtyCount > 0 ? ` · 手動修正 ${dirtyCount}` : ""}
            </p>
            {draftStatusLabel ? (
              <p
                className={`mt-1 text-[10px] ${
                  draftSaveState === "error" ? "text-rose-600" : "text-slate-400"
                }`}
              >
                {draftStatusLabel}
              </p>
            ) : null}
            {classifyMeta?.engine ? (
              <p className="mt-1 font-mono text-[10px] text-slate-400">
                engine: {classifyMeta.engine}
              </p>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {rows.map((row) => {
              const inputValue = sessionDraft[row.field_id] ?? row.displayValue ?? "";
              const isSessionEdit = sessionEditedIds.has(row.field_id);
              const source: OcrFieldDisplaySource = isSessionEdit
                ? "manual_session"
                : row.source;
              const multiline =
                row.field_id === "ocr_text_excerpt" || inputValue.length > 80;

              return (
                <label key={row.field_id} className="block">
                  <span className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                    {row.label}
                    <span
                      className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${SOURCE_BADGE[source]}`}
                    >
                      {SOURCE_LABEL[source]}
                    </span>
                    {row.status !== "extracted" ? (
                      <span
                        className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${statusClass(row.status)}`}
                      >
                        {row.status === "low_confidence" ? "要確認" : "未読取"}
                      </span>
                    ) : null}
                  </span>
                  {multiline ? (
                    <textarea
                      rows={4}
                      value={inputValue}
                      onChange={(e) => handleChange(row.field_id, e.target.value, row.ocrValue)}
                      className={`w-full resize-y rounded-lg border px-2.5 py-2 font-mono text-xs ${
                        isSessionEdit
                          ? "border-amber-300 bg-amber-50/60"
                          : "border-slate-200 bg-white"
                      }`}
                    />
                  ) : (
                    <input
                      type="text"
                      value={inputValue}
                      onChange={(e) => handleChange(row.field_id, e.target.value, row.ocrValue)}
                      className={`w-full rounded-lg border px-2.5 py-2 text-sm ${
                        isSessionEdit
                          ? "border-amber-300 bg-amber-50/60"
                          : "border-slate-200 bg-white"
                      }`}
                    />
                  )}
                  {isSessionEdit && row.ocrValue ? (
                    <p className="mt-1 flex items-start gap-1 text-[10px] text-slate-500">
                      <Pencil className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
                      <span>
                        OCR: <span className="font-mono text-slate-600">{row.ocrValue}</span>
                      </span>
                    </p>
                  ) : null}
                </label>
              );
            })}
          </div>

          <div className="border-t border-slate-100 px-3 py-3">
            {error ? <p className="mb-2 text-xs text-rose-600">{error}</p> : null}
            {message ? <p className="mb-2 text-xs text-emerald-700">{message}</p> : null}
            <p className="mb-2 text-[10px] leading-relaxed text-slate-500">
              黄色の手動修正は自動で状態保存されます。顧客マスタへ載せるときだけ下のボタンを押してください。
            </p>
            <button
              type="button"
              disabled={saving || masterDirtyCount === 0}
              onClick={() => void handleApply()}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-violet-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
              title={
                masterDirtyCount === 0
                  ? "マスタ項目の未反映修正がありません"
                  : `${masterDirtyCount} 項目を顧客マスタへ反映`
              }
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              マスタへ反映
              {masterDirtyCount > 0 ? `（${masterDirtyCount}）` : ""}
            </button>
          </div>
        </div>
      ) : null}
    </aside>
  );
}

function slotIdentityReady(clientId: string, periodKey: string, slotId: string): boolean {
  return Boolean(clientId?.trim() && periodKey?.trim() && slotId?.trim());
}
