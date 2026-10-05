"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Loader2, Search, X } from "lucide-react";
import {
  AuthoringPageEditor,
  type AuthoringPageEditorHandle,
} from "@/features/authoring/components/AuthoringPageEditor";
import { MergeFieldPalette } from "@/features/authoring/components/MergeFieldPalette";
import { MissingVariablesForm } from "@/features/authoring/components/MissingVariablesForm";
import { PartyBinder } from "@/features/authoring/components/PartyBinder";
import {
  exportAuthoringPdf,
  listAuthoringTemplates,
  renderAuthoringBody,
  type AuthoringPartyBinding,
} from "@/features/authoring/api";
import { targetSlotLabelForTemplate } from "@/features/authoring/lib/authoring-slot-target";
import {
  BLANK_AGREEMENT_BODY,
  countUnresolvedMergeFields,
  maxPartySlotFromBody,
} from "@/features/authoring/lib/merge-fields";
import { resolveAuthoringSlot } from "@/features/authoring/lib/resolve-slot";
import type { AuthoringTemplate } from "@/features/authoring/types";
import type { OrgClient } from "@/config/organization";
import { fetchClientMaster } from "@/lib/client-master-api";
import { DocumentShareMenu } from "@/features/workspace/DocumentShareMenu";
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
  ) => Promise<{ persisted: boolean; docId?: string }>;
  canShareWithClient?: boolean;
};

type Step = "pick" | "edit" | "done";

const BLANK_TEMPLATE: AuthoringTemplate = {
  id: "__blank__",
  scope: "local",
  title: "白紙から作成（甲乙の契約書）",
  description: "自由に書いて、顧問先マスタから【法人名１】などを差し込みます。",
  category: "contracts",
  body: BLANK_AGREEMENT_BODY,
  variables: ["party1_name", "party2_name"],
  version: "1.0.0",
  targetSlotLabel: "契約書",
};

function partiesFromBindings(
  bindings: Record<number, string>,
  fallbackClientId: string,
): AuthoringPartyBinding[] {
  const slots = new Set<number>([
    1,
    ...Object.keys(bindings)
      .map((k) => Number(k))
      .filter((n) => n >= 1 && n <= 9),
  ]);
  return [...slots]
    .sort((a, b) => a - b)
    .map((slot) => ({
      slot,
      client_id: (bindings[slot] || (slot === 1 ? fallbackClientId : "")).trim(),
    }))
    .filter((row) => row.client_id);
}

