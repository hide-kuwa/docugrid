"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Loader2, Search, X } from "lucide-react";
import {
  AuthoringPageEditor,
  type AuthoringPageEditorHandle,
} from "@/features/authoring/components/AuthoringPageEditor";
import { MergeFieldPalette } from "@/features/authoring/components/MergeFieldPalette";
import { PartyBinder } from "@/features/authoring/components/PartyBinder";
import {
  exportAuthoringPdf,
  listAuthoringTemplates,
  renderAuthoringBody,
  renderAuthoringTemplate,
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
import { isBuiltinVariable, labelForVariable } from "@/features/authoring/types";
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
  const [editorText, setEditorText] = useState("");
  const [partyBindings, setPartyBindings] = useState<Record<number, string>>({});
  const [slotIndex, setSlotIndex] = useState(0);
  const [saveSlotLabel, setSaveSlotLabel] = useState("");
  const [slotLocked, setSlotLocked] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);
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

  const partyCount = Math.max(2, maxPartySlotFromBody(editorText));
  const unresolved = countUnresolvedMergeFields(editorText);

  const reset = useCallback(() => {
    setStep("pick");
    setQuery("");
    setSelected(null);
    setEditorText("");
    setPartyBindings({ 1: clientId });
    setSlotIndex(0);
    setSaveSlotLabel("");
    setSlotLocked(false);
    setMissing([]);
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

  const loadTemplate = async (template: AuthoringTemplate) => {
    setLoading(true);
    setOpenError("");
    setSelected(template);
    const bindings = { 1: clientId, ...partyBindings };
    setPartyBindings(bindings);
    try {
      const parties = partiesFromBindings(bindings, clientId);
      const result =
        template.id === BLANK_TEMPLATE.id
          ? await renderAuthoringBody(clientId, template.body, {}, parties)
          : await renderAuthoringTemplate(template.id, clientId, {}, parties);
      setEditorText(result.renderedBody);
      setMissing(result.missingVariables);
      applySlotTarget(template, result.targetSlotLabel);
      setStep("edit");
    } catch {
      setOpenError("このひな形を開けませんでした。基本情報の取得に失敗した可能性があります。");
      setSelected(null);
    } finally {
      setLoading(false);
    }
  };

  const handleMerge = async () => {
    if (!editorText.trim()) return;
    setMerging(true);
    setActionError("");
    try {
      const result = await renderAuthoringBody(clientId, editorText, {}, currentParties());
      setEditorText(result.renderedBody);
      setMissing(result.missingVariables);
    } catch {
      setActionError("マスタの差し込みに失敗しました。");
    } finally {
      setMerging(false);
    }
  };

  const handlePartyChange = (slot: number, nextClientId: string) => {
    setPartyBindings((prev) => ({ ...prev, [slot]: nextClientId }));
  };

  const handleSave = async () => {
    if (!selected || !editorText.trim()) return;
    setSaving(true);
    setActionError("");
    setMessage("");
    try {
      let bodyText = editorText;
      if (countUnresolvedMergeFields(bodyText) > 0) {
        const merged = await renderAuthoringBody(clientId, bodyText, {}, currentParties());
        bodyText = merged.renderedBody;
        setEditorText(bodyText);
        setMissing(merged.missingVariables);
      }
      const title = selected.title.replace(/（.+）/, "").trim() || "文書";
      const blob = await exportAuthoringPdf({
        clientId,
        title: "",
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
                onClick={() => {
                  setOpenError("");
                  setStep("pick");
                }}
                className="text-[11px] font-bold text-indigo-600 hover:underline"
              >
                ひな形を選び直す
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              甲・乙を選んで保存すれば、正しい枠に入ります。送るときは保存後のシェアから。
            </p>
            <div className="mt-3 space-y-3 rounded-xl border border-slate-100 bg-slate-50/80 p-3">
              <PartyBinder
                clients={masterClients}
                partyCount={partyCount}
                bindings={partyBindings}
                onChange={handlePartyChange}
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={merging || unresolved === 0}
                  onClick={() => void handleMerge()}
                  className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-[11px] font-bold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                >
                  {merging ? "差し込み中…" : "マスタを差し込み"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowFields((v) => !v)}
                  className="text-[11px] font-bold text-slate-500 hover:underline"
                >
                  {showFields ? "項目リストを隠す" : "項目を足す"}
                </button>
                <span className="text-[10px] text-slate-500">
                  {unresolved > 0 ? `未差し込み ${unresolved} 件` : "差し込み済み"}
                </span>
              </div>
              {showFields ? (
                <MergeFieldPalette onInsert={(token) => editorRef.current?.insertText(token)} />
              ) : null}
            </div>
            {missing.length > 0 && (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                マスタに無い項目: {missing.map((v) => labelForVariable(v)).join("、")}
                {!isBuiltinVariable(missing[0] ?? "") && " — 本文内で直接追記するか、カルテのマスタを埋めてください"}
              </p>
            )}
            <AuthoringPageEditor ref={editorRef} value={editorText} onChange={setEditorText} />
            <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4">
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
                  disabled={saving || !editorText.trim()}
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
