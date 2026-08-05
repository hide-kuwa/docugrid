"use client";

import { FileText, Link2 } from "lucide-react";
import { AUDIT_LINK_COLORS } from "../lib/audit-link-markers";
import type { AuditCheckLink, AuditSide } from "../types";

function shortName(name?: string | null, max = 22): string {
  const n = (name || "").trim();
  if (!n) return "（PDF名なし）";
  return n.length > max ? `${n.slice(0, max - 1)}…` : n;
}

type AuditLinksRailProps = {
  links: AuditCheckLink[];
  selectedLinkId: string | null;
  isSavingLinks: boolean;
  isLoadingLinks: boolean;
  leftLoadedName?: string | null;
  rightLoadedName?: string | null;
  leftLoadedHash?: string | null;
  rightLoadedHash?: string | null;
  onFocusLink: (link: AuditCheckLink, side?: AuditSide) => void;
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
  leftLoadedName,
  rightLoadedName,
  leftLoadedHash,
  rightLoadedHash,
  onFocusLink,
  onCommentChange,
  onCommentBlur,
  onSave,
  onExport,
}: AuditLinksRailProps) => {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-l border-slate-300 bg-white md:w-80">
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
            左右を順にクリックすると #1, #2… と番号が増えていきます。リストから該当 PDF・ページへ飛べます。
          </p>
        ) : (
          <ul className="space-y-2">
            {links.map((link, index) => {
              const color = AUDIT_LINK_COLORS[index % AUDIT_LINK_COLORS.length];
              const num = index + 1;
              const isSelected = link.id === selectedLinkId;
              const leftName = link.left.fileName;
              const rightName = link.right.fileName;
              const leftMismatch =
                Boolean(link.left.fileHash) &&
                Boolean(leftLoadedHash) &&
                link.left.fileHash !== leftLoadedHash &&
                link.left.fileHash !== rightLoadedHash;
              const rightMismatch =
                Boolean(link.right.fileHash) &&
                Boolean(rightLoadedHash) &&
                link.right.fileHash !== rightLoadedHash &&
                link.right.fileHash !== leftLoadedHash;
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
                    className="mb-1.5 flex w-full items-start gap-1.5 text-left"
                    title="左右の該当ページへジャンプ"
                  >
                    <span
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                      style={{ backgroundColor: color }}
                    >
                      {num}
                    </span>
                    <span className="min-w-0 flex-1 space-y-0.5">
                      <span className="block font-semibold leading-snug text-slate-800">
                        #{num} 照合リンク
                      </span>
                      <span className="flex items-start gap-1 text-[10px] leading-snug text-slate-600">
                        <FileText className="mt-0.5 h-3 w-3 shrink-0 text-red-500" />
                        <span className="min-w-0">
                          <span className="font-medium text-red-700">左</span>{" "}
                          {shortName(leftName)}
                          <span className="text-slate-400"> · P{link.left.page + 1}</span>
                          {leftMismatch ? (
                            <span className="ml-1 text-amber-600">（未ロード）</span>
                          ) : null}
                        </span>
                      </span>
                      <span className="flex items-start gap-1 text-[10px] leading-snug text-slate-600">
                        <FileText className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
                        <span className="min-w-0">
                          <span className="font-medium text-emerald-700">右</span>{" "}
                          {shortName(rightName)}
                          <span className="text-slate-400"> · P{link.right.page + 1}</span>
                          {rightMismatch ? (
                            <span className="ml-1 text-amber-600">（未ロード）</span>
                          ) : null}
                        </span>
                      </span>
                    </span>
                  </button>
                  <div className="mb-1.5 flex gap-1">
                    <button
                      type="button"
                      onClick={() => onFocusLink(link, "left")}
                      className="flex-1 rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-800 hover:bg-red-100"
                      title={`左 PDF へ: ${leftName || "不明"} P${link.left.page + 1}`}
                    >
                      左へ飛ぶ
                    </button>
                    <button
                      type="button"
                      onClick={() => onFocusLink(link, "right")}
                      className="flex-1 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800 hover:bg-emerald-100"
                      title={`右 PDF へ: ${rightName || "不明"} P${link.right.page + 1}`}
                    >
                      右へ飛ぶ
                    </button>
                  </div>
                  {(leftMismatch || rightMismatch) && (
                    <p className="mb-1.5 text-[10px] leading-snug text-amber-700">
                      いまの左右パネルと PDF が違います。「入替」か保存済 PDF
                      を開き直してから再度ジャンプしてください。
                      {leftLoadedName || rightLoadedName
                        ? `（現在: 左=${shortName(leftLoadedName, 14)} / 右=${shortName(rightLoadedName, 14)}）`
                        : null}
                    </p>
                  )}
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
