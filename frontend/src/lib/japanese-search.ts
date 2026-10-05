/** 検索用: ひらがな↔カタカナを揃えて照合できるようにする */

export function toKatakana(value: string): string {
  return value.replace(/[\u3041-\u3096]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) + 0x60),
  );
}

export function toHiragana(value: string): string {
  return value.replace(/[\u30a1-\u30f6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60),
  );
}

/** NFKC + カタカナ寄せ + 小文字化 */
export function normalizeForSearch(value: string): string {
  return toKatakana(value.normalize("NFKC")).toLowerCase();
}

export function matchesSearchQuery(haystack: string, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  const hay = normalizeForSearch(haystack);
  const needle = normalizeForSearch(q);
  if (hay.includes(needle)) return true;
  // クエリがひらがなのときもカタカナ名に当てる（上で両方カタカナ化済み）
  return toHiragana(hay).includes(toHiragana(needle));
}
