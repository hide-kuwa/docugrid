import type { Metadata } from "next";
import { LocalTaxTool } from "@/features/tools/LocalTaxTool";

export const metadata: Metadata = {
  title: "法人地方税シミュレーター — TAXX Tools",
  description:
    "課税所得・資本金・従業員数から、法人税、地方法人税、法人住民税、法人事業税、特別法人事業税をまとめて概算します。",
};

export default function LocalTaxPage() {
  return <LocalTaxTool />;
}
