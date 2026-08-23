"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Loader2, Share2 } from "lucide-react";
import { shareSlotWithClient } from "@/features/docugrid/lib/slot-documents";
import {
  fetchDmWorkspace,
  sendDmMessage,
  sendSystemHandoff,
  type DmToolStatus,
} from "@/features/workspace/dm-workspace-api";
import { parseApiErrorBody } from "@/lib/parse-api-error";
import { settingsHref } from "@/lib/app-surface";

type SentKey = "system" | "portal" | "email" | "slack" | "line" | "download";

type Props = {
  clientId: string;
  clientName: string;
  title: string;
  slotLabel: string;
  docId?: string;
  filename?: string;
  pdfFile?: File | null;
  canShareWithClient?: boolean;
  portalShared?: boolean;
  onPortalShared?: () => void;
  onStatus?: (ok: string, err?: string) => void;
  onNavigateToDm?: () => void;
  children?: ReactNode;
};

function downloadPdfFile(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  URL.revokeObjectURL(url);
}

function toolReady(tools: DmToolStatus[], id: string) {
  return Boolean(tools.find((t) => t.id === id)?.ready);
}

export function DocumentShareMenu({
  clientId,
  clientName,
  title,
  slotLabel,
  docId,
  filename,
  pdfFile,
  canShareWithClient = false,
  portalShared = false,
  onPortalShared,
  onStatus,
  onNavigateToDm,
  children,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<SentKey | null>(null);
  const [sent, setSent] = useState<Partial<Record<SentKey, boolean>>>({});
  const [tools, setTools] = useState<DmToolStatus[]>([]);

  useEffect(() => {
    if (!open) return;
    void fetchDmWorkspace({ clientId, limit: 5 })
      .then((d) => setTools(d.tools))
      .catch(() => setTools([]));
  }, [open, clientId]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (ev: MouseEvent) => {
      if (!rootRef.current?.contains(ev.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const mark = (key: SentKey, ok: string, err?: string) => {
    if (!err) setSent((prev) => ({ ...prev, [key]: true }));
    onStatus?.(err ? "" : ok, err);
  };

  const runSystem = async () => {
    setBusy("system");
    try {
      await sendSystemHandoff({
        clientId,
        clientName,
        title,
        slotLabel,
        docId,
        filename,
      });
      mark("system", "システム内 DM に送りました");
    } catch (e) {
      mark("system", "", parseApiErrorBody(e) || "DM への送信に失敗しました");
    } finally {
      setBusy(null);
    }
  };

  const runPortal = async () => {
    if (!docId || !canShareWithClient) return;
    setBusy("portal");
    try {
      await shareSlotWithClient(docId, clientId);
      onPortalShared?.();
      mark("portal", "お客さんのポータルに共有しました");
    } catch (e) {
      mark("portal", "", parseApiErrorBody(e) || "ポータル共有に失敗しました");
    } finally {
      setBusy(null);
    }
  };

  const runChannel = async (channel: "email" | "slack" | "line") => {
    setBusy(channel);
    const docTitle = title.replace(/（.+）/, "").trim() || "書類";
    try {
      await sendDmMessage({
        channel,
        client_id: clientId,
        subject: `【${clientName}】${docTitle}`,
        text: `${clientName} 向け「${slotLabel}」の資料を DocuGrid に保存しました。枠から開けます。`,
      });
      mark(channel, `${channel} に送りました`);
    } catch (e) {
      mark(
        channel,
        "",
        parseApiErrorBody(e) ||
          `${channel} への送信に失敗しました。接続と通知連携の権限を確認してください。`,
      );
    } finally {
      setBusy(null);
    }
  };

  const runDownload = () => {
    if (!pdfFile) return;
    downloadPdfFile(pdfFile);
    mark("download", "PDF をダウンロードしました");
  };

  const openDm = () => {
    window.dispatchEvent(new CustomEvent("docugrid:select-workspace", { detail: { id: "dm" } }));
    window.dispatchEvent(new CustomEvent("docugrid:dm-filter", { detail: { channel: "system" } }));
    onNavigateToDm?.();
  };

  const row = (
    key: SentKey,
    label: string,
    opts: {
      onClick: () => void;
      disabled?: boolean;
      hint?: string;
    },
  ) => {
    const done = Boolean(sent[key] || (key === "portal" && portalShared));
    return (
      <button
        type="button"
        disabled={Boolean(busy) || opts.disabled}
        onClick={opts.onClick}
        className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
      >
        <span className="mt-0.5 w-4 shrink-0">
          {busy === key ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
          ) : done ? (
            <Check className="h-3.5 w-3.5 text-emerald-600" />
          ) : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block">{label}</span>
          {opts.hint ? (
            <span className="mt-0.5 block text-[10px] font-medium text-slate-500">{opts.hint}</span>
          ) : null}
        </span>
      </button>
    );
  };

  return (
    <div ref={rootRef} className="flex flex-col items-center">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-700 px-3 py-2 text-xs font-bold text-white hover:bg-violet-800"
        >
          <Share2 className="h-3.5 w-3.5" />
          シェア
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        {children}
      </div>
      {open ? (
        <div className="mt-2 w-72 rounded-xl border border-slate-200 bg-white p-1.5 text-left shadow-xl">
          <p className="px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wide text-slate-400">
            送り先
          </p>
          {row("system", "システム内 DM", {
            onClick: () => void runSystem(),
            hint: sent.system ? "送信済み" : "事務所の受信箱。毎回送らなくてよい",
          })}
          {row("portal", "お客さんのポータル", {
            onClick: () => void runPortal(),
            disabled: !docId || !canShareWithClient,
            hint: !canShareWithClient
              ? "この権限ではポータル共有できません"
              : !docId
                ? "枠に保存できていません"
                : portalShared || sent.portal
                  ? "共有済み"
                  : "お客さんが自分で開ける",
          })}
          {row("slack", "Slack", {
            onClick: () => void runChannel("slack"),
            disabled: !toolReady(tools, "slack"),
            hint: toolReady(tools, "slack") ? "接続済み" : "未接続",
          })}
          {row("email", "メール", {
            onClick: () => void runChannel("email"),
            disabled: !toolReady(tools, "email"),
            hint: toolReady(tools, "email") ? "接続済み" : "未接続",
          })}
          {row("line", "LINE", {
            onClick: () => void runChannel("line"),
            disabled: !toolReady(tools, "line"),
            hint: toolReady(tools, "line") ? "接続済み" : "未接続",
          })}
          {pdfFile
            ? row("download", "PDF をダウンロード", {
                onClick: runDownload,
              })
            : null}
          <div className="mt-1 flex items-center justify-between border-t border-slate-100 px-2.5 py-1.5">
            <a
              href={settingsHref("firm", "messaging")}
              className="text-[10px] font-bold text-violet-700 hover:underline"
            >
              通知連携の設定
            </a>
            {sent.system ? (
              <button
                type="button"
                onClick={openDm}
                className="text-[10px] font-bold text-violet-700 hover:underline"
              >
                DM を開く
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
