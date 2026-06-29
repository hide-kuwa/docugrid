"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { AuthNavButtons } from "@/components/AuthNavButtons";
import { useOrgDirectory } from "@/features/org/useOrgDirectory";
import { CLIENT_PERIOD_OPTIONS, periodKeyLabel } from "@/features/persona/lib/period-keys";
import { ReviewChecklistRunner } from "@/features/review-checklist/ReviewChecklistRunner";
import { checkSession, loadCurrentUser } from "@/lib/auth";
import { setClientScope } from "@/lib/api-auth";
import { canAccessClient, resolveStakeholder } from "@/lib/authorization";
import { getBusinessHomePath, resolvePersona } from "@/lib/persona";

const YEAR_PERIODS = CLIENT_PERIOD_OPTIONS.filter((p) => p.key.startsWith("year"));

function ChecklistPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { clients } = useOrgDirectory();
  const [authChecked, setAuthChecked] = useState(false);
  const [clientId, setClientId] = useState(searchParams.get("client") ?? "");
  const [periodKey, setPeriodKey] = useState(searchParams.get("period") ?? YEAR_PERIODS[0]?.key ?? "year:1");
  const [templateId, setTemplateId] = useState(searchParams.get("template") ?? "");

  const user = loadCurrentUser();
  const persona = resolvePersona(user);
  const isClientUser = persona.audience === "client";
  const backHref = getBusinessHomePath(user);
  const backLabel = isClientUser ? "ワークスペースへ" : "タスクへ";
  const stakeholder = resolveStakeholder(user);
  const scopedClients = useMemo(
    () => clients.filter((c) => canAccessClient(stakeholder, c.id, user?.visibleClientIds)),
    [clients, stakeholder, user?.visibleClientIds],
  );
  const clientName = scopedClients.find((c) => c.id === clientId)?.name ?? clientId;

  useEffect(() => {
    void (async () => {
      const session = await checkSession();
      if (session !== "ok") {
        router.replace(session === "offline" ? "/login?reason=offline" : "/login?reason=session");
        return;
      }
      setAuthChecked(true);
    })();
  }, [router]);

  useEffect(() => {
    if (!authChecked || scopedClients.length === 0) return;
    if (!clientId) {
      setClientId(scopedClients[0].id);
      setClientScope(scopedClients[0].id);
    }
  }, [authChecked, scopedClients, clientId]);

  useEffect(() => {
    if (clientId) setClientScope(clientId);
  }, [clientId]);

  useEffect(() => {
    if (!authChecked || !clientId) return;
    const params = new URLSearchParams();
    params.set("client", clientId);
    params.set("period", periodKey);
    if (templateId) params.set("template", templateId);
    const next = `/checklist?${params.toString()}`;
    if (`${window.location.pathname}${window.location.search}` !== next) {
      router.replace(next, { scroll: false });
    }
  }, [authChecked, clientId, periodKey, templateId, router]);

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-700">
      <header className="border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {backLabel}
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-black text-slate-800">
              {isClientUser ? "確認チェックリスト" : "監査チェックリスト"}
            </h1>
            <p className="text-xs text-slate-500">
              {isClientUser
                ? "確認事項への回答 · 事務所と共有"
                : "所内回覧 · PDF 出力 · 複数様式対応"}
            </p>
          </div>
          {scopedClients.length > 1 && (
            <select
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            >
              {scopedClients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <select
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold"
            value={periodKey}
            onChange={(e) => setPeriodKey(e.target.value)}
          >
            {YEAR_PERIODS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
          <AuthNavButtons variant="light" />
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-6">
        {clientId && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="mb-4 text-xs text-slate-500">
              {clientName} · {periodKeyLabel(periodKey)}
            </p>
            <ReviewChecklistRunner
              clientId={clientId}
              periodKey={periodKey}
              templateId={templateId || undefined}
              onTemplateIdChange={setTemplateId}
              clientName={clientName}
              user={user}
            />
          </section>
        )}
      </main>
    </div>
  );
}

export default function ChecklistPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      }
    >
      <ChecklistPageContent />
    </Suspense>
  );
}
