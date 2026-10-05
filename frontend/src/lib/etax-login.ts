/** e-Tax ログイン補助（他オリジンへの自動入力はブラウザが禁止するため、開く＋コピー） */

export const ETAX_LOGIN_CORPORATE =
  "https://login.e-tax.nta.go.jp/login/reception/loginCorporate";
export const ETAX_LOGIN_INDIVIDUAL =
  "https://login.e-tax.nta.go.jp/login/reception/loginIndividual";

export type EtaxLoginKind = "corporate" | "individual";

export function etaxLoginUrl(kind: EtaxLoginKind): string {
  return kind === "individual" ? ETAX_LOGIN_INDIVIDUAL : ETAX_LOGIN_CORPORATE;
}

export async function copyText(text: string): Promise<boolean> {
  const value = text.trim();
  if (!value) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * e-Tax ログインページを開き、利用者識別番号をクリップボードへ。
 * 暗証番号は別途 copyText で渡す（URL に載せない）。
 */
export function openEtaxLogin(kind: EtaxLoginKind): void {
  window.open(etaxLoginUrl(kind), "_blank", "noopener,noreferrer");
}
