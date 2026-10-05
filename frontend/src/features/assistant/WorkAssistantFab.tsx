"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, MessageCircle, Send, Sparkles, X } from "lucide-react";
import {
  postWorkAssistantChat,
  type AssistantCoverage,
  type AssistantExpectedSlot,
  type AssistantExtractionProposal,
  type AssistantRagResult,
} from "@/features/assistant/work-assistant-api";
import { applyExtractionFields } from "@/features/client-data/lib/extraction-api";

type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  coverage?: AssistantCoverage | null;
  extractionProposal?: AssistantExtractionProposal | null;
  rag?: AssistantRagResult | null;
  helpDocId?: string | null;
};

type Props = {
  clientId?: string | null;
  clientLabel?: string | null;
  periodKey?: string | null;
  expectedSlots?: AssistantExpectedSlot[];
  /** Hide on welcome/login */
  enabled?: boolean;
};

function newId(): string {
  return `wa_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function CoverageCard({ coverage }: { coverage: AssistantCoverage }) {
  return (
    <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-700">
      <p className="font-bold text-slate-900">
        充足 {coverage.filledCount}/{coverage.expectedCount || "—"}
      </p>
      {coverage.missingCount > 0 ? (
        <ul className="mt-1.5 max-h-28 list-inside list-disc overflow-auto text-amber-800">
          {coverage.missing.slice(0, 10).map((m) => (
            <li key={m.slotId}>{m.slotLabel}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-emerald-700">不足なし</p>
      )}
    </div>
  );
}

function RagHitsCard({ rag }: { rag: AssistantRagResult }) {
  if (!rag.items.length) return null;
  return (
    <div className="mt-2 space-y-2">
      {rag.items.slice(0, 6).map((hit, idx) => (
        <div
          key={`${hit.versionId || hit.docId || "h"}-${hit.chunkIndex ?? idx}`}
          className="rounded-xl border border-teal-200/80 bg-teal-50/60 p-2.5 text-[11px] text-slate-700"
        >
          <p className="mb-1 flex flex-wrap items-center gap-1.5 text-[10px] font-bold text-teal-800">
            <span>抜粋 {idx + 1}</span>
            {hit.match ? (
              <span className="rounded bg-white/80 px-1.5 py-0.5 font-medium text-teal-700">
                {hit.match}
              </span>
            ) : null}
            {typeof hit.score === "number" ? (
              <span className="font-medium text-slate-500">score {hit.score.toFixed(2)}</span>
            ) : null}
          </p>
          <p className="max-h-24 overflow-auto whitespace-pre-wrap leading-relaxed text-slate-800">
            {hit.excerpt}
          </p>
        </div>
      ))}
    </div>
  );
}

function ExtractionConfirmCard({
  proposal,
  busy,
  onConfirm,
  onDismiss,
}: {
  proposal: AssistantExtractionProposal;
  busy: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="mt-2 rounded-xl border border-violet-200 bg-violet-50/80 p-3 text-[11px] text-slate-700">
      <p className="font-bold text-violet-900">
        反映前の確認 · {proposal.slotLabel}
      </p>
      <p className="mt-0.5 text-[10px] text-slate-500">{proposal.originalName}</p>
      <ul className="mt-2 max-h-36 space-y-1 overflow-auto">
        {proposal.fields.slice(0, 20).map((f) => (
          <li key={f.fieldId} className="flex gap-2 border-b border-violet-100/80 py-1">
            <span className="w-24 shrink-0 truncate font-medium text-slate-600" title={f.label}>
              {f.label}
            </span>
            <span className="min-w-0 flex-1 break-all text-slate-900">{f.value}</span>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className="rounded-lg bg-violet-700 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-violet-800 disabled:opacity-50"
        >
          {busy ? "反映中…" : "反映する"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onDismiss}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
        >
          やめる
        </button>
      </div>
    </div>
  );
}

/**
 * 右下の業務アシスタント（ヘルプ / 充足確認 / OCR反映提案 / 資料 RAG）。
 * マスタ書き込みは確認カード経由のみ。
 */
export function WorkAssistantFab({
  clientId,
  clientLabel,
  periodKey,
  expectedSlots = [],
  enabled = true,
}: Props) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [busy, setBusy] = useState(false);
  const [applyBusy, setApplyBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const contextLine = useMemo(() => {
    const parts: string[] = [];
    if (clientLabel || clientId) parts.push(clientLabel || clientId || "");
    if (periodKey) parts.push(periodKey);
    return parts.filter(Boolean).join(" · ") || "顧問先未選択";
  }, [clientId, clientLabel, periodKey]);

  useEffect(() => {
    if (!open) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  if (!enabled) return null;

  const send = async (textRaw?: string) => {
    const text = (textRaw ?? input).trim();
    if (!text || busy) return;
    const userMsg: ChatMsg = { id: newId(), role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setBusy(true);
    try {
      const res = await postWorkAssistantChat({
        message: text,
        clientId,
        periodKey,
        clientLabel,
        expectedSlots,
      });
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: "assistant",
          content: res.content,
          coverage: res.coverage,
          extractionProposal: res.extraction_proposal,
          rag: res.rag,
          helpDocId: res.help_doc_id,
        },
      ]);
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: "assistant",
          content: "応答に失敗しました。しばらくしてからもう一度お試しください。",
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const applyProposal = async (proposal: AssistantExtractionProposal, msgId: string) => {
    setApplyBusy(true);
    try {
      const fields: Record<string, string> = {};
      for (const f of proposal.fields) {
        if (f.value?.trim()) fields[f.fieldId] = f.value;
      }
      await applyExtractionFields({
        clientId: proposal.clientId,
        periodKey: proposal.periodKey,
        slotId: proposal.slotId,
        slotLabel: proposal.slotLabel,
        fields,
      });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? {
                ...m,
                extractionProposal: null,
                content: `${m.content}\n\n反映しました（${Object.keys(fields).length} 項目）。`,
              }
            : m,
        ),
      );
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: "assistant",
          content: "基本情報へ反映しました。カルテのマスタを開いて内容を確認してください。",
        },
      ]);
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: "assistant",
          content: "反映に失敗しました。権限または抽出内容を確認してください。",
        },
      ]);
    } finally {
      setApplyBusy(false);
    }
  };

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2">
      {open ? (
        <div className="pointer-events-auto flex h-[min(32rem,calc(100vh-6rem))] w-[min(24rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/15">
          <header className="flex items-start justify-between gap-2 border-b border-slate-100 bg-gradient-to-br from-teal-50 via-white to-sky-50 px-3 py-2.5">
            <div className="min-w-0">
              <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-teal-700">
                <Sparkles className="h-3 w-3" aria-hidden />
                DocuGrid AI
              </p>
              <p className="truncate text-xs font-bold text-slate-800">業務アシスタント</p>
              <p className="truncate text-[10px] text-slate-500">{contextLine}</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1 text-slate-400 hover:bg-white hover:text-slate-700"
              aria-label="閉じる"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="flex flex-wrap gap-1.5 border-b border-slate-100 px-3 py-2">
            {[
              "このクライアント資料揃ってる？",
              "OCRして基本情報に反映して",
              "源泉徴収票を探して",
              "自動振り分けの使い方",
            ].map((q) => (
              <button
                key={q}
                type="button"
                disabled={busy}
                onClick={() => void send(q)}
                className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-medium text-slate-600 hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800 disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {messages.length === 0 ? (
              <p className="text-[11px] leading-relaxed text-slate-500">
                ヘルプ、資料の充足確認、OCR のマスタ反映（確認後）、顧問先資料のキーワード／ベクトル検索ができます。
                事務所外のデータは出ません。
              </p>
            ) : null}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[92%] rounded-2xl px-3 py-2 text-[12px] leading-relaxed ${
                    m.role === "user"
                      ? "bg-teal-700 text-white"
                      : "border border-slate-100 bg-slate-50 text-slate-800"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{m.content}</p>
                  {m.coverage ? <CoverageCard coverage={m.coverage} /> : null}
                  {m.rag ? <RagHitsCard rag={m.rag} /> : null}
                  {m.extractionProposal ? (
                    <ExtractionConfirmCard
                      proposal={m.extractionProposal}
                      busy={applyBusy}
                      onConfirm={() => void applyProposal(m.extractionProposal!, m.id)}
                      onDismiss={() =>
                        setMessages((prev) =>
                          prev.map((x) =>
                            x.id === m.id ? { ...x, extractionProposal: null } : x,
                          ),
                        )
                      }
                    />
                  ) : null}
                  {m.helpDocId ? (
                    <Link
                      href={`/help?id=${encodeURIComponent(m.helpDocId)}`}
                      className="mt-2 inline-block text-[10px] font-bold text-teal-700 hover:underline"
                    >
                      ヘルプを開く
                    </Link>
                  ) : null}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <form
            className="flex items-end gap-2 border-t border-slate-100 p-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={2}
              placeholder="質問を入力…"
              className="min-h-[2.5rem] flex-1 resize-none rounded-xl border border-slate-200 px-2.5 py-2 text-xs outline-none focus:border-teal-400"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-40"
              aria-label="送信"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full bg-teal-700 text-white shadow-lg shadow-teal-900/25 hover:bg-teal-800"
        title="DocuGrid AI"
        aria-label="DocuGrid AI を開く"
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      </button>
    </div>
  );
}
