import type { Metadata } from "next";
import { GuestPdfWorkspace } from "@/features/workspace/GuestPdfWorkspace";

export const metadata: Metadata = {
  title: "PDF を編集 — DocuGrid（ログイン不要）",
  description:
    "ログインなしで PDF の注釈・並べ替え・ダウンロード。DocuGrid の無料 PDF ワークスペース。",
};

export default function GuestPdfPage() {
  return <GuestPdfWorkspace />;
}
