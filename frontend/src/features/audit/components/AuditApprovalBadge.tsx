"use client";

import type { AuditApprovalRequirement } from "@/features/audit/lib/audit-action-policy";

type Props = {
  approval: AuditApprovalRequirement;
  className?: string;
};

/** 操作が承認要否かを示す小さなバッジ */
export function AuditApprovalBadge({ approval, className = "" }: Props) {
  const isRequired = approval === "required";
  return (
    <span
      className={[
        "inline-flex items-center rounded px-1 py-px text-[8px] font-bold uppercase tracking-wide",
        isRequired
          ? "bg-indigo-100 text-indigo-800 ring-1 ring-indigo-200"
          : "bg-teal-100 text-teal-800 ring-1 ring-teal-200",
        className,
      ].join(" ")}
    >
      {isRequired ? "承認必要" : "承認不要"}
    </span>
  );
}

type AuditActionLegendProps = {
  className?: string;
};

/** CHARTS 等 — 承認不要/必要の 2 系統を並べて説明 */
export function AuditActionLegend({ className = "" }: AuditActionLegendProps) {
  return (
    <div className={`grid gap-2 sm:grid-cols-2 ${className}`}>
      <div className="rounded-lg border border-teal-200 bg-teal-50/90 px-3 py-2 text-[10px] text-teal-950">
        <div className="mb-1 flex items-center gap-1.5">
          <AuditApprovalBadge approval="none" />
          <span className="font-bold">数値照合（監査チェック）</span>
        </div>
        <p className="leading-relaxed text-teal-900/90">
          指標横の「監査」を押すと証憑 PDF が開き、数値の自動検索が始まります。
          <strong className="font-bold"> 承認フローは進みません。</strong>
        </p>
      </div>
      <div className="rounded-lg border border-indigo-200 bg-indigo-50/90 px-3 py-2 text-[10px] text-indigo-950">
        <div className="mb-1 flex items-center gap-1.5">
          <AuditApprovalBadge approval="required" />
          <span className="font-bold">正式監査（マトリクス）</span>
        </div>
        <p className="leading-relaxed text-indigo-900/90">
          資料カードの「監査する」→「承認依頼」→ 承認者の「監査開始」→「承認」で確定します。
        </p>
      </div>
    </div>
  );
}
