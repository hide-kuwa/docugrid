"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { PersonaId } from "@/config/personas";
import { RoleDemoPreview } from "@/features/demo/RoleDemoPreview";
import { checkSession, loadCurrentUser } from "@/lib/auth";
import { canAccessDevConsole } from "@/lib/app-surface";
import { isInProductScope } from "@/lib/product-scope";

export default function RoleDemoPersonaPage() {
  const params = useParams();
  const router = useRouter();
  const personaId = String(params.personaId || "") as PersonaId;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      const session = await checkSession();
      if (session !== "ok") {
        router.replace("/login");
        return;
      }
      const user = loadCurrentUser();
      if (!canAccessDevConsole(user)) {
        router.replace("/dev");
        return;
      }
      if (!isInProductScope(personaId)) {
        router.replace("/dev/demo");
        return;
      }
      setReady(true);
    })();
  }, [personaId, router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return <RoleDemoPreview personaId={personaId} />;
}
