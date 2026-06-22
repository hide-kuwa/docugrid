"use client";

import { Folder } from "lucide-react";
import { DEMO_CLIENTS, DEMO_PERIODS } from "./demo-scenario";

type NavProps = {
  activeClientIdx: number;
  onClientChange: (idx: number) => void;
};

export function DemoMatrixNav({ activeClientIdx, onClientChange }: NavProps) {
  return (
    <nav className="relative z-10 flex h-14 flex-shrink-0 select-none border-b border-slate-700 bg-slate-900 shadow-lg">
      <div className="pointer-events-none absolute bottom-0 left-1/2 z-0 h-full w-32 -translate-x-1/2 border-x border-white/10 bg-white/5" />
      <div className="relative z-10 flex w-28 flex-shrink-0 items-center px-3">
        <span className="text-sm font-black italic tracking-tighter text-white">
          <span className="text-blue-500">Docu</span>Grid
        </span>
      </div>
      <div className="no-scrollbar relative z-10 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-2">
        {DEMO_CLIENTS.map((client, idx) => (
          <button
            key={client.id}
            type="button"
            onClick={() => onClientChange(idx)}
            className={`h-item flex shrink-0 cursor-pointer flex-col items-center justify-center rounded-lg px-4 py-1 ${
              idx === activeClientIdx ? "active" : ""
            }`}
          >
            <div className="flex items-center gap-1">
              <Folder className="h-3.5 w-3.5 shrink-0 text-blue-400" aria-hidden />
              <span className="h-item-name whitespace-nowrap text-sm">{client.name}</span>
            </div>
            <span className="text-[9px] text-slate-400">{client.fiscal}月決算</span>
          </button>
        ))}
      </div>
      <div className="mask-h-right pointer-events-none absolute right-0 top-0 z-20 h-full w-16" />
    </nav>
  );
}

type SidebarProps = {
  activePeriodIdx: number;
  onPeriodChange: (idx: number) => void;
};

export function DemoMatrixSidebar({ activePeriodIdx, onPeriodChange }: SidebarProps) {
  return (
    <aside className="relative z-10 flex w-[4.5rem] flex-shrink-0 select-none flex-col border-r border-slate-700 bg-slate-900 shadow-lg md:w-20">
      <div className="pointer-events-none absolute left-0 top-1/2 z-0 h-16 w-full -translate-y-1/2 border-y border-white/10 bg-white/5" />
      <div className="absolute left-1/2 top-2 z-20 -translate-x-1/2">
        <span className="text-[8px] font-black tracking-widest text-green-500">MONTH</span>
      </div>
      <div className="no-scrollbar relative z-10 flex flex-1 flex-col items-center justify-center gap-3 overflow-y-auto py-6">
        {DEMO_PERIODS.map((label, idx) => (
          <button
            key={label}
            type="button"
            onClick={() => onPeriodChange(idx)}
            className={`v-item w-full py-2 text-center text-white ${idx === activePeriodIdx ? "active" : ""}`}
          >
            <div className="text-xl font-black tracking-tighter">{label}</div>
            <div className="text-[8px] font-bold opacity-60">MONTH</div>
          </button>
        ))}
      </div>
      <div className="mask-v-top pointer-events-none absolute left-0 top-0 z-20 h-10 w-full" />
      <div className="mask-v-bottom pointer-events-none absolute bottom-0 left-0 z-20 h-10 w-full" />
    </aside>
  );
}

type HeaderProps = {
  clientIdx: number;
  periodIdx: number;
  filledCount: number;
  slotCount: number;
  isPlayCell: boolean;
};

export function DemoMatrixHeader({ clientIdx, periodIdx, filledCount, slotCount, isPlayCell }: HeaderProps) {
  const client = DEMO_CLIENTS[clientIdx];
  const period = DEMO_PERIODS[periodIdx];
  const progress = slotCount > 0 ? Math.round((filledCount / slotCount) * 100) : 0;

  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white/80 px-4 py-2 backdrop-blur">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">CLIENT</span>
          <span className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">
            {client.fiscal}月決算
          </span>
        </div>
        <div className="text-base font-bold text-slate-800">
          <span className="mr-2 text-green-500">{period}</span>
          月次監査
          <span className="ml-2 text-sm font-semibold text-slate-500">— {client.name}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white/70 px-2 py-1">
        <span className="text-sm font-black tabular-nums text-blue-600">{progress}%</span>
        <div className="relative flex h-8 w-8 items-center justify-center">
          <svg className="h-8 w-8 -rotate-90 transform" aria-hidden>
            <circle cx="16" cy="16" r="12" stroke="#e2e8f0" strokeWidth="3" fill="transparent" />
            <circle
              cx="16"
              cy="16"
              r="12"
              stroke="#3b82f6"
              strokeWidth="3"
              fill="transparent"
              strokeDasharray="75.4"
              strokeDashoffset={75.4 - (75.4 * progress) / 100}
              className="transition-all duration-500"
            />
          </svg>
        </div>
      </div>
      {!isPlayCell ? (
        <p className="w-full text-[10px] font-semibold text-amber-600">
          顧問先・月は自由に切り替え可能。資料の配置は「株式会社A × 3月」で試せます（丸資料をクリックでも移動）。
        </p>
      ) : null}
    </header>
  );
}
