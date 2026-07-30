import type { Metadata } from "next";
import { CorporateTaxTool } from "@/features/tools/CorporateTaxTool";

export const metadata: Metadata = {
  title: "法人税率チェッカー — TAXX Tools",
  description:
    "課税所得と事業年度から法人税額を試算。中小法人の軽減税率（年800万円以下）と標準税率の内訳をその場で確認できます。国税庁の公表税率に準拠。",
};

export default function CorporateTaxPage() {
  return <CorporateTaxTool />;
}
