"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, UserPlus } from "lucide-react";
import { PERSONAS } from "@/config/personas";
import { ConfigSheetIntro } from "@/features/config/components/ConfigSheetIntro";
import {
  fetchFirmOnboarding,
  inviteFirmMember,
  type FirmOnboardingInfo,
} from "@/features/org/firm-onboarding-api";
import {
  fetchFirmMembers,
  patchFirmMemberStatus,
  type FirmMemberRow,
} from "@/features/org/firm-members-api";
import { parseApiErrorBody } from "@/lib/parse-api-error";

function statusLabel(status: string): string {
  if (status === "active") return "有効";
  if (status === "pending") return "承認待ち";
  return "無効";
}

function statusClass(status: string): string {
  if (status === "active") return "bg-emerald-50 text-emerald-700";
  if (status === "pending") return "bg-amber-50 text-amber-800";
  return "bg-slate-200 text-slate-600";
}

export function FirmMembersPanel() {
  const [rows, setRows] = useState<FirmMemberRow[]>([]);
  const [onboarding, setOnboarding] = useState<FirmOnboardingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [lastInviteUrl, setLastInviteUrl] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      setRows(await fetchFirmMembers());
      try {
        setOnboarding(await fetchFirmOnboarding());
      } catch {
        setOnboarding(null);
      }
    } catch (e) {
      setMessage(parseApiErrorBody(e) || "メンバー一覧の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleStatus = async (row: FirmMemberRow) => {
    if (row.status === "pending") return;
    const next = row.status === "active" ? "inactive" : "active";
    try {
      const updated = await patchFirmMemberStatus(row.id, next);
      setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setMessage(`${row.email} を ${next === "active" ? "有効" : "無効"} にしました`);
    } catch (e) {
      setMessage(parseApiErrorBody(e) || "更新に失敗しました");
    }
  };

  const approvePending = async (row: FirmMemberRow) => {
    try {
      const updated = await patchFirmMemberStatus(row.id, "active");
      setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setMessage(`${row.email} を承認しました`);
      void load();
    } catch (e) {
      setMessage(parseApiErrorBody(e) || "承認に失敗しました");
    }
  };

  const rejectPending = async (row: FirmMemberRow) => {
    try {
      const updated = await patchFirmMemberStatus(row.id, "inactive");
      setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setMessage(`${row.email} の参加申請を却下しました`);
      void load();
    } catch (e) {
      setMessage(parseApiErrorBody(e) || "却下に失敗しました");
    }
  };

  const handleInvite = async () => {
    const email = inviteEmail.trim();
    if (!email) return;
    setInviting(true);
    setMessage("");
    try {
      const result = await inviteFirmMember(email);
      setLastInviteUrl(result.inviteUrl);
      setInviteEmail("");
      setMessage(`${email} に招待リンクを発行しました`);
    } catch (e) {
      setMessage(parseApiErrorBody(e) || "招待の作成に失敗しました");
    } finally {
      setInviting(false);
    }
  };

  const copyJoinCode = async () => {
    if (!onboarding?.joinCode) return;
    try {
      await navigator.clipboard.writeText(onboarding.joinCode);
      setMessage("事務所コードをコピーしました");
    } catch {
      setMessage(`事務所コード: ${onboarding.joinCode}`);
    }
  };

  const copyInviteUrl = async () => {
    if (!lastInviteUrl) return;
    try {
      await navigator.clipboard.writeText(lastInviteUrl);
      setMessage("招待リンクをコピーしました");
    } catch {
      setMessage(lastInviteUrl);
    }
  };

  const personaLabel = (id: string) =>
    PERSONAS.find((p) => p.id === id)?.shortLabel || id;

  const pendingRows = rows.filter((r) => r.status === "pending");

  return (
    <section className="fade-in-up space-y-4">
      <ConfigSheetIntro
        sheetId="stakeholders"
        sheetLabel="MEMBERS"
        title="メンバー管理"
        description="代表アカウントがメンバーを招待・承認します。スタッフは招待リンクまたは事務所コードで参加申請できます。"
      />

      {onboarding ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">事務所コード</p>
          <p className="mt-1 text-sm text-slate-600">
            スタッフが参加申請するときに入力するコードです（{onboarding.firmLabel}）
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="rounded-lg bg-slate-100 px-3 py-2 text-lg font-black tracking-widest text-slate-800">
              {onboarding.joinCode}
            </code>
            <button
              type="button"
              onClick={() => void copyJoinCode()}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              <Copy className="h-3.5 w-3.5" />
              コピー
            </button>
            {onboarding.pendingCount > 0 ? (
              <span className="text-xs font-bold text-amber-700">
                承認待ち {onboarding.pendingCount} 件
              </span>
            ) : null}
          </div>

          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="text-xs font-bold text-slate-500">メールで招待</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="staff@example.com"
                className="min-w-[220px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={inviting || !inviteEmail.trim()}
                onClick={() => void handleInvite()}
                className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-black disabled:opacity-50"
              >
                <UserPlus className="h-3.5 w-3.5" />
                招待を発行
              </button>
            </div>
            {lastInviteUrl ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <code className="max-w-full truncate rounded bg-slate-50 px-2 py-1 text-[10px] text-slate-600">
                  {lastInviteUrl}
                </code>
                <button
                  type="button"
                  onClick={() => void copyInviteUrl()}
                  className="text-[10px] font-bold text-blue-600 hover:underline"
                >
                  リンクをコピー
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {pendingRows.length > 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
          <p className="text-sm font-bold text-amber-900">承認待ちの参加申請</p>
          <ul className="mt-2 space-y-2">
            {pendingRows.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-sm"
              >
                <span className="font-medium text-slate-800">{row.email}</span>
                <span className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void approvePending(row)}
                    className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-800"
                  >
                    承認
                  </button>
                  <button
                    type="button"
                    onClick={() => void rejectPending(row)}
                    className="rounded border border-slate-300 px-2 py-1 text-[10px] font-bold text-slate-600"
                  >
                    却下
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500">読み込み中…</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">メール</th>
                <th className="px-4 py-3">ペルソナ</th>
                <th className="px-4 py-3">ロール</th>
                <th className="px-4 py-3">状態</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50/80">
                  <td className="px-4 py-3 font-medium text-slate-800">{row.email}</td>
                  <td className="px-4 py-3">{personaLabel(row.persona_id)}</td>
                  <td className="px-4 py-3 font-mono text-[10px]">{row.firm_role}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusClass(row.status)}`}
                    >
                      {statusLabel(row.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {row.status === "pending" ? (
                      <span className="text-[10px] text-slate-400">上で承認</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void toggleStatus(row)}
                        className="rounded border border-slate-300 px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-100"
                      >
                        {row.status === "active" ? "無効化" : "有効化"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {message && <p className="text-sm text-slate-600">{message}</p>}
    </section>
  );
}
