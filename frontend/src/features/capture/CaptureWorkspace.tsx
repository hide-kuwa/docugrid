"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Filter } from "lucide-react";
import { CaptureZone } from "@/features/capture/components/CaptureZone";
import { MasonryGallery } from "@/features/capture/components/MasonryGallery";
import {
  listCaptureItems,
  patchCaptureItem,
  uploadCaptureItem,
  verifyInvoiceNumber,
  type InvoiceVerifyResult,
} from "@/features/capture/lib/capture-api";
import type { CaptureCategory, CaptureItem } from "@/features/capture/types";
import { fetchClientMaster } from "@/lib/client-master-api";
import type { OrgClient } from "@/config/organization";
import { checkSession, loadCurrentUser } from "@/lib/auth";
import { setClientScope } from "@/lib/api-auth";
import { resolvePersona } from "@/lib/persona";
import { WipSection } from "@/components/work-in-progress";

const CATEGORY_OPTIONS: { id: CaptureCategory; label: string }[] = [
  { id: "general", label: "一般" },
  { id: "expense", label: "経費" },
  { id: "marufu", label: "まるふ" },
  { id: "deduction_cert", label: "控除証明書" },
];

export function CaptureWorkspace() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [clients, setClients] = useState<OrgClient[]>([]);
  const [clientId, setClientId] = useState("");
  const [category, setCategory] = useState<CaptureCategory>("general");
  const [items, setItems] = useState<CaptureItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "needs_review">("all");
  const [invoiceInput, setInvoiceInput] = useState("");
  const [invoiceResult, setInvoiceResult] = useState<InvoiceVerifyResult | null>(null);
  const [invoiceBusy, setInvoiceBusy] = useState(false);

  const reload = useCallback(async (cid: string) => {
    if (!cid) return;
    setLoading(true);
    setError(null);
    try {
      const list = await listCaptureItems(cid, {
        status: filter === "needs_review" ? "needs_review" : undefined,
      });
      setItems(list);
    } catch {
      setError("資料の読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void (async () => {
      const session = await checkSession();
      if (session !== "ok") {
        router.replace("/login?reason=session");
        return;
      }
      const user = loadCurrentUser();
      const persona = resolvePersona(user);
      if (persona.id === "client_sales_expense") {
        setCategory("expense");
      }
      try {
        const master = await fetchClientMaster();
        setClients(master.clients);
        const stored =
          typeof window !== "undefined"
            ? localStorage.getItem("docugrid.currentClientId") ?? ""
            : "";
        const initial = stored && master.clients.some((c) => c.id === stored)
          ? stored
          : master.clients[0]?.id ?? "";
        setClientId(initial);
        if (initial) setClientScope(initial);
      } catch {
        setError("顧問先一覧の取得に失敗しました");
      }
      setReady(true);
    })();
  }, [router]);

  useEffect(() => {
    if (clientId) void reload(clientId);
  }, [clientId, reload]);

  const handleUpload = async (files: File[]) => {
    if (!clientId || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of files) {
        const item = await uploadCaptureItem({ clientId, file, category });
        setItems((prev) => [item, ...prev.filter((p) => p.id !== item.id)]);
      }
    } catch {
      setError("アップロードに失敗しました");
    } finally {
      setUploading(false);
    }
  };

  const handleConfirm = async (item: CaptureItem) => {
    try {
      const updated = await patchCaptureItem(
        item.id,
        { status: "confirmed", pinned: false },
        clientId,
      );
      setItems((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    } catch {
      setError("ステータスの更新に失敗しました");
    }
  };

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        読み込み中…
      </div>
    );
  }

  const activeClient = clients.find((c) => c.id === clientId);

  return (
    <div className="flex min-h-screen flex-col bg-slate-100">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
          <button
            type="button"
            className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
            onClick={() => router.push("/")}
          >
            <ArrowLeft className="h-4 w-4" />
            戻る
          </button>
          <h1 className="text-lg font-bold text-slate-900">撮影・資料ギャラリー</h1>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <select
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value);
                setClientScope(e.target.value);
              }}
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
              value={category}
              onChange={(e) => setCategory(e.target.value as CaptureCategory)}
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm ${
                filter === "needs_review"
                  ? "bg-rose-100 text-rose-700"
                  : "bg-slate-100 text-slate-600"
              }`}
              onClick={() => setFilter((f) => (f === "all" ? "needs_review" : "all"))}
            >
              <Filter className="h-4 w-4" />
              要確認のみ
            </button>
          </div>
        </div>
        {activeClient ? (
          <p className="mx-auto mt-1 max-w-6xl text-xs text-slate-500">{activeClient.name}</p>
        ) : null}
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-4">
        {error ? (
          <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</div>
        ) : null}
        <WipSection
          kind="mock"
          title="インボイス登録番号の確認"
          message="国税庁API連携前のローカル検証です。サンプル: T8326405515335"
          bodyClassName="p-4"
        >
          <div className="flex flex-wrap items-end gap-2">
            <input
              type="text"
              className="min-w-[14rem] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="T8326405515335"
              value={invoiceInput}
              onChange={(e) => setInvoiceInput(e.target.value)}
            />
            <button
              type="button"
              disabled={invoiceBusy || !invoiceInput.trim()}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50"
              onClick={() => {
                void (async () => {
                  setInvoiceBusy(true);
                  setInvoiceResult(null);
                  try {
                    const result = await verifyInvoiceNumber(invoiceInput.trim(), clientId);
                    setInvoiceResult(result);
                  } catch {
                    setError("インボイス番号の検証に失敗しました");
                  } finally {
                    setInvoiceBusy(false);
                  }
                })();
              }}
            >
              {invoiceBusy ? "確認中…" : "検証"}
            </button>
          </div>
          {invoiceResult ? (
            <div
              className={`mt-3 rounded-lg px-3 py-2 text-xs ${
                invoiceResult.checksum_valid && invoiceResult.registration_status === "active"
                  ? "bg-emerald-50 text-emerald-800"
                  : "bg-amber-50 text-amber-900"
              }`}
            >
              <p className="font-medium">
                {invoiceResult.normalized ?? invoiceInput}
                {invoiceResult.issuer_name ? ` · ${invoiceResult.issuer_name}` : ""}
              </p>
              <p className="mt-1">
                形式: {invoiceResult.format_valid ? "OK" : "NG"} / チェックデジット:{" "}
                {invoiceResult.checksum_valid ? "OK" : "NG"} / 状態:{" "}
                {invoiceResult.registration_status ?? "—"}
              </p>
              {(invoiceResult.issues ?? []).map((msg) => (
                <p key={msg} className="mt-1">
                  {msg}
                </p>
              ))}
            </div>
          ) : null}
        </WipSection>
        <CaptureZone category={category} uploading={uploading} onFiles={(f) => void handleUpload(f)} />
        {loading ? (
          <p className="text-center text-sm text-slate-500">読み込み中…</p>
        ) : (
          <MasonryGallery
            items={items}
            clientId={clientId}
            onConfirm={(item) => void handleConfirm(item)}
            onRouted={(item) => {
              setItems((prev) => prev.map((p) => (p.id === item.id ? item : p)));
            }}
          />
        )}
      </main>
    </div>
  );
}
