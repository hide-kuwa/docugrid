"use client";

import { groupedKeyboardShortcuts, formatShortcutDisplay } from "@/config/keyboard-shortcuts";
import { modLabel } from "@/lib/keyboard";

export function KeyboardShortcutsPanel() {
  const groups = groupedKeyboardShortcuts();

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <span className="rounded bg-blue-50 px-2 py-0.5 font-mono text-[10px] font-bold text-blue-700">
            KEYS
          </span>
          <span className="font-mono text-[10px] text-slate-400">shortcuts</span>
        </div>
        <h2 className="mt-1 text-lg font-bold text-slate-800">キーボードショートカット</h2>
        <p className="mt-1 text-xs text-slate-500">
          DocuGrid で使える操作の一覧です。修飾キー Mod は Windows / Linux では Ctrl、Mac では ⌘（Command）に相当します。
        </p>
      </div>

      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        現在の Mod キー: <kbd className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-[11px]">{modLabel()}</kbd>
        {" · "}
        テキスト入力中はブラウザ標準の Ctrl/Cmd + C / V / X / A / Z が優先されます。
      </p>

      {groups.map((group) => (
        <section key={group.scope} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <h3 className="border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-600">
            {group.label}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2 font-bold">操作</th>
                  <th className="px-4 py-2 font-bold">キー</th>
                  <th className="hidden px-4 py-2 font-bold sm:table-cell">補足</th>
                </tr>
              </thead>
              <tbody>
                {group.items.map((item) => (
                  <tr key={item.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{item.label}</td>
                    <td className="px-4 py-2.5">
                      <kbd className="inline-block rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] text-slate-700">
                        {formatShortcutDisplay(item.keys)}
                      </kbd>
                    </td>
                    <td className="hidden px-4 py-2.5 text-xs text-slate-500 sm:table-cell">
                      {item.note ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
