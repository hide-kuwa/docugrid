/** TAXX Tools — コーポレートグリーン（#1FA98C）ベースの UI クラス */

export const toolsTheme = {
  /** いまの役員報酬など「比較対象」入力 */
  currentInput:
    "rounded-lg border border-[var(--taxx-green-300)] bg-[var(--taxx-green-50)] px-3 py-2 text-sm shadow-sm focus:border-[var(--taxx-green-500)] focus:outline-none focus:ring-2 focus:ring-[var(--taxx-green-200)]",
  currentLabel: "text-xs font-bold text-[var(--taxx-green-700)]",
  dirtyHint: "text-xs font-bold text-[var(--taxx-green-700)]",
  currentPanel:
    "mt-4 rounded-xl border border-[var(--taxx-green-300)] bg-[var(--taxx-green-50)] p-4",
  currentPanelTitle: "text-xs font-black text-[var(--taxx-green-800)]",
  currentCard:
    "rounded-lg border border-[var(--taxx-green-200)] bg-white px-4 py-2 shadow-sm",
  currentCardValue: "text-lg font-black text-[var(--taxx-green-900)]",
  currentDetail: "mt-3 grid gap-1 text-[11px] text-[var(--taxx-green-800)]/80 sm:grid-cols-2",

  /** 最適点 */
  optimalRow:
    "bg-[var(--taxx-green-100)] font-black text-[var(--taxx-green-900)] ring-1 ring-inset ring-[var(--taxx-green-400)]",
  optimalBadge:
    "ml-1 rounded bg-[var(--taxx-green-600)] px-1 py-0.5 text-[9px] font-black text-white",
  optimalText: "text-[11px] font-bold text-[var(--taxx-green-700)]",
  resultCard: "border-[var(--taxx-green-300)] bg-[var(--taxx-green-50)]",
  resultCardLabel: "text-[var(--taxx-green-700)]",

  /** いまの設定（最適と区別する薄めのトーン） */
  currentRow:
    "bg-[var(--taxx-green-50)] font-black text-[var(--taxx-green-800)] ring-1 ring-inset ring-[var(--taxx-green-300)]",
  currentBadge:
    "ml-1 rounded bg-[var(--taxx-green-800)] px-1 py-0.5 text-[9px] font-black text-white",

  /** 表の該当行ハイライト */
  tableRowHit: "bg-[var(--taxx-green-50)]",
  tableCellHit: "bg-[var(--taxx-green-100)] font-black text-[var(--taxx-green-950)]",
  tableCellHitStrong:
    "bg-[var(--taxx-green-200)] font-black text-[var(--taxx-green-950)] ring-1 ring-inset ring-[var(--taxx-green-400)]",
  tableRowHitStrong:
    "bg-[var(--taxx-green-100)] font-semibold ring-2 ring-inset ring-[var(--taxx-green-400)]",

  /** 免責・注意 */
  notice:
    "mt-8 rounded-lg border border-[var(--taxx-green-200)] bg-[var(--taxx-green-50)] px-4 py-3 text-[11px] leading-relaxed text-[var(--taxx-green-800)]",

  /** 結果バッジ（題名横） */
  /** フォーカスリング（通常入力） */
  focusInput:
    "focus:border-[var(--taxx-green-500)] focus:outline-none focus:ring-2 focus:ring-[var(--taxx-green-200)]",
  categoryBadge:
    "rounded-full bg-[var(--taxx-green-100)] px-2.5 py-0.5 text-[11px] font-black text-[var(--taxx-green-700)]",
  navLink: "hover:bg-[var(--taxx-green-50)] hover:text-[var(--taxx-green-700)]",
  link: "font-bold text-[var(--taxx-green-600)] hover:text-[var(--taxx-green-700)]",
  rateAccent: "text-[var(--taxx-green-700)]",
  amountBadge:
    "rounded-full bg-[var(--taxx-green-100)] px-2.5 py-0.5 text-sm font-black tabular-nums text-[var(--taxx-green-800)]",
} as const;
