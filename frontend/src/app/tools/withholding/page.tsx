import type { Metadata } from "next";
import { WithholdingTool } from "@/features/tools/WithholdingTool";

export const metadata: Metadata = {
  title: "源泉徴収税額表ビューア — TAXX Tools",
  description:
    "給与所得の源泉徴収税額表（月額表）に基づき、その月の源泉所得税（甲欄・乙欄）を試算。税額表全体も確認できる無料ツール。",
};

export default function WithholdingPage() {
  return <WithholdingTool />;
}
