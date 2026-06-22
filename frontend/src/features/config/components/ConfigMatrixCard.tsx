"use client";

import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  cellAddress?: string;
  className?: string;
};

/** White card with main-page left accent — for single-row config cells. */
export function ConfigMatrixCard({ children, cellAddress, className = "" }: Props) {
  return (
    <article
      className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm border-l-4 border-l-blue-600 ${className}`}
      title={cellAddress}
    >
      {children}
    </article>
  );
}
