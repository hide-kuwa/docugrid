"use client";

import type { ReactNode } from "react";

type Props = {
  caption?: string;
  children: ReactNode;
  className?: string;
};

/** Sticky-header spreadsheet shell — main-page tonmana (white card, slate grid). */
export function ConfigMatrixTable({ caption, children, className = "" }: Props) {
  return (
    <div
      className={`overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}
    >
      {caption && (
        <div className="border-b border-slate-100 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          {caption}
        </div>
      )}
      <table className="min-w-full border-collapse text-left text-[11px] text-slate-700">
        {children}
      </table>
    </div>
  );
}

export function ConfigMatrixHead({ children }: { children: ReactNode }) {
  return (
    <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] font-black uppercase tracking-wide text-slate-500">
      {children}
    </thead>
  );
}

export function ConfigMatrixTh({
  children,
  className = "",
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <th className={`border-b border-slate-200 px-3 py-2 ${className}`} title={title}>
      {children}
    </th>
  );
}

export function ConfigMatrixTd({
  children,
  className = "",
  title,
  cellAddress,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  /** Shown on hover as spreadsheet coordinate hint */
  cellAddress?: string;
}) {
  return (
    <td
      className={`border-b border-slate-100 px-3 py-2 align-middle ${className}`}
      title={cellAddress ?? title}
    >
      {children}
    </td>
  );
}
