"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PERSONAS, type PersonaId } from "@/config/personas";
import { DeferredPersonaNotice } from "@/features/persona/DeferredPersonaNotice";
import { PersonaHomeShell } from "@/features/persona/PersonaHomeShell";
import { checkSession, loadCurrentUser, type DocugridUser } from "@/lib/auth";
import { isDeferredPersona, isInProductScope } from "@/lib/product-scope";
import { getPostLoginPath, resolvePersona, resolvePersonaId } from "@/lib/persona";

export default function PersonaWorkspacePage() {
  const router = useRouter();
  const params = useParams();
  const personaId = String(params.personaId || "") as PersonaId;
  const personaDef = PERSONAS.find((p) => p.id === personaId);
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
      setUser(current);
      const mine = resolvePersonaId(current);
      if (!personaDef || !isInProductScope(personaId)) {
        router.replace(getPostLoginPath(current));
        return;
      }
      if (mine !== personaId) {
        router.replace(getPostLoginPath(current));
        return;
      }
      setReady(true);
    })();
  }, [personaId, router]);

  if (!personaDef || !ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        読み込み中…
      </div>
    );
  }

  if (isDeferredPersona(personaId)) {
    return <DeferredPersonaNotice persona={personaDef} />;
  }

  return <PersonaHomeShell persona={resolvePersona(user)} user={user} />;
}