export function AuthoringWizardModal({
  open,
  onClose,
  clientId,
  clientName,
  slotLabels,
  displayOrder,
  onApplySlotLayout,
  onSaveToSlot,
  canShareWithClient = false,
}: Props) {
  const editorRef = useRef<AuthoringPageEditorHandle>(null);
  const [step, setStep] = useState<Step>("pick");
  const [templates, setTemplates] = useState<AuthoringTemplate[]>([]);
  const [masterClients, setMasterClients] = useState<OrgClient[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AuthoringTemplate | null>(null);
  /** かっこ書きの本文（編集の正） */
  const [sourceText, setSourceText] = useState("");
  /** 差し込みプレビュー（source は消さない） */
  const [mergedPreview, setMergedPreview] = useState("");
  const [viewMode, setViewMode] = useState<"tokens" | "merged">("tokens");
  const [partyBindings, setPartyBindings] = useState<Record<number, string>>({});
  const [slotIndex, setSlotIndex] = useState(0);
  const [saveSlotLabel, setSaveSlotLabel] = useState("");
  const [slotLocked, setSlotLocked] = useState(false);
  /** 手入力値（差し込み API の values） */
  const [manualValues, setManualValues] = useState<Record<string, string>>({});
  /** フォームに出す項目（欠落＋入力済みを維持） */
  const [formFields, setFormFields] = useState<string[]>([]);
  const [manualFormOpen, setManualFormOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [merging, setMerging] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [listError, setListError] = useState("");
  const [openError, setOpenError] = useState("");
  const [actionError, setActionError] = useState("");
  const [message, setMessage] = useState("");
  const [showFields, setShowFields] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [doneSlotLabel, setDoneSlotLabel] = useState("");
  const [doneShared, setDoneShared] = useState(false);
  const [doneDocId, setDoneDocId] = useState("");
  const [donePersisted, setDonePersisted] = useState(false);
  const [doneTitle, setDoneTitle] = useState("");

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

  const partyCount = Math.max(2, maxPartySlotFromBody(sourceText));
  const unresolved = countUnresolvedMergeFields(sourceText);
  const displayText = viewMode === "merged" ? mergedPreview : sourceText;

  const reset = useCallback(() => {
    setStep("pick");
    setQuery("");
    setSelected(null);
    setSourceText("");
    setMergedPreview("");
    setViewMode("tokens");
    setPartyBindings({ 1: clientId });
    setSlotIndex(0);
    setSaveSlotLabel("");
    setSlotLocked(false);
    setManualValues({});
    setFormFields([]);
    setManualFormOpen(false);
    setListError("");
    setOpenError("");
    setActionError("");
    setMessage("");
    setShowFields(false);
    setPdfFile(null);
    setDoneSlotLabel("");
    setDoneShared(false);
    setDoneDocId("");
    setDonePersisted(false);
    setDoneTitle("");
  }, [clientId]);

  useEffect(() => {
    if (!open) {
      reset();
      return;
    }
    void (async () => {
      setListLoading(true);
      setListError("");
      setOpenError("");
      try {
        const [data, master] = await Promise.all([
          listAuthoringTemplates(clientId),
          fetchClientMaster(),
        ]);
        setTemplates([...data.global, ...data.local]);
        setMasterClients(master.clients);
        setPartyBindings({ 1: clientId });
      } catch {
        setTemplates([]);
        setListError("ひな形の読み込みに失敗しました。");
      } finally {
        setListLoading(false);
      }
    })();
  }, [open, clientId, reset]);

  const applySlotTarget = useCallback(
    (template: AuthoringTemplate, renderTargetSlotLabel?: string) => {
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

  const currentParties = useCallback(
    (bindings: Record<number, string> = partyBindings) =>
      partiesFromBindings(bindings, clientId),
    [partyBindings, clientId],
  );

  const applyMissingToForm = useCallback((nextMissing: string[], values: Record<string, string>) => {
    setFormFields((prev) => {
      const ordered: string[] = [];
      const seen = new Set<string>();
      for (const name of [...prev, ...nextMissing]) {
        if (seen.has(name)) continue;
        const kept = nextMissing.includes(name) || (values[name] ?? "").trim() !== "";
        if (!kept) continue;
        seen.add(name);
        ordered.push(name);
      }
      return ordered;
    });
  }, []);

  const probeMissing = useCallback(
    async (body: string, bindings: Record<number, string>, values: Record<string, string>) => {
      if (!body.trim()) {
        applyMissingToForm([], values);
        return null;
      }
      try {
        const result = await renderAuthoringBody(
          clientId,
          body,
          values,
          partiesFromBindings(bindings, clientId),
        );
        applyMissingToForm(result.missingVariables, values);
        return result;
      } catch {
        return null;
      }
    },
    [applyMissingToForm, clientId],
  );

  const loadTemplate = async (template: AuthoringTemplate) => {
    setLoading(true);
    setOpenError("");
    setSelected(template);
    const bindings = { 1: clientId, ...partyBindings };
    setPartyBindings(bindings);
    try {
      const body = template.body || "";
      setSourceText(body);
      setMergedPreview("");
      setViewMode("tokens");
      setManualValues({});
      setFormFields([]);
      applySlotTarget(template, template.targetSlotLabel);
      setStep("edit");
      await probeMissing(body, bindings, {});
    } catch {
      setOpenError("このひな形を開けませんでした。");
      setSelected(null);
    } finally {
      setLoading(false);
    }
  };

  const showMergedPreview = async () => {
    if (!sourceText.trim()) return;
    setMerging(true);
    setActionError("");
    try {
      const result = await renderAuthoringBody(
        clientId,
        sourceText,
        manualValues,
        currentParties(),
      );
      setMergedPreview(result.renderedBody);
      applyMissingToForm(result.missingVariables, manualValues);
      setViewMode("merged");
    } catch {
      setActionError("差し込みプレビューに失敗しました。");
    } finally {
      setMerging(false);
    }
  };

  const backToTokens = () => {
    setViewMode("tokens");
    setActionError("");
  };

  const handlePartyChange = (slot: number, nextClientId: string) => {
    setPartyBindings((prev) => {
      const next = { ...prev, [slot]: nextClientId };
      void probeMissing(sourceText, next, manualValues);
      return next;
    });
    if (viewMode === "merged") {
      setMergedPreview("");
      setViewMode("tokens");
    }
  };

  const handleManualValueChange = (name: string, value: string) => {
    setManualValues((prev) => ({ ...prev, [name]: value }));
    if (viewMode === "merged") {
      setMergedPreview("");
      setViewMode("tokens");
    }
  };

  const handleSave = async () => {
    if (!selected || !sourceText.trim()) return;
    setSaving(true);
    setActionError("");
    setMessage("");
    try {
      let bodyText = sourceText;
      if (countUnresolvedMergeFields(bodyText) > 0) {
        const merged = await renderAuthoringBody(
          clientId,
          bodyText,
          manualValues,
          currentParties(),
        );
        bodyText = merged.renderedBody;
        setMergedPreview(bodyText);
        applyMissingToForm(merged.missingVariables, manualValues);
        if (merged.missingVariables.length > 0) {
          setActionError(
            `未入力が ${merged.missingVariables.length} 件あります。左の手入力を埋めてから保存してください。`,
          );
          setViewMode("tokens");
          setManualFormOpen(true);
          setSaving(false);
          return;
        }
      }
      const title = selected.title.replace(/（.+）/, "").trim() || "文書";
      const blob = await exportAuthoringPdf({
        clientId,
        title,
        body: bodyText,
      });
      const safeName = `${clientName}_${title}.pdf`.replace(/[\\/:*?"<>|]+/g, "_");
      const file = new File([blob], safeName, { type: "application/pdf" });
      setPdfFile(file);

      const label = saveSlotLabel || slotLabels[slotIndex] || `枠 ${slotIndex + 1}`;
      const { persisted, docId } = await onSaveToSlot(file, slotIndex, label);
      setDoneSlotLabel(label);
      setDoneDocId(docId ?? "");
      setDoneShared(false);
      setDonePersisted(persisted);
      setDoneTitle(title);
      setStep("done");
      setMessage("");
    } catch {
      setActionError("PDF の生成または保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  };

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-stretch justify-center bg-slate-900/60 p-1 backdrop-blur-sm sm:p-2">
      <div className="flex h-[calc(100dvh-0.5rem)] max-h-[calc(100dvh-0.5rem)] w-[calc(100vw-0.5rem)] max-w-[100rem] flex-col overflow-hidden rounded-xl bg-white shadow-2xl sm:h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-1rem)] sm:w-[calc(100vw-1rem)] sm:rounded-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-2.5 sm:px-5">
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
              <li>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void loadTemplate(BLANK_TEMPLATE)}
                  className="w-full rounded-xl border border-dashed border-indigo-200 bg-indigo-50/40 px-4 py-3 text-left transition-colors hover:border-indigo-400 hover:bg-indigo-50 disabled:opacity-50"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-indigo-500" />
                    <span className="text-sm font-bold text-slate-800">{BLANK_TEMPLATE.title}</span>
                  </div>
                  <p className="mt-1 pl-6 text-[11px] text-slate-500">{BLANK_TEMPLATE.description}</p>
                </button>
              </li>
              {listLoading && templates.length === 0 && (
                <li className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  ひな形を読み込み中…
                </li>
              )}
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
              {filtered.length === 0 && !listLoading && (
                <li className="py-8 text-center text-sm text-slate-400">
                  {listError || "該当するひな形がありません"}
                </li>
              )}
            </ul>
            {openError && (
              <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
                {openError}
              </p>
            )}
            {listError && templates.length > 0 && (
              <p className="mt-2 text-[10px] text-amber-700">
                一覧の再読み込みに失敗しましたが、表示中のひな形は利用できます。
              </p>
            )}
            {loading && (
              <p className="mt-2 flex items-center justify-center gap-2 text-xs text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                ひな形を開いています…
              </p>
            )}
          </div>
        )}

        {step === "edit" && selected && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2 sm:px-5">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-bold text-slate-800">{selected.title}</h3>
                <p className="text-[10px] text-slate-500">
                  左で当事者・差し込み、右で書類。Ctrl+ホイールで拡大縮小
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setOpenError("");
                  setStep("pick");
                }}
                className="shrink-0 text-[11px] font-bold text-indigo-600 hover:underline"
              >
                ひな形を選び直す
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col md:flex-row">
              {/* 左サイド: 当事者・モード・手入力 */}
              <aside className="flex max-h-[42vh] w-full shrink-0 flex-col overflow-hidden border-b border-slate-200 bg-slate-50/90 md:max-h-none md:w-[17.5rem] md:border-b-0 md:border-r lg:w-[19rem]">
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3">
                  <div className="inline-flex w-full rounded-lg border border-slate-200 bg-white p-0.5 text-[11px] font-bold">
                    <button
                      type="button"
                      onClick={backToTokens}
                      className={`flex-1 rounded-md px-2 py-1.5 ${
                        viewMode === "tokens"
                          ? "bg-indigo-600 text-white"
                          : "text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      かっこ書き
                    </button>
                    <button
                      type="button"
                      disabled={merging || !sourceText.trim()}
                      onClick={() => void showMergedPreview()}
                      className={`flex-1 rounded-md px-2 py-1.5 disabled:opacity-50 ${
                        viewMode === "merged"
                          ? "bg-indigo-600 text-white"
                          : "text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {merging ? "差し込み中…" : "差し込み版"}
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    {viewMode === "merged"
                      ? "プレビュー中（元のかっこ書きは保持）"
                      : unresolved > 0
                        ? `未差し込み ${unresolved} 件`
                        : "項目なし／差し込み済み"}
                  </p>

                  <PartyBinder
                    clients={masterClients}
                    partyCount={partyCount}
                    bindings={partyBindings}
                    primaryClientId={clientId}
                    layout="stack"
                    onChange={handlePartyChange}
                  />

                  {formFields.length > 0 ? (
                    <div>
                      <MissingVariablesForm
                        fields={formFields}
                        values={manualValues}
                        onChange={handleManualValueChange}
                        open={manualFormOpen}
                        onOpenChange={setManualFormOpen}
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="text-[10px] font-bold text-slate-500 hover:underline"
                      onClick={() => void probeMissing(sourceText, partyBindings, manualValues)}
                    >
                      マスタ欠落を再検出
                    </button>
                  )}

                  <div>
                    <button
                      type="button"
                      disabled={viewMode === "merged"}
                      onClick={() => setShowFields((v) => !v)}
                      className="text-[11px] font-bold text-slate-500 hover:underline disabled:opacity-40"
                    >
                      {showFields ? "項目リストを隠す" : "項目を足す"}
                    </button>
                    {showFields && viewMode === "tokens" ? (
                      <div className="mt-2">
                        <MergeFieldPalette
                          onInsert={(token) => editorRef.current?.insertText(token)}
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              </aside>

              {/* 右: 書類 */}
              <div className="flex min-h-0 min-w-0 flex-1 flex-col p-2 sm:p-3">
                <AuthoringPageEditor
                  ref={editorRef}
                  value={displayText}
                  onChange={viewMode === "merged" ? () => undefined : setSourceText}
                  readOnly={viewMode === "merged"}
                />
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-end gap-3 border-t border-slate-100 px-4 py-3 sm:px-5">
              <div className="text-xs text-slate-600">
                保存先の枠
                {slotLocked ? (
                  <p className="mt-1 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-sm font-bold text-indigo-900">
                    {saveSlotLabel}
                    <span className="ml-2 text-[10px] font-normal text-indigo-600">自動</span>
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
                  disabled={saving || !sourceText.trim()}
                  onClick={() => void handleSave()}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? "保存中…" : "枠に保存"}
                </button>
              </div>
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <p className="text-sm font-black text-slate-800">
              {donePersisted ? `「${doneSlotLabel}」に保存しました` : "PDF はできました（枠への保存は失敗）"}
            </p>
            <p className="max-w-md text-[12px] text-slate-600">
              送るときだけシェアしてください。DM・ポータル・接続済みの Slack / メール / LINE から選べます。
              {doneShared ? " お客さんのポータルに共有済みです。" : ""}
            </p>
            <div className="flex flex-col items-center gap-2">
              <DocumentShareMenu
                clientId={clientId}
                clientName={clientName}
                title={doneTitle || selected?.title || "書類"}
                slotLabel={doneSlotLabel}
                docId={doneDocId || undefined}
                filename={pdfFile?.name}
                pdfFile={pdfFile}
                canShareWithClient={canShareWithClient}
                portalShared={doneShared}
                onPortalShared={() => setDoneShared(true)}
                onNavigateToDm={onClose}
                onStatus={(ok, err) => {
                  setActionError(err || "");
                  setMessage(ok);
                }}
              >
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700"
                >
                  閉じる
                </button>
              </DocumentShareMenu>
            </div>
          </div>
        )}

        {(actionError || message) && (
          <div className="border-t border-slate-100 px-5 py-2">
            {actionError && <p className="text-xs font-bold text-red-600">{actionError}</p>}
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
