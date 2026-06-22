"use client";

import { Check, ClipboardCheck, Loader2 } from "lucide-react";

type Props = {
  metricLabel: string;
  tag?: string;
  disabled?: boolean;
  loading?: boolean;
  active?: boolean;
  completed?: boolean;
  onActivate: () => void;
};

/**
 * 承認不要の数値照合トグル（teal）。
 * 正式監査（indigo / マトリクス「監査する」）とは色で区別。
 */
export function AuditCheckToggle({
  metricLabel,
  tag,
  disabled,
  loading,
  active,
  completed,
  onActivate,
}: Props) {
  const pressed = active || loading;
  const title = completed
    ? `${metricLabel} — スタンプ済（再チェック可・承認フローは別途）`
    : loading
      ? "証憑を開いています…"
      : `${metricLabel}を PDF 上で照合（承認不要）`;

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={pressed}
      aria-busy={loading}
      disabled={disabled || loading}
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onActivate();
      }}
      className={[
        "group inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-bold transition-all",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-500",
        pressed
          ? "border-teal-600 bg-teal-600 text-white shadow-sm"
          : completed
            ? "border-emerald-400 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
            : "border-teal-200 bg-white text-teal-900 hover:border-teal-400 hover:bg-teal-50",
        disabled ? "cursor-not-allowed opacity-40" : "",
      ].join(" ")}
    >
      <span
        className={[
          "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border transition-colors",
          pressed
            ? "border-white/40 bg-white/20"
            : completed
              ? "border-emerald-500 bg-emerald-100"
              : "border-teal-300 bg-teal-50 group-hover:border-teal-400",
        ].join(" ")}
        aria-hidden
      >
        {loading ? (
          <Loader2 className="h-2.5 w-2.5 animate-spin" />
        ) : pressed || completed ? (
          <Check className={`h-2.5 w-2.5 stroke-[3] ${completed && !pressed ? "text-emerald-600" : ""}`} />
        ) : (
          <ClipboardCheck className="h-2.5 w-2.5 text-teal-600" />
        )}
      </span>
      <span className="whitespace-nowrap">
        {tag ? <span className="opacity-90">{tag} </span> : null}
        {completed && !pressed ? "照合済" : "監査"}
      </span>
    </button>
  );
}
