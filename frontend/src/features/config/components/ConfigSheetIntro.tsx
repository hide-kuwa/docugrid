"use client";

import type { ConfigSheetId } from "../lib/cell-address";

type Props = {
  sheetId: ConfigSheetId;
  sheetLabel: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
};

export function ConfigSheetIntro({ sheetId, sheetLabel, title, description, actions }: Props) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          <span className="rounded bg-blue-50 px-2 py-0.5 font-mono text-[10px] font-bold text-blue-700">
            {sheetLabel}
          </span>
          <span className="font-mono text-[10px] text-slate-400">{sheetId}</span>
        </div>
        <h2 className="mt-1 text-lg font-bold text-slate-800">{title}</h2>
        {description && <p className="mt-1 text-xs text-slate-500">{description}</p>}
      </div>
      {actions}
    </div>
  );
}
