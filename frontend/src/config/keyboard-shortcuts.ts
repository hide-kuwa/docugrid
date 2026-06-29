import { formatShortcutParts } from "@/lib/keyboard";

export type KeyboardShortcutScope =
  | "global"
  | "pdf-viewer"
  | "pdf-viewer-reorder"
  | "matrix";

export type KeyboardShortcutDef = {
  id: string;
  scope: KeyboardShortcutScope;
  scopeLabel: string;
  label: string;
  /** 表示用キー（Mod = Ctrl / ⌘） */
  keys: string[];
  note?: string;
};

export const KEYBOARD_SHORTCUT_SCOPE_LABELS: Record<KeyboardShortcutScope, string> = {
  global: "共通",
  "pdf-viewer": "PDF ビューア",
  "pdf-viewer-reorder": "PDF ビューア — ページ並べ替え",
  matrix: "資料マトリクス",
};

export const KEYBOARD_SHORTCUTS: KeyboardShortcutDef[] = [
  {
    id: "global.escape",
    scope: "global",
    scopeLabel: KEYBOARD_SHORTCUT_SCOPE_LABELS.global,
    label: "閉じる / キャンセル",
    keys: ["Esc"],
    note: "モーダル・パネルを段階的に閉じます",
  },
  {
    id: "viewer.save",
    scope: "pdf-viewer",
    scopeLabel: KEYBOARD_SHORTCUT_SCOPE_LABELS["pdf-viewer"],
    label: "作業保存",
    keys: ["Mod", "S"],
  },
  {
    id: "viewer.undo",
    scope: "pdf-viewer-reorder",
    scopeLabel: KEYBOARD_SHORTCUT_SCOPE_LABELS["pdf-viewer-reorder"],
    label: "元に戻す（並べ替え）",
    keys: ["Mod", "Z"],
  },
  {
    id: "viewer.redo",
    scope: "pdf-viewer-reorder",
    scopeLabel: KEYBOARD_SHORTCUT_SCOPE_LABELS["pdf-viewer-reorder"],
    label: "やり直し（並べ替え）",
    keys: ["Mod", "Shift", "Z"],
    note: "Windows では Mod + Y も使えます",
  },
  {
    id: "viewer.redo-alt",
    scope: "pdf-viewer-reorder",
    scopeLabel: KEYBOARD_SHORTCUT_SCOPE_LABELS["pdf-viewer-reorder"],
    label: "やり直し（代替）",
    keys: ["Mod", "Y"],
  },
  {
    id: "viewer.prev-page",
    scope: "pdf-viewer",
    scopeLabel: KEYBOARD_SHORTCUT_SCOPE_LABELS["pdf-viewer"],
    label: "前のページ",
    keys: ["←", "PageUp"],
  },
  {
    id: "viewer.next-page",
    scope: "pdf-viewer",
    scopeLabel: KEYBOARD_SHORTCUT_SCOPE_LABELS["pdf-viewer"],
    label: "次のページ",
    keys: ["→", "PageDown"],
  },
  {
    id: "viewer.first-page",
    scope: "pdf-viewer",
    scopeLabel: KEYBOARD_SHORTCUT_SCOPE_LABELS["pdf-viewer"],
    label: "先頭ページ",
    keys: ["Home"],
  },
  {
    id: "viewer.last-page",
    scope: "pdf-viewer",
    scopeLabel: KEYBOARD_SHORTCUT_SCOPE_LABELS["pdf-viewer"],
    label: "最終ページ",
    keys: ["End"],
  },
  {
    id: "viewer.history",
    scope: "pdf-viewer",
    scopeLabel: KEYBOARD_SHORTCUT_SCOPE_LABELS["pdf-viewer"],
    label: "版の履歴パネル",
    keys: ["Mod", "H"],
  },
  {
    id: "viewer.reorder-mode",
    scope: "pdf-viewer",
    scopeLabel: KEYBOARD_SHORTCUT_SCOPE_LABELS["pdf-viewer"],
    label: "ページ並べ替えモード",
    keys: ["Mod", "Shift", "O"],
  },
  {
    id: "viewer.split-view",
    scope: "pdf-viewer",
    scopeLabel: KEYBOARD_SHORTCUT_SCOPE_LABELS["pdf-viewer"],
    label: "2 画面照合",
    keys: ["Mod", "Shift", "2"],
  },
  {
    id: "viewer.tool-none",
    scope: "pdf-viewer",
    scopeLabel: KEYBOARD_SHORTCUT_SCOPE_LABELS["pdf-viewer"],
    label: "選択ツール（注釈オフ）",
    keys: ["V", "0"],
  },
  {
    id: "viewer.tool-marker",
    scope: "pdf-viewer",
    scopeLabel: KEYBOARD_SHORTCUT_SCOPE_LABELS["pdf-viewer"],
    label: "マーカー",
    keys: ["M"],
  },
  {
    id: "viewer.tool-box",
    scope: "pdf-viewer",
    scopeLabel: KEYBOARD_SHORTCUT_SCOPE_LABELS["pdf-viewer"],
    label: "囲み（矩形）",
    keys: ["B"],
  },
  {
    id: "viewer.tool-line",
    scope: "pdf-viewer",
    scopeLabel: KEYBOARD_SHORTCUT_SCOPE_LABELS["pdf-viewer"],
    label: "線",
    keys: ["L"],
  },
  {
    id: "viewer.tool-check",
    scope: "pdf-viewer",
    scopeLabel: KEYBOARD_SHORTCUT_SCOPE_LABELS["pdf-viewer"],
    label: "チェックマーク",
    keys: ["K"],
  },
  {
    id: "viewer.tool-eraser",
    scope: "pdf-viewer",
    scopeLabel: KEYBOARD_SHORTCUT_SCOPE_LABELS["pdf-viewer"],
    label: "消しゴム",
    keys: ["E"],
  },
  {
    id: "viewer.select-all",
    scope: "pdf-viewer-reorder",
    scopeLabel: KEYBOARD_SHORTCUT_SCOPE_LABELS["pdf-viewer-reorder"],
    label: "ページをすべて選択",
    keys: ["Mod", "A"],
  },
  {
    id: "viewer.delete-selected",
    scope: "pdf-viewer-reorder",
    scopeLabel: KEYBOARD_SHORTCUT_SCOPE_LABELS["pdf-viewer-reorder"],
    label: "選択ページを削除",
    keys: ["Delete", "Backspace"],
  },
  {
    id: "viewer.close",
    scope: "pdf-viewer",
    scopeLabel: KEYBOARD_SHORTCUT_SCOPE_LABELS["pdf-viewer"],
    label: "ビューアを閉じる",
    keys: ["Mod", "W"],
  },
  {
    id: "viewer.version-delete",
    scope: "pdf-viewer",
    scopeLabel: KEYBOARD_SHORTCUT_SCOPE_LABELS["pdf-viewer"],
    label: "版の履歴から1件だけ削除",
    keys: ["（履歴パネル内）"],
    note: "「この版を削除」ボタン · 資料全体の完全削除とは別",
  },
  {
    id: "matrix.escape-edit",
    scope: "matrix",
    scopeLabel: KEYBOARD_SHORTCUT_SCOPE_LABELS.matrix,
    label: "枠編集モードを終了",
    keys: ["Esc"],
  },
  {
    id: "text.native",
    scope: "global",
    scopeLabel: KEYBOARD_SHORTCUT_SCOPE_LABELS.global,
    label: "テキスト入力中のコピー / 貼り付け / 全選択 / 元に戻す",
    keys: ["Mod", "C / V / X / A / Z"],
    note: "入力欄・検索ボックス内ではブラウザ標準の動作を使います",
  },
];

export function formatShortcutDisplay(keys: string[]): string {
  if (keys.length === 1) {
    const single = keys[0]!;
    if (single.includes("/")) {
      return single.split("/").map((k) => k.trim()).join(" / ");
    }
    return single;
  }
  return formatShortcutParts(keys);
}

export function groupedKeyboardShortcuts(): Array<{
  scope: KeyboardShortcutScope;
  label: string;
  items: KeyboardShortcutDef[];
}> {
  const order: KeyboardShortcutScope[] = [
    "global",
    "pdf-viewer",
    "pdf-viewer-reorder",
    "matrix",
  ];
  return order.map((scope) => ({
    scope,
    label: KEYBOARD_SHORTCUT_SCOPE_LABELS[scope],
    items: KEYBOARD_SHORTCUTS.filter((s) => s.scope === scope),
  })).filter((g) => g.items.length > 0);
}
