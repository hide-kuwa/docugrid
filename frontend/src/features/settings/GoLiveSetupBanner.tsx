"use client";

import Link from "next/link";

type Props = {
  clientCount: number;
  driveConnected: boolean;
  driveConfigured: boolean;
  onOpenClients: () => void;
  onOpenMigration: () => void;
  onOpenDrive: () => void;
  onStartTour: () => void;
};

/**
 * 本格稼働の最初のステップ（顧客CSV・任意ZIP整理・Google Drive）を設定画面で案内する。
 */
export function GoLiveSetupBanner({
  clientCount,
  driveConnected,
  driveConfigured,
  onOpenClients,
  onOpenMigration,
  onOpenDrive,
  onStartTour,
}: Props) {
  const driveReady = driveConnected && driveConfigured;
  const clientsReady = clientCount > 0;

  return (
    <section
      data-tour="go-live-banner"
      className="mb-6 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-sky-50 p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
            本格稼働 · はじめのステップ
          </p>
          <h2 className="mt-1 text-base font-black text-slate-900">顧客一覧 · 初回整理 · Google Drive</h2>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-600">
            資料は <strong className="font-semibold text-slate-800">まず DocuGrid サーバー</strong>に保存し、Drive
            連携 ON なら同じ PDF をミラーします。
            <Link href="/help?id=storage-story" className="ml-1 font-bold text-emerald-700 hover:underline">
              保存の考え方
            </Link>
          </p>
        </div>
        <button
          type="button"
          onClick={onStartTour}
          className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800"
        >
          チュートリアルを開始
        </button>
      </div>

      <ol className="mt-4 grid gap-3 lg:grid-cols-3">
        <li
          data-tour="go-live-step-clients"
          className={`rounded-xl border p-4 ${
            clientsReady ? "border-emerald-300 bg-white" : "border-slate-200 bg-white/80"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-slate-800">1. 顧客一覧（CSV）</p>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                clientsReady ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
              }`}
            >
              {clientsReady ? `${clientCount} 件` : "未整備"}
            </span>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
            サンプル CSV をダウンロード → 事務所の一覧に合わせて編集 → 取り込み → 保存。
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onOpenClients}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
            >
              顧客マスタを開く
            </button>
            <Link
              href="/help?id=client-csv"
              className="rounded-lg px-3 py-1.5 text-[11px] font-bold text-emerald-700 hover:underline"
            >
              ヘルプ
            </Link>
          </div>
        </li>

        <li
          data-tour="go-live-step-migration"
          className="rounded-xl border border-violet-200 bg-white/90 p-4"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-slate-800">2. 初回 ZIP 整理（任意）</p>
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-800">
              旧データ移行
            </span>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
            旧 PC や Drive のバックアップ ZIP を投入。Drive が満杯でもサーバーへ先に載せられます。
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onOpenMigration}
              className="rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-[11px] font-bold text-violet-800 hover:bg-violet-50"
            >
              整理パネルを開く
            </button>
            <Link
              href="/help?id=migration"
              className="rounded-lg px-3 py-1.5 text-[11px] font-bold text-violet-700 hover:underline"
            >
              ヘルプ
            </Link>
          </div>
        </li>

        <li
          data-tour="go-live-step-drive"
          className={`rounded-xl border p-4 ${
            driveReady ? "border-emerald-300 bg-white" : "border-slate-200 bg-white/80"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-slate-800">3. Google Drive</p>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                driveReady ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
              }`}
            >
              {driveReady ? "接続済み" : "未接続"}
            </span>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
            整理後の PDF を Drive にもミラー。共有ドライブ（またはメンバー共有）で所内から見えるようにします。
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onOpenDrive}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
            >
              Drive 設定を開く
            </button>
            <Link
              href="/help?id=google-drive"
              className="rounded-lg px-3 py-1.5 text-[11px] font-bold text-emerald-700 hover:underline"
            >
              ヘルプ
            </Link>
          </div>
        </li>
      </ol>
    </section>
  );
}
