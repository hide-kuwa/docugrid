"use client";

import { useCallback, useEffect, useState } from "react";
import { PERSONAS } from "@/config/personas";
import { ConfigSheetIntro } from "@/features/config/components/ConfigSheetIntro";
import {
  fetchFirmMembers,
  patchFirmMemberStatus,
  type FirmMemberRow,
} from "@/features/org/firm-members-api";
import { parseApiErrorBody } from "@/lib/parse-api-error";

export function FirmMembersPanel() {
  const [rows, setRows] = useState<FirmMemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      setRows(await fetchFirmMembers());
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
    const next = row.status === "active" ? "inactive" : "active";
    try {
      const updated = await patchFirmMemberStatus(row.id, next);
      setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setMessage(`${row.email} を ${next === "active" ? "有効" : "無効"} にしました`);
    } catch (e) {
      setMessage(parseApiErrorBody(e) || "更新に失敗しました");
    }
  };

  const personaLabel = (id: string) =>
    PERSONAS.find((p) => p.id === id)?.shortLabel || id;

  return (
    <section className="fade-in-up space-y-4">
      <ConfigSheetIntro
        sheetId="stakeholders"
        sheetLabel="MEMBERS"
        title="メンバー一覧（firm_members）"
        description="ログイン可能なメンバーとペルソナ。無効にするとログインできなくなります。"
      />
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
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        row.status === "active"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {row.status === "active" ? "有効" : "無効"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => void toggleStatus(row)}
                      className="rounded border border-slate-300 px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-100"
                    >
                      {row.status === "active" ? "無効化" : "有効化"}
                    </button>
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
