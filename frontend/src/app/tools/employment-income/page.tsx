import type { Metadata } from "next";
import { EmploymentIncomeTool } from "@/features/tools/EmploymentIncomeTool";

export const metadata: Metadata = {
  title: "給与所得控除チェッカー — TAXX Tools",
  description:
    "給与収入（額面）から給与所得控除額と給与所得を自動計算。国税庁の給与所得控除の速算式に準拠した無料ツール。",
};

export default function EmploymentIncomePage() {
  return <EmploymentIncomeTool />;
}
