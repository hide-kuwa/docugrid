"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Circle, Loader2 } from "lucide-react";
import { AuthNavButtons } from "@/components/AuthNavButtons";
import { useOrgDirectory } from "@/features/org/useOrgDirectory";
import { fetchDocumentStatus, type DocumentStatusSummary } from "@/features/docugrid/lib/document-status";
import { useFirmTasks } from "@/features/persona/hooks/useFirmTasks";
import { periodKeyLabel } from "@/features/persona/lib/period-keys";
import { ApprovalQueueWidget } from "@/features/persona/widgets/ApprovalQueueWidget";
import { FirmProgressWidget } from "@/features/persona/widgets/FirmProgressWidget";
import { TodayTasksWidget } from "@/features/persona/widgets/TodayTasksWidget";
import { checkSession, loadCurrentUser } from "@/lib/auth";
import { setClientScope } from "@/lib/api-auth";
import { canAccessClient, resolveStakeholder } from "@/lib/authorization";
import { resolvePersonaId } from "@/lib/persona";

const periodLabel = periodKeyLabel;

export default function TasksPage() {
  const router = useRouter();
  const { clients } = useOrgDirectory();
  const [authChecked, setAuthChecked] = useState(false);
  const [clientId, setClientId] = useState("");
  const [status, setStatus] = useState<DocumentStatusSummary | null>(null);
  const { firmTasks, loading: firmLoading, error: firmError } = useFirmTasks(authChecked);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const user = loadCurrentUser();
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
    if (!clientId || !authChecked) return;
    setClientScope(clientId);
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const summary = await fetchDocumentStatus(clientId, controller.signal);
        setStatus(summary);
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          setError("タスク一覧の取得に失敗しました。");
        }
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [clientId, authChecked]);

  const isFirmDirector = resolvePersonaId(user) === "firm_director";
  const isFirmStaffMain = resolvePersonaId(user) === "firm_staff_main";
  const isFirmStaffSupport = resolvePersonaId(user) === "firm_staff_support";
  const clientNameById = useMemo(
    () => Object.fromEntries(clients.map((c) => [c.id, c.name])),
    [clients],
  );
  const showFirmPanel = isFirmDirector && firmTasks;
  const showSupportPanel = isFirmStaffSupport && firmTasks;

  const incompletePeriods = (status?.periods ?? []).filter((p) => !p.complete);
  const approvalItems = (status?.periods ?? []).flatMap((p) =>
    (p.pending_approval ?? []).map((slot) => ({
      periodKey: p.period_key,
      slot,
    })),
  );

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-700">
      <header className="border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
        <div className="mx-auto flex max-w-3xl items-center gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            マトリクスへ
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-black text-slate-800">
              {isFirmDirector
                ? "承認待ち・事務所タスク"
                : isFirmStaffSupport
                  ? "レビュー待ち"
                  : "今日やること"}
            </h1>
            <p className="text-xs text-slate-500">
              {isFirmDirector
                ? "全顧問先の承認キューと不足資料"
                : isFirmStaffSupport
                  ? "照合・承認が必要な資料一覧"
                  : "顧問先ごとの不足資料・承認待ち"}
            </p>
          </div>
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
          <AuthNavButtons variant="light" />
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 p-6">
        {loading && (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            読み込み中…
          </p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}

        {isFirmStaffMain && firmTasks && (
          <section className="rounded-xl border border-sky-200 bg-sky-50/50 p-4 shadow-sm">
            <h2 className="text-sm font-bold text-sky-900">担当分の不足資料</h2>
            <p className="mt-1 text-xs text-sky-800/80">合計 {firmTasks.missing_total} 点</p>
            <div className="mt-3">
              <TodayTasksWidget
                items={firmTasks.items}
                clientNameById={clientNameById}
                loading={firmLoading}
                error={firmError}
                maxItems={30}
              />
            </div>
          </section>
        )}

        {showSupportPanel && firmTasks && (
          <section className="rounded-xl border border-violet-200 bg-violet-50/50 p-4 shadow-sm">
            <h2 className="text-sm font-bold text-violet-900">レビュー待ち（全社）</h2>
            <p className="mt-1 text-xs text-violet-800/80">
              合計 {firmTasks.pending_approval_total} 点
            </p>
            <div className="mt-3">
              <ApprovalQueueWidget
                items={firmTasks.items}
                clientNameById={clientNameById}
                loading={firmLoading}
                error={firmError}
                maxItems={30}
              />
            </div>
          </section>
        )}

        {showFirmPanel && firmTasks && (
          <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 shadow-sm">
              <h2 className="text-sm font-bold text-amber-900">承認キュー（全社）</h2>
              <p className="mt-1 text-xs text-amber-800/80">
                合計 {firmTasks.pending_approval_total} 点
              </p>
              <div className="mt-3">
                <ApprovalQueueWidget
                  items={firmTasks.items}
                  clientNameById={clientNameById}
                  loading={firmLoading}
                  error={firmError}
                  maxItems={20}
                />
              </div>
            </section>
            <section className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 shadow-sm">
              <h2 className="text-sm font-bold text-indigo-900">顧問先別進捗</h2>
              <p className="mt-1 text-xs text-indigo-800/80">
                不足 {firmTasks.missing_total} 点 · 顧問先 {firmTasks.client_count} 社
              </p>
              <div className="mt-3">
                <FirmProgressWidget
                  clients={firmTasks.clients}
                  clientNameById={clientNameById}
                  loading={firmLoading}
                  error={firmError}
                />
              </div>
            </section>
          </div>
        )}

        {!loading && status && (
          <>
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-bold text-slate-800">サマリ</h2>
              <ul className="mt-2 space-y-1 text-sm">
                <li>
                  不足資料合計: <strong>{status.missing_total}</strong> 点
                </li>
                <li>
                  承認待ち: <strong>{status.pending_approval_total ?? 0}</strong> 点
                </li>
                <li>
                  未完了の期間: <strong>{status.incomplete_count}</strong> /{" "}
                  {status.started_count}
                </li>
              </ul>
            </section>

            {approvalItems.length > 0 && (
              <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                <h2 className="text-sm font-bold text-amber-900">承認待ち</h2>
                <ul className="mt-2 space-y-2">
                  {approvalItems.map((item) => (
                    <li
                      key={`${item.periodKey}-${item.slot}`}
                      className="flex items-start gap-2 text-sm text-amber-950"
                    >
                      <Circle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                      <span>
                        <span className="font-mono text-[10px] text-amber-700">
                          {periodLabel(item.periodKey)}
                        </span>
                        <br />
                        {item.slot}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-bold text-slate-800">期間別の不足</h2>
              {incompletePeriods.length === 0 ? (
                <p className="mt-2 flex items-center gap-2 text-sm text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" aria-hidden />
                  すべての期間で必須資料が揃っています。
                </p>
              ) : (
                <ul className="mt-3 space-y-4">
                  {incompletePeriods.map((p) => (
                    <li key={p.period_key} className="border-t border-slate-100 pt-3 first:border-0 first:pt-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-bold text-slate-800">{periodLabel(p.period_key)}</span>
                        <span className="text-xs text-slate-500">
                          {p.filled_count}/{p.required_count}
                        </span>
                      </div>
                      {p.missing.length > 0 ? (
                        <ul className="mt-2 space-y-1 text-sm text-slate-600">
                          {p.missing.map((m) => (
                            <li key={m} className="flex items-center gap-2">
                              <Circle className="h-3 w-3 text-slate-400" aria-hidden />
                              {m}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <p className="text-center text-xs text-slate-500">
              自動振り分けの要確認・差戻しは{" "}
              <Link href="/" className="font-bold text-blue-600 hover:underline">
                マトリクス画面
              </Link>
              の「今日やること」パネルで確認できます。
            </p>
          </>
        )}
      </main>
    </div>
  );
}
