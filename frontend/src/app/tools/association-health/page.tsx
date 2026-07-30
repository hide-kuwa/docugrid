import type { Metadata } from "next";
import { AssociationHealthTool } from "@/features/tools/AssociationHealthTool";

export const metadata: Metadata = {
  title: "協会けんぽ 保険料額表 — TAXX Tools",
  description:
    "都道府県別の健康・介護・子ども・子育て支援金・厚生年金の料率と、報酬月額から等級・保険料額を試算。全国健康保険協会の公表表に準拠。",
};

export default function AssociationHealthPage() {
  return <AssociationHealthTool />;
}
