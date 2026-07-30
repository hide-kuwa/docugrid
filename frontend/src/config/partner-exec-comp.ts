/** 役員報酬シミュレーターのパートナー別公開用設定（env で上書き）。 */

export const EXEC_COMP_PARTNER_PATH = "/sim/officer-comp";

export type PartnerExecCompConfig = {
  /** このホストでアクセスしたとき専用ページのみを見せる（カンマ区切り） */
  domains: string[];
  /** ヘッダーに表示する提供元名（未設定なら中立タイトルのみ） */
  partnerName: string | null;
  /** 提供元サイトへのリンク */
  partnerSiteUrl: string | null;
  /** Powered by のリンク先 */
  poweredByUrl: string;
};

function parseDomains(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

export function getPartnerExecCompConfig(): PartnerExecCompConfig {
  return {
    domains: parseDomains(process.env.NEXT_PUBLIC_EXEC_COMP_PARTNER_DOMAINS),
    partnerName: process.env.NEXT_PUBLIC_EXEC_COMP_PARTNER_NAME?.trim() || null,
    partnerSiteUrl: process.env.NEXT_PUBLIC_EXEC_COMP_PARTNER_SITE_URL?.trim() || null,
    poweredByUrl: process.env.NEXT_PUBLIC_EXEC_COMP_POWERED_BY_URL?.trim() || "https://taxx.jp",
  };
}

export function isPartnerExecCompHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const hostname = host.split(":")[0].toLowerCase();
  return getPartnerExecCompConfig().domains.includes(hostname);
}
