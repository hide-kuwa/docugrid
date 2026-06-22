import { useCallback, useEffect, useRef } from "react";

const DEFAULT_MS = 700;

/**
 * 数字入力のデバウンス後にコールバックを実行する。
 * 台帳の「保存」ボタンなしで、入力が止まったタイミングでサーバーへ反映する。
 */
export function useDebouncedCallback<T extends (...args: never[]) => void>(
  fn: T,
  delayMs = DEFAULT_MS,
): T {
  const fnRef = useRef(fn);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return useCallback(
    ((...args: Parameters<T>) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        fnRef.current(...args);
      }, delayMs);
    }) as T,
    [delayMs],
  );
}

export function computeNetPayYen(row: {
  gross_pay_yen: number;
  bonus_yen?: number;
  health_insurance_yen: number;
  pension_yen: number;
  employment_insurance_yen: number;
  income_tax_yen: number;
  resident_tax_yen?: number;
}): number {
  return (
    row.gross_pay_yen +
    (row.bonus_yen ?? 0) -
    row.health_insurance_yen -
    row.pension_yen -
    row.employment_insurance_yen -
    row.income_tax_yen -
    (row.resident_tax_yen ?? 0)
  );
}
