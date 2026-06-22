"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { checkSession, loadCurrentUser } from "@/lib/auth";
import { getPostLoginPath } from "@/lib/persona";

export default function WorkspaceIndexPage() {
  const router = useRouter();

  useEffect(() => {
    void (async () => {
      const session = await checkSession();
      if (session !== "ok") {
        router.replace(session === "offline" ? "/login?reason=offline" : "/login?reason=session");
        return;
      }
      router.replace(getPostLoginPath(loadCurrentUser()));
    })();
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
      ワークスペースへ移動中…
    </div>
  );
}
