"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { FileText, Receipt, BookOpen, Scale, Landmark } from "lucide-react";

const docTypes = [
  { id: "invoice", label: "請求書・領収書", icon: Receipt },
  { id: "bank", label: "預金通帳", icon: Landmark },
  { id: "pl", label: "試算表(TB)", icon: Scale },
  { id: "gl", label: "総勘定元帳", icon: BookOpen },
  { id: "tax", label: "申告書・決算書", icon: FileText },
];

export default function DocTypeSelector() {
  const [activeType, setActiveType] = useState("gl");

  return (
    <div className="h-24 bg-slate-900 border-b border-slate-700 relative flex items-center shadow-lg z-10 flex-shrink-0">
      {/* マスク */}
      <div className="absolute inset-y-0 left-0 w-32 mask-h-left z-20 pointer-events-none" />
      <div className="absolute inset-y-0 right-0 w-32 mask-h-right z-20 pointer-events-none" />

      {/* コンテナ：ここを修正（flex と overflow-x-auto を追加） */}
      <div className="no-scrollbar w-full overflow-x-auto flex items-center px-[40vw] gap-12">
        {docTypes.map((doc) => {
          const Icon = doc.icon;
          const isActive = activeType === doc.id;
          return (
            <div
              key={doc.id}
              onClick={() => setActiveType(doc.id)}
              className={clsx(
                "group flex flex-col items-center justify-center gap-2 transition-all duration-300 cursor-pointer min-w-[100px]", // 幅を確保
                isActive ? "text-blue-400 scale-110" : "text-slate-500 hover:text-slate-300"
              )}
            >
              <div className={clsx(
                "p-3 rounded-full transition-all duration-300 relative",
                isActive ? "bg-blue-500/20 ring-2 ring-blue-500" : "bg-slate-800"
              )}>
                <Icon size={24} />
              </div>
              <span className="text-xs font-bold tracking-wider whitespace-nowrap">{doc.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}