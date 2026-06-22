"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Calendar,
  Check,
  ExternalLink,
  Loader2,
  Pin,
  Sparkles,
} from "lucide-react";
import { SsotEditToolbar } from "@/features/client-data/components/SsotEditToolbar";
import {
  captureItemImageUrl,
  routeCaptureToMatrix,
  applyCaptureToPayroll,
  analyzeCaptureItem,
  reauditCaptureItem,
  type CaptureManualHints,
} from "@/features/capture/lib/capture-api";
import type { CaptureCategory, CaptureItem } from "@/features/capture/types";
import { propagateSlotNormalizeResult } from "@/features/org/org-directory-events";
import { buildAuthHeaders, mergeAuthInit } from "@/lib/api-auth";

type Props = {
  item: CaptureItem;
  clientId: string;
  onConfirm?: (item: CaptureItem) => void;
  onRouted?: (item: CaptureItem) => void;
};

const STATUS_STYLES: Record<
  CaptureItem["status"],
  { ring: string; opacity: string; label: string }
> = {
  processing: {
    ring: "ring-2 ring-slate-300",
    opacity: "opacity-100",
    label: "未解析",
  },
  ok: {
    ring: "ring-2 ring-emerald-300/60",
    opacity: "opacity-55 saturate-[0.85]",
    label: "OK",
  },
  needs_review: {
    ring: "ring-2 ring-rose-400 shadow-lg shadow-rose-100",
    opacity: "opacity-100",
    label: "要確認",
  },
  confirmed: {
    ring: "ring-2 ring-emerald-500/40",
    opacity: "opacity-35",
    label: "確認済",
  },
};

function formatYen(n?: number | null): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("ja-JP").format(n) + "円";
}

function hintsFromAmount(category: CaptureCategory, amount: number): CaptureManualHints {
  if (category === "expense") return { total_yen: amount };
  if (category === "deduction_cert" || category === "marufu") return { proof_yen: amount };
  return { total_yen: amount };
}

function numInput(value: number | null | undefined): string {
  return value != null && value > 0 ? String(value) : "";
}

