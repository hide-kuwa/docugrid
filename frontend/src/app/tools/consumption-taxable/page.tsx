import type { Metadata } from "next";
import { ConsumptionTaxableTool } from "@/features/tools/ConsumptionTaxableTool";

export const metadata: Metadata = {
  title: "消費税 課税事業者判定 — TAXX Tools",
  description:
    "基準期間の課税売上高・特定期間・インボイス登録などから、消費税の課税事業者に該当するかをフローチャートで簡易判定します。",
};

export default function ConsumptionTaxablePage() {
  return <ConsumptionTaxableTool />;
}
