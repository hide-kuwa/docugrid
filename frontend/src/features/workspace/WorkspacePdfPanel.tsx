"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  ChevronLeft,
  FolderOpen,
  Loader2,
  Search,
  Upload,
  X,
} from "lucide-react";
import {
  fetchSlotDocumentFile,
  listSlotDocuments,
  type SlotDocumentItem,
} from "@/features/docugrid/lib/slot-documents";
import {
  PDF_WORKSPACE_SLOT_ID,
  PDF_WORKSPACE_SLOT_LABEL,
  useViewerUiStore,
} from "@/features/pdf-viewer/state/viewer-ui-store";
import type { NavClient } from "@/lib/client-nav";

type Props = {
  clients: NavClient[];
  periodKey: string;
};

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

/**
 * iLovePDF-inspired clean PDF open surface: primary CTA + DnD + DocuGrid picker.
 * Mid-column intentionally omitted — one focused composition.
 */
export function WorkspacePdfMain({ clients, periodKey }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pickerSearchRef = useRef<HTMLInputElement>(null);
  const openViewer = useViewerUiStore((s) => s.open);
  const setSourceFile = useViewerUiStore((s) => s.setSourceFile);
  const isViewerOpen = useViewerUiStore((s) => s.isOpen);
  const draftFile = useViewerUiStore((s) => s.sourceFile);
  const draftBind = useViewerUiStore((s) => s.pdfWorkspaceBind);
  const showResume = Boolean(draftFile && !isViewerOpen);

  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [docs, setDocs] = useState<SlotDocumentItem[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);

  const selectedClient = clients.find((c) => c.id === selectedClientId) ?? null;
  const hasClient = Boolean(selectedClient);
  /** 顧問先マスタがあるときだけ紐付け UI（未ログイン / 顧問先なしでは出さない） */
  const showClientBinding = clients.length > 0;
  /** モーダル内: 顧問先未選択なら先に顧問先一覧 */
  const pickingClient = pickerOpen && showClientBinding && !selectedClient;

  const filteredClients = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => c.name.toLowerCase().includes(q));
  }, [clients, pickerQuery]);

  const filteredDocs = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter((item) => {
      const hay = [item.original_name, item.slot_label, item.slot_id, item.period_key]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [docs, pickerQuery]);

  const openLocalFile = useCallback(
    (file: File) => {
      if (!isPdfFile(file)) {
        setError("PDF ファイルを選んでください");
        return;
      }
      setError(null);
      openViewer("edit", file, undefined, {
        fromPdfWorkspace: true,
        clientId: selectedClient?.id ?? null,
        periodKey,
        slotId: PDF_WORKSPACE_SLOT_ID,
        slotLabel: PDF_WORKSPACE_SLOT_LABEL,
      });
    },
    [openViewer, periodKey, selectedClient?.id],
  );

  const resumeDraft = useCallback(() => {
    if (!draftFile) return;
    setError(null);
    openViewer(
      "edit",
      draftFile,
      undefined,
      draftBind ?? {
        fromPdfWorkspace: true,
        clientId: selectedClient?.id ?? null,
        periodKey,
        slotId: PDF_WORKSPACE_SLOT_ID,
        slotLabel: PDF_WORKSPACE_SLOT_LABEL,
      },
    );
  }, [draftFile, draftBind, openViewer, periodKey, selectedClient?.id]);

  const discardDraft = useCallback(() => {
    setSourceFile(null);
    setError(null);
  }, [setSourceFile]);

  const openFromFiles = useCallback(
    (list: FileList | File[]) => {
      const files = Array.from(list).filter(isPdfFile);
      if (files.length === 0) {
        setError("PDF ファイルを選んでください");
        return;
      }
      openLocalFile(files[0]);
    },
    [openLocalFile],
  );

  const loadDocs = useCallback(async () => {
    if (!selectedClient) {
      setDocs([]);
      return;
    }
    setDocsLoading(true);
    setError(null);
    try {
      const items = await listSlotDocuments(selectedClient.id);
      const sorted = [...items].sort((a, b) =>
        (b.uploaded_at || "").localeCompare(a.uploaded_at || ""),
      );
      setDocs(sorted);
    } catch {
      setError("DocuGrid 内の資料一覧を取得できませんでした");
      setDocs([]);
    } finally {
      setDocsLoading(false);
    }
  }, [selectedClient]);

  useEffect(() => {
    if (!pickerOpen || !selectedClient) return;
    void loadDocs();
  }, [pickerOpen, selectedClient, loadDocs]);

  useEffect(() => {
    if (!pickerOpen || docsLoading) return;
    const t = setTimeout(() => pickerSearchRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [pickerOpen, pickingClient, docsLoading, selectedClientId]);

  const openDocugridPicker = () => {
    setError(null);
    setPickerQuery("");
    setPickerOpen(true);
  };

  const selectPickerClient = (clientId: string) => {
    setSelectedClientId(clientId);
    setPickerQuery("");
    setError(null);
  };

  const backToClientPick = () => {
    setSelectedClientId("");
    setDocs([]);
    setPickerQuery("");
  };

  const openDocugridDoc = async (item: SlotDocumentItem) => {
    setBusy(true);
    setError(null);
    try {
      const file = await fetchSlotDocumentFile(item);
      openViewer("edit", file, undefined, {
        fromPdfWorkspace: true,
        clientId: item.client_id,
        periodKey: item.period_key,
        slotId: item.slot_id,
        docId: item.id,
        slotLabel: item.slot_label || item.slot_id,
      });
      setPickerOpen(false);
    } catch {
      setError(`${item.original_name} を開けませんでした`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-tour="pdf-open"
      className={[
        "relative flex min-h-0 flex-1 flex-col items-center justify-center bg-[#f5f5f7] px-6 transition-colors",
        dragOver ? "bg-teal-50/80" : "",
      ].join(" ")}
      onDragEnter={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        if (e.currentTarget === e.target) setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files?.length) openFromFiles(e.dataTransfer.files);
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) openFromFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <div className="w-full max-w-xl text-center">
        <h1 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
          PDF を開く
        </h1>
        <p className="mt-3 text-sm text-slate-500 sm:text-base">
          注釈・照合・編集。とても簡単でスピーディー。
        </p>

        {showClientBinding ? (
          <label className="mx-auto mt-6 flex w-full max-w-sm flex-col gap-1.5 text-left">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
              対象顧問先
            </span>
            <select
              value={selectedClientId}
              onChange={(e) => {
                setSelectedClientId(e.target.value);
                setError(null);
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
            >
              <option value="">なし（端末上のみ）</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <span className="text-[11px] leading-relaxed text-slate-400">
              {hasClient
                ? "「DocuGridに格納」で、この顧問先の「PDF 作業」枠に保存されます。"
                : "未選択のときは PDF ダウンロードのみ。格納するときは顧問先を選んでから開いてください。"}
            </span>
          </label>
        ) : null}

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          {showResume ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={resumeDraft}
                className="inline-flex min-w-[12rem] items-center justify-center gap-2 rounded-xl bg-teal-600 px-8 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-teal-700 disabled:opacity-60"
              >
                作業中の PDF を続ける
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={discardDraft}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
              >
                破棄して選び直す
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex min-w-[12rem] items-center justify-center gap-2 rounded-xl bg-teal-600 px-8 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-teal-700 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              PDFファイルを選択
            </button>
          )}
          {showClientBinding ? (
            <button
              type="button"
              disabled={busy}
              onClick={openDocugridPicker}
              title="DocuGrid に保存済みの資料から選ぶ"
              className="inline-flex h-12 w-12 items-center justify-center rounded-full border-2 border-teal-600 text-teal-700 transition hover:bg-teal-50 disabled:opacity-60"
              aria-label="DocuGrid から選択"
            >
              <FolderOpen className="h-5 w-5" />
            </button>
          ) : null}
        </div>

        {showResume && draftFile ? (
          <p className="mt-3 text-xs font-medium text-slate-500">下書き: {draftFile.name}</p>
        ) : null}

        <p className="mt-5 text-sm text-slate-400">
          {dragOver ? "ここにドロップして開く" : "または、ここに PDF をドロップしてください"}
        </p>

        {error ? (
          <p className="mt-4 text-sm font-medium text-rose-600" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      {pickerOpen ? (
        <div
          className="absolute inset-0 z-20 flex items-end justify-center bg-slate-900/25 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label={pickingClient ? "顧問先を選択" : "DocuGrid から PDF を選択"}
          onClick={() => setPickerOpen(false)}
        >
          <div
            className="flex max-h-[min(28rem,80vh)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-100 px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {pickingClient ? (
                    <>
                      <p className="text-sm font-bold text-slate-900">顧問先を選択</p>
                      <p className="text-[11px] text-slate-500">
                        DocuGrid の資料を開く顧問先を選んでください
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-bold text-slate-900">DocuGrid から選択</p>
                      <p className="truncate text-[11px] text-slate-500">
                        {selectedClient?.name} の保存済み資料
                      </p>
                    </>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  {!pickingClient ? (
                    <button
                      type="button"
                      onClick={backToClientPick}
                      className="inline-flex items-center gap-0.5 rounded-lg px-2 py-1.5 text-[11px] font-bold text-teal-700 hover:bg-teal-50"
                      title="顧問先を選び直す"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      顧問先
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setPickerOpen(false)}
                    className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                    aria-label="閉じる"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="relative mt-3">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  ref={pickerSearchRef}
                  type="search"
                  value={pickerQuery}
                  onChange={(e) => setPickerQuery(e.target.value)}
                  placeholder={
                    pickingClient ? "顧問先名で検索" : "ファイル名・枠・期間で検索"
                  }
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-8 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-500/20"
                />
                {pickerQuery ? (
                  <button
                    type="button"
                    onClick={() => setPickerQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                    aria-label="検索をクリア"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {pickingClient ? (
                clients.length === 0 ? (
                  <p className="px-4 py-10 text-center text-sm text-slate-500">
                    表示できる顧問先がありません。
                  </p>
                ) : filteredClients.length === 0 ? (
                  <p className="px-4 py-10 text-center text-sm text-slate-500">
                    「{pickerQuery.trim()}」に一致する顧問先はありません。
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {filteredClients.map((client) => (
                      <li key={client.id}>
                        <button
                          type="button"
                          onClick={() => selectPickerClient(client.id)}
                          className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50"
                        >
                          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                            <Building2 className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-slate-800">
                              {client.name}
                            </span>
                            {!client.isAssigned ? (
                              <span className="mt-0.5 block text-[11px] text-amber-600">担当外</span>
                            ) : null}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              ) : docsLoading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  読み込み中…
                </div>
              ) : docs.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-slate-500">
                  保存済み PDF がありません。PC から選択するか、Doc で資料を載せてください。
                </p>
              ) : filteredDocs.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-slate-500">
                  「{pickerQuery.trim()}」に一致する資料はありません。
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {filteredDocs.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void openDocugridDoc(item)}
                        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 disabled:opacity-50"
                      >
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                          <FolderOpen className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-slate-800">
                            {item.original_name}
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                            {item.slot_label || item.slot_id}
                            <span className="text-slate-300"> · </span>
                            {item.period_key}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
