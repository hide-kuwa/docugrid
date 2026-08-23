"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ClientFlowchartSection } from "@/features/flowchart-templates/ClientFlowchartSection";
import { FlowchartTemplatesPanel } from "@/features/flowchart-templates/FlowchartTemplatesPanel";
import { useOrgDirectory } from "@/features/org/useOrgDirectory";
import { AuthoringWorkspaceChrome } from "@/features/workspace/AuthoringWorkspaceChrome";
import { setClientScope } from "@/lib/api-auth";
import { checkSession, loadCurrentUser, type DocugridUser } from "@/lib/auth";
import { canAccessClient, hasPermission, resolveStakeholder } from "@/lib/authorization";

export function FlowchartWorkspacePage() {
  const router = useRouter();
  const { clients } = useOrgDirectory();
  const [user, setUser] = useState<DocugridUser | null>(null);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<"run" | "build">("run");
  const [clientId, setClientId] = useState("");

  const stakeholder = resolveStakeholder(user);
  const scopedClients = useMemo(
    () => clients.filter((c) => canAccessClient(stakeholder, c.id, user?.visibleClientIds)),
    [clients, stakeholder, user?.visibleClientIds],
  );

  useEffect(() => {
    void (async () => {
      const session = await checkSession();
      if (session !== "ok") {
        router.replace(session === "offline" ? "/login?reason=offline" : "/login?reason=session");
        return;
      }
      setUser(loadCurrentUser());
      setReady(true);
    })();
  }, [router]);

  useEffect(() => {
    if (!ready || scopedClients.length === 0) return;
    if (!clientId || !scopedClients.some((c) => c.id === clientId)) {
      setClientId(scopedClients[0].id);
      setClientScope(scopedClients[0].id);
    }
  }, [ready, scopedClients, clientId]);

  useEffect(() => {
    if (clientId) setClientScope(clientId);
  }, [clientId]);

  if (!ready) {
    return <div className="p-8 text-sm text-slate-500">読み込み中…</div>;
  }

  return (
    <AuthoringWorkspaceChrome
      title="判定フロー"
      description="顧問先の数字で判定する画面と、フローを画面で作る画面です。コードは不要です。"
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-slate-200 bg-white p-1">
          <button
            type="button"
            className={`rounded-lg px-3 py-1.5 text-xs font-bold ${mode === "run" ? "bg-violet-700 text-white" : "text-slate-500"}`}
            onClick={() => setMode("run")}
          >
            この顧問先で判定
          </button>
          <button
            type="button"
            className={`rounded-lg px-3 py-1.5 text-xs font-bold ${mode === "build" ? "bg-violet-700 text-white" : "text-slate-500"}`}
            onClick={() => setMode("build")}
          >
            フローを作る
          </button>
        </div>
        {mode === "run" ? (
          <label className="flex items-center gap-2 text-[11px] font-bold text-slate-500">
            顧問先
            <select
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-semibold text-slate-800"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            >
              {scopedClients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {mode === "run" && clientId ? (
        <ClientFlowchartSection clientId={clientId} canEdit={hasPermission(user, "client.edit")} />
      ) : null}
      {mode === "build" ? <FlowchartTemplatesPanel currentUser={user} /> : null}
    </AuthoringWorkspaceChrome>
  );
}
