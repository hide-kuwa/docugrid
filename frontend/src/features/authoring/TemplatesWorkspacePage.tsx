"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthoringTemplatesPanel } from "@/features/authoring/components/AuthoringTemplatesPanel";
import { AuthoringWorkspaceChrome } from "@/features/workspace/AuthoringWorkspaceChrome";
import { checkSession, loadCurrentUser, type DocugridUser } from "@/lib/auth";
import { canShowPreviewWorkspaceNav } from "@/lib/nav-policy";

export function TemplatesWorkspacePage() {
  const router = useRouter();
  const [user, setUser] = useState<DocugridUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      const session = await checkSession();
      if (session !== "ok") {
        router.replace(session === "offline" ? "/login?reason=offline" : "/login?reason=session");
        return;
      }
      const current = loadCurrentUser();
      if (!canShowPreviewWorkspaceNav(current)) {
        router.replace("/");
        return;
      }
      setUser(current);
      setReady(true);
    })();
  }, [router]);

  if (!ready) {
    return <div className="p-8 text-sm text-slate-500">読み込み中…</div>;
  }

  return (
    <AuthoringWorkspaceChrome
      title="文書ひな形"
      description="契約書などの文面を、差し込み項目つきで作ります。コードは不要です。"
    >
      <AuthoringTemplatesPanel currentUser={user} />
    </AuthoringWorkspaceChrome>
  );
}
