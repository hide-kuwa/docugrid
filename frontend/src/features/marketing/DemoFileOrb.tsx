"use client";

import { FileText } from "lucide-react";

type Props = {
  label: string;
  sublabel?: string;
  size?: "md" | "lg";
  variant?: "idle" | "used" | "filled" | "dragging";
  className?: string;
};

const ORB_SIZE = {
  md: "h-[72px] w-[72px]",
  lg: "h-[88px] w-[88px]",
} as const;

const ICON_SIZE = {
  md: "h-9 w-9",
  lg: "h-11 w-11",
} as const;

const VARIANT_CLASS = {
  idle: "border-blue-300/90 bg-gradient-to-b from-white to-blue-50 text-blue-600 demo-orb-shine",
  used: "border-slate-100 bg-slate-50 text-slate-300 shadow-none",
  filled: "border-emerald-300 bg-gradient-to-b from-white to-emerald-50 text-blue-600 demo-orb-shine-filled",
  dragging: "border-blue-400 bg-white text-blue-600 scale-110 demo-orb-shine",
} as const;

export function DemoFileOrb({ label, sublabel, size = "md", variant = "idle", className = "" }: Props) {
  const showHalo = variant === "idle" || variant === "filled" || variant === "dragging";

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <div className="relative">
        {showHalo ? (
          <div
            className={`demo-orb-halo ${variant === "filled" ? "demo-orb-halo-intense" : ""}`}
            aria-hidden
          />
        ) : null}
        <div
          className={`relative z-10 flex shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200 ${ORB_SIZE[size]} ${VARIANT_CLASS[variant]}`}
        >
          <div
            className="absolute inset-1 rounded-full bg-gradient-to-br from-blue-400/10 to-indigo-500/20"
            aria-hidden
          />
          <FileText className={`relative z-10 drop-shadow-[0_0_8px_rgba(59,130,246,0.5)] ${ICON_SIZE[size]} stroke-[1.75]`} aria-hidden />
          {variant === "filled" ? (
            <span className="absolute -bottom-0.5 -right-0.5 z-20 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400 text-[10px] font-bold text-white shadow-[0_0_12px_rgba(52,211,153,0.9)]">
              ✓
            </span>
          ) : null}
        </div>
      </div>
      <div className="max-w-[88px] text-center">
        <p
          className={`truncate text-[11px] font-bold leading-tight ${
            variant === "used" ? "text-slate-300" : variant === "filled" ? "text-emerald-700" : "text-slate-700"
          }`}
        >
          {label}
        </p>
        {sublabel ? (
          <p
            className={`mt-0.5 truncate text-[9px] ${
              variant === "used" ? "text-slate-200" : variant === "filled" ? "text-emerald-500" : "text-slate-400"
            }`}
          >
            {sublabel}
          </p>
        ) : null}
      </div>
    </div>
  );
}
