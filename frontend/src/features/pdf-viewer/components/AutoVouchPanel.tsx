"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Check,
  ClipboardCheck,
  ExternalLink,
  Loader2,
  Target,
  X,
} from "lucide-react";
import {
  autoVouchStampFileUrl,
  fetchAutoVouchFields,
  openAutoVouchStampPreview,
  runAutoVouch,
  type AutoVouchFieldDef,
  type AutoVouchMatchedCoordinate,
} from "../lib/auto-vouch-api";
import {
  useAutoVouchBridgeStore,
  type AutoVouchAuditContext,
  type AuditPhase,
} from "../state/auto-vouch-bridge-store";
import { AuditFlowSteps } from "@/features/audit/components/AuditFlowSteps";
import { AuditApprovalBadge } from "@/features/audit/components/AuditApprovalBadge";
import type { AuditSide } from "../types";

type AutoVouchPanelProps = {
  versionId: string | null;
  userId: string;
  clientId?: string;
  defaultFieldId?: string;
  onMatchApplied: (side: AuditSide, match: AutoVouchMatchedCoordinate) => void;
  onVersionCreated?: (versionId: string) => void;
};

function AuditContextBanner({
  context,
  phase,
  onDismiss,
}: {
  context: AutoVouchAuditContext;
  phase: AuditPhase;
  onDismiss: () => void;
}) {
  const label =
    context.metricLabel ??
    context.fieldLabel ??
    context.fieldId;
  const doc = context.documentLabel ? ` → ${context.documentLabel}` : "";
  const stamped = phase === "stamped";
  const isCheck = context.fromMetricVouch !== false;

  return (
    <div
      className={[
        "flex min-w-0 flex-col gap-1 rounded-md border px-2 py-1 text-[10px]",
        stamped
          ? "border-emerald-500/50 bg-emerald-950/50 text-emerald-100"
          : isCheck
            ? "border-teal-500/40 bg-teal-950/60 text-teal-100"
            : "border-purple-500/40 bg-purple-950/60 text-purple-100",
      ].join(" ")}
    >
      <div className="flex min-w-0 items-center gap-2">
        <AuditApprovalBadge approval="none" className="shrink-0 !text-[7px]" />
        <span className="min-w-0 truncate">
          <strong className="font-bold text-white">{label}</strong>
          <span className={stamped ? "text-emerald-200" : "text-teal-200"}>
            {" "}
            {context.targetValue}
          </span>
          {doc ? (
            <span className={stamped ? "text-emerald-300" : "text-teal-300"}>{doc}</span>
          ) : null}
          {stamped ? (
            <span className="ml-1 font-bold text-emerald-300">— スタンプ済</span>
          ) : null}
        </span>
        <button
          type="button"
          onClick={onDismiss}
          className={`ml-auto shrink-0 rounded p-0.5 hover:bg-black/20 ${
            stamped
              ? "text-emerald-400 hover:text-white"
              : "text-teal-400 hover:text-white"
          }`}
          title="監査チェックのヒントを閉じる"
          aria-label="閉じる"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      {context.fromMetricVouch ? <AuditFlowSteps phase={phase} /> : null}
    </div>
  );
}

