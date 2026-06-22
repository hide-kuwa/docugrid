"use client";

import { Link2 } from "lucide-react";
import { AUDIT_LINK_COLORS } from "../lib/audit-link-markers";
import type { AuditCheckLink } from "../types";

type AuditLinksRailProps = {
  links: AuditCheckLink[];
  selectedLinkId: string | null;
  isSavingLinks: boolean;
  isLoadingLinks: boolean;
  onFocusLink: (link: AuditCheckLink) => void;
  onCommentChange: (linkId: string, comment: string) => void;
  onCommentBlur: () => void;
  onSave: () => void;
  onExport: () => void;
};

export const AuditLinksRail = ({
  links,
  selectedLinkId,
  isSavingLinks,
  isLoadingLinks,
  onFocusLink,
  onCommentChange,
  onCommentBlur,
  onSave,
  onExport,
}: AuditLinksRailProps) => {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-l border-slate-300 bg-white md:w-72">
      <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-slate-200 px-2 text-xs font-semibold text-slate-700">
        <Link2 className="h-3.5 w-3.5" />
        照合済み ({links.length})
        {isLoadingLinks && <span className="font-normal text-slate-400">読込中</span>}
      </div>
      <div className="flex shrink-0 gap-1 border-b border-slate-100 p-1.5">
        <button
          type="button"
          onClick={onSave}
          disabled={isSavingLinks || links.length === 0}
          className="flex-1 rounded border border-slate-200 px-2 py-1 text-[10px] text-slate-600 hover:bg-slate-50 disabled:opacity-40"
        >
          再保存
        </button>
        <button
          type="button"
          onClick={onExport}
          className="flex-1 rounded border border-slate-200 px-2 py-1 text-[10px] text-slate-600 hover:bg-slate-50"
        >
          JSON
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5 text-[11px] text-slate-600">
        {links.length === 0 ? (
          <p className="px-1 py-2 leading-relaxed text-slate-500">
            左右を順にクリックすると #1, #2… と番号が増えていきます。
          </p>
        ) : (
          <ul className="space-y-2">
            {links.map((link, index) => {
              const color = AUDIT_LINK_COLORS[index % AUDIT_LINK_COLORS.length];
              const num = index + 1;
              const isSelected = link.id === selectedLinkId;
              return (
                <li
                  key={link.id}
                  className={`rounded-md border p-1.5 ${
                    isSelected ? "border-slate-400 bg-slate-50" : "border-slate-200 bg-white"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onFocusLink(link)}
                    className="mb-1 flex w-full items-center gap-1.5 text-left"
                  >
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                      style={{ backgroundColor: color }}
                    >
                      {num}
                    </span>
                    <span className="min-w-0 font-medium leading-snug text-slate-700">
                      L P{link.left.page + 1} ↔ R P{link.right.page + 1}
                    </span>
                  </button>
                  <textarea
                    value={link.comment ?? ""}
                    onChange={(e) => onCommentChange(link.id, e.target.value)}
                    onBlur={onCommentBlur}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="コメント（メモ）"
                    rows={2}
                    className="w-full resize-none rounded border border-slate-200 bg-slate-50 px-1.5 py-1 text-[11px] text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:outline-none"
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
};