export function CaptureCard({ item, clientId, onConfirm, onRouted }: Props) {
  const style = STATUS_STYLES[item.status];
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [routing, setRouting] = useState(false);
  const [applying, setApplying] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [triggerAmount, setTriggerAmount] = useState("");
  const [editTotal, setEditTotal] = useState("");
  const [editAttendees, setEditAttendees] = useState("");
  const [editProof, setEditProof] = useState("");
  const [editDeclared, setEditDeclared] = useState("");
  const [editDependent, setEditDependent] = useState("");
  const [editRegNo, setEditRegNo] = useState("");
  const [reauditEditing, setReauditEditing] = useState(false);
  const [reauditSaving, setReauditSaving] = useState(false);

  const meta = item.metadata;
  const classify = meta?.classify;
  const expense = meta?.expense_context;
  const deduction = meta?.deduction_audit;
  const invoice = meta?.invoice_audit;
  const marufu = meta?.marufu_parsed;
  const canRoute = Boolean(item.period_key && item.slot_id) && item.status !== "confirmed";
  const canApplyPayroll =
    (item.category === "marufu" || item.category === "deduction_cert") &&
    item.status !== "confirmed" &&
    Boolean(marufu || deduction);

  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;
    void (async () => {
      try {
        const res = await fetch(
          captureItemImageUrl(item.id),
          mergeAuthInit({ headers: buildAuthHeaders(clientId) }),
        );
        if (!res.ok) throw new Error("load failed");
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!revoked) setBlobUrl(objectUrl);
      } catch {
        if (!revoked) setLoadError(true);
      }
    })();
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [item.id, clientId]);

  useEffect(() => {
    const hints = item.metadata?.manual_hints;
    setEditTotal(numInput(hints?.total_yen ?? expense?.total_yen));
    setEditAttendees(numInput(hints?.attendees ?? expense?.calendar_match?.attendees));
    setEditProof(numInput(hints?.proof_yen ?? deduction?.proof_yen));
    setEditDeclared(numInput(hints?.declared_yen ?? deduction?.declared_yen));
    setEditDependent(numInput(hints?.dependent_count ?? marufu?.dependent_count));
    setEditRegNo(hints?.registration_number ?? invoice?.registration_number ?? "");
  }, [item.id, item.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  const runAnalyze = useCallback(
    async (hints?: CaptureManualHints) => {
      setAnalyzing(true);
      try {
        const result = await analyzeCaptureItem(item.id, clientId, hints);
        onRouted?.(result);
      } finally {
        setAnalyzing(false);
      }
    },
    [clientId, item.id, onRouted],
  );

  const runReaudit = useCallback(
    async (overrides: CaptureManualHints) => {
      if (Object.keys(overrides).length === 0) return;
      setReauditSaving(true);
      try {
        const result = await reauditCaptureItem(item.id, overrides, clientId);
        onRouted?.(result);
        setReauditEditing(false);
      } finally {
        setReauditSaving(false);
      }
    },
    [clientId, item.id, onRouted],
  );

  const buildReauditHints = (): CaptureManualHints => {
    const hints: CaptureManualHints = {};
    if (item.category === "expense") {
      const total = Number(editTotal);
      const attendees = Number(editAttendees);
      if (editTotal.trim() && Number.isFinite(total) && total > 0) hints.total_yen = total;
      if (editAttendees.trim() && Number.isFinite(attendees) && attendees > 0) {
        hints.attendees = attendees;
      }
      const v = editRegNo.trim();
      if (v.length >= 14) hints.registration_number = v;
    }
    if (item.category === "deduction_cert" || item.category === "marufu") {
      const proof = Number(editProof);
      const declared = Number(editDeclared);
      const dependent = Number(editDependent);
      if (editProof.trim() && Number.isFinite(proof) && proof >= 0) hints.proof_yen = proof;
      if (editDeclared.trim() && Number.isFinite(declared) && declared >= 0) {
        hints.declared_yen = declared;
      }
      if (
        item.category === "marufu" &&
        editDependent.trim() &&
        Number.isFinite(dependent) &&
        dependent >= 0
      ) {
        hints.dependent_count = dependent;
      }
    }
    return hints;
  };

  const startReauditEdit = () => {
    const hints = item.metadata?.manual_hints;
    setEditTotal(numInput(hints?.total_yen ?? expense?.total_yen));
    setEditAttendees(numInput(hints?.attendees ?? expense?.calendar_match?.attendees));
    setEditProof(numInput(hints?.proof_yen ?? deduction?.proof_yen));
    setEditDeclared(numInput(hints?.declared_yen ?? deduction?.declared_yen));
    setEditDependent(numInput(hints?.dependent_count ?? marufu?.dependent_count));
    setEditRegNo(hints?.registration_number ?? invoice?.registration_number ?? "");
    setReauditEditing(true);
  };

  const cancelReauditEdit = () => {
    const hints = item.metadata?.manual_hints;
    setEditTotal(numInput(hints?.total_yen ?? expense?.total_yen));
    setEditAttendees(numInput(hints?.attendees ?? expense?.calendar_match?.attendees));
    setEditProof(numInput(hints?.proof_yen ?? deduction?.proof_yen));
    setEditDeclared(numInput(hints?.declared_yen ?? deduction?.declared_yen));
    setEditDependent(numInput(hints?.dependent_count ?? marufu?.dependent_count));
    setEditRegNo(hints?.registration_number ?? invoice?.registration_number ?? "");
    setReauditEditing(false);
  };

  const handleTriggerAmountChange = (raw: string) => {
    setTriggerAmount(raw);
  };

  const handleAnalyzeClick = () => {
    const n = Number(triggerAmount);
    const hints =
      triggerAmount.trim() !== "" && Number.isFinite(n) && n > 0
        ? hintsFromAmount(item.category, n)
        : undefined;
    void runAnalyze(hints);
  };

  const handleRoute = async () => {
    if (!item.period_key || !item.slot_id) return;
    setRouting(true);
    try {
      const result = await routeCaptureToMatrix(item.id, clientId, {
        periodKey: item.period_key,
        slotId: item.slot_id,
        slotLabel: item.title ?? undefined,
      });
      propagateSlotNormalizeResult(clientId, result.slot.normalize_result);
      onRouted?.(result.capture);
    } finally {
      setRouting(false);
    }
  };

  const handleApplyPayroll = async () => {
    setApplying(true);
    try {
      const result = await applyCaptureToPayroll(item.id, clientId);
      onRouted?.(result.capture);
    } finally {
      setApplying(false);
    }
  };

  return (
    <article
      className={`capture-card mb-4 break-inside-avoid overflow-hidden rounded-xl bg-white transition-all ${style.ring} ${style.opacity} ${
        item.pinned ? "order-first" : ""
      }`}
    >
      <div className="relative aspect-[3/4] w-full bg-slate-100">
        {blobUrl && !loadError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={blobUrl}
            alt={item.file_name}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : loadError ? (
          <div className="flex h-full items-center justify-center text-xs text-slate-400">
            プレビュー不可
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
          </div>
        )}
        {item.pinned ? (
          <span className="absolute left-2 top-2 rounded-full bg-rose-500 p-1 text-white shadow">
            <Pin className="h-3 w-3" />
          </span>
        ) : null}
        <span
          className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            item.status === "needs_review"
              ? "bg-rose-500 text-white"
              : item.status === "processing"
                ? "bg-slate-600 text-white"
                : item.status === "ok"
                  ? "bg-emerald-500/90 text-white"
                  : "bg-slate-500/80 text-white"
          }`}
        >
          {style.label}
        </span>
      </div>

      <div className="space-y-2 px-3 py-2">
        <p className="truncate text-xs font-medium text-slate-800">
          {item.title || item.file_name}
        </p>

        {classify?.best ? (
          <p className="flex items-center gap-1 text-[11px] text-sky-700">
            <Sparkles className="h-3 w-3 shrink-0" />
            {classify.best.label}
            {classify.confidence != null ? (
              <span className="text-slate-400">
                ({Math.round(classify.confidence * 100)}%)
              </span>
            ) : null}
          </p>
        ) : null}

        {expense?.suggestion_text ? (
          <p className="flex items-start gap-1 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
            <Calendar className="mt-0.5 h-3 w-3 shrink-0" />
            {expense.suggestion_text}
          </p>
        ) : null}

        {expense?.total_yen != null ? (
          <p className="text-[11px] text-slate-500">
            合計 {formatYen(expense.total_yen)}
            {expense.per_person_yen != null
              ? ` · 1人 ${formatYen(expense.per_person_yen)}`
              : null}
          </p>
        ) : null}

        {invoice?.registration_number ? (
          <p
            className={`text-[11px] ${
              invoice.checksum_valid && invoice.registration_status === "active"
                ? "text-emerald-700"
                : "text-rose-600"
            }`}
          >
            登録番号 {invoice.registration_number}
            {invoice.issuer_name ? ` · ${invoice.issuer_name}` : ""}
            {invoice.checksum_valid === false ? " · チェックデジット NG" : ""}
          </p>
        ) : null}

        {marufu?.dependent_count != null ? (
          <p className="text-[11px] text-slate-600">
            扶養 {marufu.dependent_count}人
            {marufu.spouse_deduction ? " · 配偶者控除" : ""}
            {marufu.spouse_special_deduction ? " · 配偶者特別控除" : ""}
          </p>
        ) : null}

        {deduction?.proof_yen != null ? (
          <p className="text-[11px] text-slate-600">
            証明額 {formatYen(deduction.proof_yen)}
            {deduction.declared_yen != null
              ? ` / 申告 ${formatYen(deduction.declared_yen)}`
              : null}
          </p>
        ) : null}

        {item.audit_message ? (
          <p className="flex items-start gap-1 text-[11px] text-rose-600">
            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
            {item.audit_message}
          </p>
        ) : null}

        {(meta?.suggestions ?? []).slice(0, 1).map((s) => (
          <p key={s} className="text-[11px] text-emerald-700">
            {s}
          </p>
        ))}

        {item.status !== "processing" && item.status !== "confirmed" ? (
          <div className="space-y-1 rounded-md border border-slate-100 bg-slate-50 px-2 py-2">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <p className="text-[10px] font-medium text-slate-600">数字の修正・再監査</p>
              <SsotEditToolbar
                isEditing={reauditEditing}
                canEdit
                saving={reauditSaving}
                onStart={startReauditEdit}
                onCommit={() => void runReaudit(buildReauditHints())}
                onCancel={cancelReauditEdit}
                className="!px-2 !py-1 text-[10px]"
              />
            </div>
            {item.category === "expense" ? (
              <>
                <input
                  type="number"
                  min={0}
                  placeholder="合計金額"
                  className="w-full rounded border border-slate-200 px-2 py-1 text-[11px]"
                  value={editTotal}
                  disabled={!reauditEditing}
                  onChange={(e) => setEditTotal(e.target.value)}
                />
                <input
                  type="number"
                  min={1}
                  placeholder="参加人数"
                  className="w-full rounded border border-slate-200 px-2 py-1 text-[11px]"
                  value={editAttendees}
                  disabled={!reauditEditing}
                  onChange={(e) => setEditAttendees(e.target.value)}
                />
                <input
                  type="text"
                  placeholder="登録番号 T+13桁"
                  className="w-full rounded border border-slate-200 px-2 py-1 text-[11px]"
                  value={editRegNo}
                  disabled={!reauditEditing}
                  onChange={(e) => setEditRegNo(e.target.value)}
                />
              </>
            ) : null}
            {item.category === "deduction_cert" || item.category === "marufu" ? (
              <>
                <input
                  type="number"
                  min={0}
                  placeholder="証明額"
                  className="w-full rounded border border-slate-200 px-2 py-1 text-[11px]"
                  value={editProof}
                  disabled={!reauditEditing}
                  onChange={(e) => setEditProof(e.target.value)}
                />
                <input
                  type="number"
                  min={0}
                  placeholder="申告額"
                  className="w-full rounded border border-slate-200 px-2 py-1 text-[11px]"
                  value={editDeclared}
                  disabled={!reauditEditing}
                  onChange={(e) => setEditDeclared(e.target.value)}
                />
                {item.category === "marufu" ? (
                  <input
                    type="number"
                    min={0}
                    placeholder="扶養人数"
                    className="w-full rounded border border-slate-200 px-2 py-1 text-[11px]"
                    value={editDependent}
                    disabled={!reauditEditing}
                    onChange={(e) => setEditDependent(e.target.value)}
                  />
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}

        {item.status === "processing" ? (
          <div className="space-y-1 rounded-md bg-slate-50 px-2 py-2">
            <label className="block text-[10px] font-medium text-slate-600">
              金額を入力して「解析する」
            </label>
            <input
              type="number"
              min={0}
              placeholder="例: 120000"
              className="w-full rounded border border-slate-200 px-2 py-1 text-[11px]"
              value={triggerAmount}
              disabled={analyzing}
              onChange={(e) => handleTriggerAmountChange(e.target.value)}
            />
            <button
              type="button"
              disabled={analyzing}
              className="inline-flex w-full items-center justify-center gap-1 rounded-md bg-slate-800 px-2 py-1.5 text-[11px] font-medium text-white hover:bg-slate-900 disabled:opacity-50"
              onClick={handleAnalyzeClick}
            >
              {analyzing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              解析する
            </button>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-1 pt-1">
          {canApplyPayroll ? (
            <button
              type="button"
              disabled={applying}
              className="inline-flex items-center gap-1 rounded-md bg-violet-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-violet-700 disabled:opacity-50"
              onClick={() => void handleApplyPayroll()}
            >
              {applying ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              源泉台帳へ
            </button>
          ) : null}
          {canRoute ? (
            <button
              type="button"
              disabled={routing}
              className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-sky-700 disabled:opacity-50"
              onClick={() => void handleRoute()}
            >
              {routing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <ExternalLink className="h-3 w-3" />
              )}
              マトリクスへ
            </button>
          ) : null}
          {item.status !== "confirmed" && item.status !== "processing" ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-200"
              onClick={() => onConfirm?.(item)}
            >
              <Check className="h-3 w-3" />
              確認済
            </button>
          ) : null}
        </div>

        {item.period_key && item.slot_id ? (
          <p className="text-[10px] text-slate-400">
            → {item.period_key} / {item.slot_id}
          </p>
        ) : null}
      </div>
    </article>
  );
}