function ToggleChip({
  pressed,
  onClick,
  children,
  title,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={pressed}
      title={title}
      onClick={onClick}
      className={[
        "rounded px-2 py-0.5 text-[10px] font-semibold transition-colors",
        pressed
          ? "bg-teal-600 text-white"
          : "border border-slate-600 text-slate-300 hover:border-slate-500 hover:bg-slate-700",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export const AutoVouchPanel = ({
  versionId,
  userId,
  clientId,
  defaultFieldId = "acct.amount",
  onMatchApplied,
  onVersionCreated,
}: AutoVouchPanelProps) => {
  const activeContext = useAutoVouchBridgeStore((s) => s.activeContext);
  const auditPhase = useAutoVouchBridgeStore((s) => s.auditPhase);
  const clearActiveContext = useAutoVouchBridgeStore((s) => s.clearActiveContext);
  const setAuditPhase = useAutoVouchBridgeStore((s) => s.setAuditPhase);
  const markMetricStamped = useAutoVouchBridgeStore((s) => s.markMetricStamped);

  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<AutoVouchFieldDef[]>([]);
  const [targetValue, setTargetValue] = useState("");
  const [fieldId, setFieldId] = useState(defaultFieldId);
  const [contextHint, setContextHint] = useState("合計");
  const [side, setSide] = useState<AuditSide>("left");
  const [createVersion, setCreateVersion] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [lastStampId, setLastStampId] = useState<string | null>(null);

  useEffect(() => {
    if (!versionId) return;
    const prefill = useAutoVouchBridgeStore.getState().consumePrefill();
    if (!prefill) return;
    if (prefill.openPanel) setOpen(true);
    if (prefill.targetValue) setTargetValue(prefill.targetValue);
    if (prefill.fieldId) setFieldId(prefill.fieldId);
    if (prefill.contextHint) setContextHint(prefill.contextHint);
  }, [versionId]);

  useEffect(() => {
    if (!open) return;
    void fetchAutoVouchFields(clientId).then(setFields);
  }, [open, clientId]);

  useEffect(() => {
    const spec = fields.find((f) => f.field_id === fieldId);
    if (spec?.default_context_hint) {
      setContextHint(spec.default_context_hint);
    }
  }, [fieldId, fields]);

  const disabled = !versionId || busy;

  const execute = useCallback(
    async (opts: { dryRun: boolean; triggerOcr?: boolean }) => {
      if (!versionId) {
        setError("版が確定するまで監査チェックは使えません。");
        return;
      }
      if (!targetValue.trim()) {
        setError("チェックする数値を入力してください。");
        return;
      }
      setBusy(true);
      setError("");
      setMessage("");
      try {
        const result = await runAutoVouch(
          {
            version_id: versionId,
            target_value: targetValue.trim(),
            user_id: userId,
            field_id: fieldId.trim() || defaultFieldId,
            context_hint: contextHint.trim() || undefined,
            match_strategy: "best",
            dry_run: opts.dryRun,
            create_version: !opts.dryRun && createVersion,
            queue_on_ocr: Boolean(opts.triggerOcr),
            trigger_ocr: Boolean(opts.triggerOcr),
          },
          clientId,
        );
        if (result.status !== "success" || !result.matched_coordinates?.length) {
          if (result.ocr_recommended && result.queue_id) {
            setMessage(result.message);
            if (result.ocr_job_id) {
              setMessage((m) => `${m} OCR ジョブ: ${result.ocr_job_id}`);
            }
            return;
          }
          setError(result.message || "マッチしませんでした。");
          return;
        }
        const match = result.matched_coordinates[0];
        const previewNote =
          result.total_matches_found && result.total_matches_found > 1
            ? `（全 ${result.total_matches_found} 件中 1 件）`
            : "";
        const sourceNote = result.match_source === "ocr_text" ? " [OCR]" : "";
        if (opts.dryRun) {
          setAuditPhase("preview");
          setMessage(`位置確認: P${match.page}「${match.matched_text}」${previewNote}${sourceNote}`);
        } else {
          setAuditPhase("stamped");
          const ctx = useAutoVouchBridgeStore.getState().activeContext;
          const stampKey =
            ctx?.pendingKey ??
            ctx?.metricKey ??
            useAutoVouchBridgeStore.getState().pendingMetricKey;
          if (stampKey) markMetricStamped(stampKey);
          setMessage(`スタンプ完了${previewNote}${sourceNote}`);
          if (result.stamp_id) setLastStampId(result.stamp_id);
          if (result.new_version_id) {
            onVersionCreated?.(result.new_version_id);
          }
        }
        onMatchApplied(side, match);
      } catch {
        setError("監査チェックに失敗しました。バックエンドの起動を確認してください。");
      } finally {
        setBusy(false);
      }
    },
    [
      versionId,
      targetValue,
      userId,
      fieldId,
      defaultFieldId,
      contextHint,
      clientId,
      side,
      createVersion,
      onMatchApplied,
      onVersionCreated,
      setAuditPhase,
      markMetricStamped,
    ],
  );

  const closePanel = () => {
    setOpen(false);
    setMessage("");
    setError("");
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!versionId}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-teal-500/50 bg-teal-950/40 px-2 py-1 text-[11px] font-bold text-teal-200 hover:border-teal-400 hover:bg-teal-900/50 disabled:opacity-40"
        title={versionId ? "PDF 上の数値を照合（承認不要）" : "版確定後に利用可能"}
      >
        <ClipboardCheck className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">監査チェック</span>
      </button>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5 border-l border-slate-600 py-1 pl-2">
      {activeContext ? (
        <AuditContextBanner
          context={activeContext}
          phase={auditPhase}
          onDismiss={clearActiveContext}
        />
      ) : null}

      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <Target className="h-3.5 w-3.5 shrink-0 text-teal-400" aria-hidden />
        <AuditApprovalBadge approval="none" className="!text-[7px]" />
        <span className="hidden text-[10px] font-bold text-slate-400 sm:inline">数値照合</span>

        <input
          type="text"
          value={targetValue}
          onChange={(e) => setTargetValue(e.target.value)}
          placeholder="数値"
          aria-label="チェックする数値"
          className="w-[4.5rem] rounded border border-slate-600 bg-slate-900 px-2 py-1 text-[11px] text-white placeholder:text-slate-500"
        />
        <select
          value={fieldId}
          onChange={(e) => setFieldId(e.target.value)}
          className="max-w-[6.5rem] rounded border border-slate-600 bg-slate-900 px-1 py-1 text-[11px] text-white"
          title="監査科目"
          aria-label="監査科目"
        >
          {fields.length > 0 ? (
            fields.map((f) => (
              <option key={f.field_id} value={f.field_id}>
                {f.label}
              </option>
            ))
          ) : (
            <option value={fieldId}>{fieldId}</option>
          )}
        </select>
        <input
          type="text"
          value={contextHint}
          onChange={(e) => setContextHint(e.target.value)}
          placeholder="近傍語"
          aria-label="近傍語"
          className="hidden w-14 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-[11px] text-white sm:block"
        />

        <div className="flex items-center gap-0.5 rounded border border-slate-600 p-0.5">
          <ToggleChip
            pressed={side === "left"}
            onClick={() => setSide("left")}
            title="左ペインにチェックポイント"
          >
            左
          </ToggleChip>
          <ToggleChip
            pressed={side === "right"}
            onClick={() => setSide("right")}
            title="右ペインにチェックポイント"
          >
            右
          </ToggleChip>
        </div>

        <ToggleChip
          pressed={createVersion}
          onClick={() => setCreateVersion((v) => !v)}
          title="スタンプ後に新版を登録"
        >
          新版
        </ToggleChip>

        <button
          type="button"
          disabled={disabled}
          onClick={() => void execute({ dryRun: true })}
          className="rounded border border-slate-500 px-2 py-0.5 text-[10px] text-slate-200 hover:bg-slate-700 disabled:opacity-40"
        >
          位置確認
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => void execute({ dryRun: false })}
          className="inline-flex items-center gap-1 rounded bg-teal-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-teal-500 disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          スタンプ
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => void execute({ dryRun: false, triggerOcr: true })}
          className="rounded border border-purple-700 px-2 py-0.5 text-[10px] text-purple-200 hover:bg-slate-700 disabled:opacity-40"
          title="スキャン PDF: OCR 後に自動再試行"
        >
          OCR
        </button>

        <button
          type="button"
          onClick={closePanel}
          className="rounded p-0.5 text-slate-400 hover:bg-slate-700 hover:text-white"
          aria-label="パネルを閉じる"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        {message ? (
          <span className="min-w-0 truncate text-[10px] text-emerald-400">{message}</span>
        ) : null}
        {lastStampId ? (
          <button
            type="button"
            onClick={() => void openAutoVouchStampPreview(lastStampId, clientId)}
            className="inline-flex items-center gap-0.5 text-[10px] text-sky-300 hover:text-sky-200"
            title="スタンプ済み PDF を開く"
          >
            <ExternalLink className="h-3 w-3" />
            PDF
          </button>
        ) : null}
        {error ? <span className="min-w-0 truncate text-[10px] text-red-400">{error}</span> : null}
      </div>
    </div>
  );
};
