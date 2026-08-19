"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import {
  fetchTaxProgressBoard,
  updateTaxProgressCell,
  type TaxProgressBoard,
  type TaxProgressCell,
} from "@/features/tax-progress/tax-progress-api";
import { parseApiErrorBody } from "@/lib/parse-api-error";

function fmtDue(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${Number(m[2])}/${Number(m[3])}`;
}

function CellButton({
  cell,
  busy,
  onCycle,
}: {
  cell: TaxProgressCell;
  busy: boolean;
  onCycle: () => void;
}) {
  const due = fmtDue(cell.due_on);
  if (cell.status === "done") {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={onCycle}
        className="min-w-[4.5rem] rounded border border-sky-200 bg-sky-100 px-1.5 py-1 text-[11px] font-bold text-sky-900 hover:bg-sky-200 disabled:opacity-50"
        title="クリックで未完了に戻す"
      >
        {fmtDue(cell.completed_on) || "完了"}
      </button>
    );
  }
  if (cell.status === "na") {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={onCycle}
        className="min-w-[4.5rem] rounded border border-slate-200 bg-slate-100 px-1.5 py-1 text-[11px] font-bold text-slate-500 disabled:opacity-50"
      >
        —
      </button>
    );
  }
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onCycle}
      className="min-w-[4.5rem] rounded border border-rose-100 bg-rose-50/80 px-1.5 py-1 text-[11px] font-bold text-rose-800 hover:bg-rose-100 disabled:opacity-50"
      title="クリックで完了にする"
    >
      未{due ? `(${due})` : ""}
    </button>
  );
}

export function TaxProgressMain() {
  const [pack, setPack] = useState("closing");
  const [fiscalMonth, setFiscalMonth] = useState<number | "">("");
  const [assigneeId, setAssigneeId] = useState("");
  const [data, setData] = useState<TaxProgressBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [showAll, setShowAll] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const board = await fetchTaxProgressBoard({
        pack,
        fiscalMonth: fiscalMonth === "" ? undefined : fiscalMonth,
        assigneeId: assigneeId || undefined,
      });
      setData(board);
    } catch (e) {
      setMessage(parseApiErrorBody(e) || "進捗の読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [pack, fiscalMonth, assigneeId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const assignees = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of data?.rows ?? []) {
      if (row.primary_assignee_id) {
        map.set(row.primary_assignee_id, row.primary_assignee_name || row.primary_assignee_id);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [data]);

  const cycleCell = async (clientId: string, cell: TaxProgressCell) => {
    const next =
      cell.status === "pending" ? "done" : cell.status === "done" ? "na" : "pending";
    setBusy(true);
    try {
      await updateTaxProgressCell({
        client_id: clientId,
        pack,
        stage_id: cell.stage_id,
        status: next,
        cycle_key: data?.cycle_key,
      });
      await reload();
    } catch (e) {
      setMessage(parseApiErrorBody(e) || "更新に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const doneLabel = data
    ? `完了: ${data.summary.done_cells}/${data.summary.total_cells}件`
    : "";

  return (
    <div data-tour="tax-board" className="flex min-h-0 flex-1 flex-col bg-slate-50">
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-teal-700">Tax</p>
            <h1 className="text-lg font-black text-slate-800">税務進捗ボード</h1>
            <p className="text-[11px] text-slate-500">
              決算・中間・源泉を横断管理。期限は決算月から自動、完了は手動（クリック）または今後スロット連携で自動。
            </p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <label className="text-[10px] font-bold text-slate-500">
              対象
              <select
                className="ml-1 rounded border border-slate-200 px-2 py-1 text-xs"
                value={pack}
                onChange={(e) => setPack(e.target.value)}
              >
                {(data?.packs ?? [
                  { id: "closing", label: "決算・申告" },
                  { id: "interim", label: "中間納税" },
                  { id: "withholding", label: "源泉" },
                ]).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[10px] font-bold text-slate-500">
              決算月
              <select
                className="ml-1 rounded border border-slate-200 px-2 py-1 text-xs"
                value={fiscalMonth === "" ? "" : String(fiscalMonth)}
                onChange={(e) =>
                  setFiscalMonth(e.target.value ? Number(e.target.value) : "")
                }
              >
                <option value="">すべて</option>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {m}月
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[10px] font-bold text-slate-500">
              担当者
              <select
                className="ml-1 rounded border border-slate-200 px-2 py-1 text-xs"
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
              >
                <option value="">すべて</option>
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700">
              {doneLabel}
            </span>
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-700"
            >
              {showAll ? "未完了のみ" : "全件表示"}
            </button>
            <button
              type="button"
              disabled={loading || busy}
              onClick={() => void reload()}
              className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              title="再読込"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
        {message ? <p className="mt-2 text-xs text-rose-600">{message}</p> : null}
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        {loading && !data ? (
          <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            読み込み中…
          </div>
        ) : !data?.rows.length ? (
          <div className="p-8 text-center text-sm text-slate-500">
            表示する顧問先がありません。顧客マスタと担当割当を確認してください。
          </div>
        ) : (
          <table className="w-max min-w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-800 text-white">
              <tr>
                <th className="sticky left-0 z-20 bg-slate-800 px-2 py-2 font-bold">コード</th>
                <th className="sticky left-[4.5rem] z-20 bg-slate-800 px-2 py-2 font-bold">
                  顧客名
                </th>
                <th className="px-2 py-2 font-bold">主担当</th>
                <th className="px-2 py-2 font-bold">決算月</th>
                <th className="px-2 py-2 font-bold">備考</th>
                {data.stages.map((s) => (
                  <th key={s.id} className="min-w-[5rem] px-1.5 py-2 text-center font-bold">
                    <div className="leading-tight">{s.label}</div>
                    <div className="mt-0.5 text-[9px] font-normal text-slate-300">
                      +{s.due_offset_days}日
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows
                .filter((row) =>
                  showAll ? true : row.stages.some((s) => s.status === "pending"),
                )
                .map((row, idx) => (
                <tr
                  key={row.client_id}
                  className={idx % 2 === 0 ? "bg-rose-50/40" : "bg-white"}
                >
                  <td className="sticky left-0 z-[1] bg-inherit px-2 py-1.5 font-mono text-[10px] text-slate-500">
                    {row.client_code || "—"}
                  </td>
                  <td className="sticky left-[4.5rem] z-[1] bg-inherit px-2 py-1.5 font-bold text-slate-800">
                    {row.client_name}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-slate-600">
                    {row.primary_assignee_name || "—"}
                  </td>
                  <td className="px-2 py-1.5 text-slate-600">{row.fiscal_month}月</td>
                  <td className="max-w-[10rem] truncate px-2 py-1.5 text-slate-500" title={row.note}>
                    {row.note || ""}
                  </td>
                  {row.stages.map((cell) => (
                    <td key={cell.stage_id} className="px-1 py-1 text-center">
                      <CellButton
                        cell={cell}
                        busy={busy}
                        onCycle={() => void cycleCell(row.client_id, cell)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
