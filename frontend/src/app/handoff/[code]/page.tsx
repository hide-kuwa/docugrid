"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { DocuGridLogo } from "@/components/brand";
import {
  fetchPublicTransfer,
  statusLabelJa,
  type PublicTransferView,
} from "@/features/org/client-transfer-api";

export default function HandoffCodePage() {
  const params = useParams();
  const codeParam = String(params?.code ?? "").trim().toUpperCase();
  const [view, setView] = useState<PublicTransferView | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [shareHint, setShareHint] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      setError("");
      try {
        const data = await fetchPublicTransfer(codeParam);
        if (!active) return;
        if (!data) {
          setError("移管コードが見つかりません。URL をご確認ください。");
          setView(null);
        } else {
          setView(data);
        }
      } catch {
        if (active) setError("情報を取得できませんでした。時間をおいて再度お試しください。");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [codeParam]);

  const onCopy = async () => {
    if (!view?.code) return;
    try {
      await navigator.clipboard.writeText(view.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const onShare = async () => {
    if (!view?.code) return;
    const url = typeof window !== "undefined" ? window.location.href : "";
    const text = `顧問先「${view.clientDisplayName}」の移管コード: ${view.code}`;
    setShareHint("");
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "DocuGrid 移管コード", text, url });
        return;
      }
      await navigator.clipboard.writeText(url || view.code);
      setShareHint("リンクをコピーしました");
      window.setTimeout(() => setShareHint(""), 2500);
    } catch {
      /* user cancelled share */
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-b from-slate-50 via-white to-teal-50/40 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] sm:py-10">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 flex justify-center sm:mb-8">
          <DocuGridLogo size="md" surface="light" showSubtitle />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h1 className="text-lg font-black text-slate-900">顧問先の移管コード</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            税理士変更のときに、新しい事務所へこのコードを伝えてください。ログインは不要です。
          </p>

          {loading ? (
            <p className="mt-6 text-sm text-slate-500">読み込み中…</p>
          ) : error ? (
            <p className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>
          ) : view ? (
            <div className="mt-6 space-y-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">顧問先</p>
                <p className="mt-1 text-base font-bold text-slate-800">{view.clientDisplayName}</p>
              </div>
              <div className="rounded-xl border border-teal-200 bg-teal-50/80 px-4 py-4 text-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-teal-700">移管コード</p>
                <p className="mt-2 break-all font-mono text-xl font-black tracking-[0.15em] text-teal-950 sm:text-2xl sm:tracking-[0.2em]">
                  {view.code}
                </p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-center">
                  <button
                    type="button"
                    onClick={() => void onCopy()}
                    className="inline-flex min-h-11 items-center justify-center rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-800"
                  >
                    {copied ? "コピーしました" : "コードをコピー"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void onShare()}
                    className="inline-flex min-h-11 items-center justify-center rounded-lg border border-teal-300 bg-white px-4 py-2.5 text-sm font-bold text-teal-800 hover:bg-teal-50"
                  >
                    共有する
                  </button>
                </div>
                {shareHint ? (
                  <p className="mt-2 text-xs font-medium text-teal-700">{shareHint}</p>
                ) : null}
              </div>
              <dl className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                <div>
                  <dt className="font-bold text-slate-400">状態</dt>
                  <dd>{statusLabelJa(view.status)}</dd>
                </div>
                <div>
                  <dt className="font-bold text-slate-400">有効期限</dt>
                  <dd>{view.expiresAt.slice(0, 10)}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="font-bold text-slate-400">含まれる資料数</dt>
                  <dd>{view.documentCount} 件（詳細は新事務所のみ確認）</dd>
                </div>
              </dl>
              {view.status !== "pending" ? (
                <p className="text-xs font-medium text-amber-700">
                  このコードは現在「{statusLabelJa(view.status)}」です。新しい事務所へは使えません。
                </p>
              ) : (
                <p className="text-xs leading-relaxed text-slate-500">
                  新しい税理士法人の担当者に、このページの URL またはコードを渡してください。暗証番号などの秘密情報はこの画面には出ません。
                </p>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
