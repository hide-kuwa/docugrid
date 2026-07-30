import type { Metadata } from "next";
import { ExecutiveCompTool } from "@/features/tools/ExecutiveCompTool";
import { getPartnerExecCompConfig } from "@/config/partner-exec-comp";

const { partnerName } = getPartnerExecCompConfig();
const titleSuffix = partnerName ? ` — ${partnerName}` : "";

export const metadata: Metadata = {
  title: `役員報酬 最適化シミュレーター${titleSuffix}`,
  description:
    "会社の利益を固定し、役員報酬を変えたときの法人税・所得税・住民税・社会保険料の合計負担が最小になる月額を試算。法定マスタも同一ページで確認できます。",
  robots: { index: true, follow: true },
};

export default function PartnerExecutiveCompPage() {
  return <ExecutiveCompTool variant="partner" />;
}
