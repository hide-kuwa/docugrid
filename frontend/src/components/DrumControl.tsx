// src/components/DrumControl.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { clsx } from "clsx";

type DrumItem = {
  id: string | number;
  label: string;
};

// 年データのダミー
const years: DrumItem[] = Array.from({ length: 10 }, (_, i) => ({
  id: 2025 - i,
  label: `${2025 - i}年`,
}));

// 月データのダミー
const months: DrumItem[] = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1,
  label: `${i + 1}月`,
}));

export default function DrumControl() {
  const [activeYear, setActiveYear] = useState(2025);
  const [activeMonth, setActiveMonth] = useState(3);

  // --- スクロール連動ロジック (簡易版) ---
  // 本来はIntersectionObserverを使いますが、今回はクリックで動くようにします
  
  return (
    <div className="flex h-full bg-slate-900 text-white w-48 shadow-2xl z-20 relative">
      {/* --- 年のドラム --- */}
      <div className="flex-1 border-r border-slate-700 relative group">
        <div className="absolute inset-x-0 top-0 h-32 mask-v-top z-10 pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 h-32 mask-v-bottom z-10 pointer-events-none" />
        
        {/* 中心線（選択ライン） */}
        <div className="absolute top-1/2 left-2 right-2 h-12 -mt-6 border-y border-blue-500/50 rounded-lg bg-blue-500/10 pointer-events-none z-0" />

        <div className="h-full v-drum-scroller no-scrollbar py-[40vh]">
          {years.map((y) => (
            <div
              key={y.id}
              onClick={() => setActiveYear(Number(y.id))}
              className={clsx(
                "v-item h-12 flex items-center justify-center font-bold text-lg transition-all duration-300",
                activeYear === y.id ? "active text-blue-400 scale-110" : "text-slate-500"
              )}
            >
              {y.label}
            </div>
          ))}
        </div>
      </div>

      {/* --- 月のドラム --- */}
      <div className="flex-1 relative">
        <div className="absolute inset-x-0 top-0 h-32 mask-v-top z-10 pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 h-32 mask-v-bottom z-10 pointer-events-none" />
        
        <div className="absolute top-1/2 left-2 right-2 h-12 -mt-6 border-y border-slate-500/30 rounded-lg pointer-events-none z-0" />

        <div className="h-full v-drum-scroller no-scrollbar py-[40vh]">
          {months.map((m) => (
            <div
              key={m.id}
              onClick={() => setActiveMonth(Number(m.id))}
              className={clsx(
                "v-item h-12 flex items-center justify-center font-mono text-xl transition-all duration-300",
                activeMonth === m.id ? "active text-white scale-125" : "text-slate-600"
              )}
            >
              {m.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}