import type { Metadata } from "next";
import { MarketingLanding } from "@/features/marketing/MarketingLanding";

export const metadata: Metadata = {
  title: "DocuGrid — 資料を置くだけ、数値が揃う",
  description:
    "税理士事務所向けの資料マトリクス。OCR で正規化し、監査と税務会計システムへ連携。TAXX エコシステムの DocuGrid。",
};

export default function WelcomePage() {
  return <MarketingLanding />;
}
