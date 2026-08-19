/**
 * 並べ替え中に PDF を末尾結合したあとの pageOrder（元 PDF 内 0-based ページ番号）を組み立てる。
 * `oldPageCount` は結合前の実ページ数（サムネ枚数など）を渡す。
 */
export function extendPageOrderAfterAppend(
  prev: number[],
  oldPageCount: number,
  newPageCount: number,
): number[] {
  if (newPageCount <= 0) return [];
  const safeOld = Math.max(0, oldPageCount);
  const base =
    prev.length === safeOld && prev.length > 0
      ? prev
      : Array.from({ length: safeOld }, (_, i) => i);
  if (newPageCount <= safeOld) {
    return base.slice(0, newPageCount);
  }
  const extra = Array.from(
    { length: newPageCount - safeOld },
    (_, j) => safeOld + j,
  );
  return [...base, ...extra];
}
