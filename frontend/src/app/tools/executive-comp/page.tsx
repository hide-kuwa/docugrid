import type { Metadata } from "next";
import { ExecutiveCompTool } from "@/features/tools/ExecutiveCompTool";

export const metadata: Metadata = {
  title: "役員報酬 最適化シミュレーター — TAXX",
  description:
    "会社の利益を固定し、役員報酬を変えたときの法人税＋所得税＋住民税＋社会保険料の合計負担が最小になる月額を試算。法人税・地方税・給与所得控除・源泉・協会けんぽの法定マスタも同一ページで確認できます。",
};

export default function ExecutiveCompPage() {
  return <ExecutiveCompTool variant="taxx" />;
}
