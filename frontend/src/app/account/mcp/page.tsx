import { redirect } from "next/navigation";

export default function AccountMcpRedirectPage() {
  redirect("/settings?tab=mcp");
}
