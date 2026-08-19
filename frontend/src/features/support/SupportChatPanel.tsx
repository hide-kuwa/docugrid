"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Mail, Send, Sparkles } from "lucide-react";
import {
  buildMockSupportReply,
  createUserSupportMessage,
} from "@/features/support/support-kb";
import {
  createSupportTicket,
  fetchSupportMetrics,
  listSupportTickets,
  postSupportChat,
  type SupportFirmMetrics,
  type SupportTicket,
} from "@/features/support/support-api";
import {
  SUPPORT_ASSISTANT_STATUS,
  SUPPORT_ESCALATION_COPY,
  type SupportMessage,
  type SupportTicketKind,
} from "@/features/support/support-types";

type Props = {
  onBack?: () => void;
};

function newId(): string {
  return `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * S2 chat + S3 CS ticket form.
 */
export function SupportChatPanel({ onBack }: Props) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [lastEngine, setLastEngine] = useState<string | null>(null);
  const [showTicket, setShowTicket] = useState(false);
  const [ticketKind, setTicketKind] = useState<SupportTicketKind>("bug");
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketBody, setTicketBody] = useState("");
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [ticketOk, setTicketOk] = useState<string | null>(null);
  const [mailtoHref, setMailtoHref] = useState<string | null>(null);
  const [firmMetrics, setFirmMetrics] = useState<SupportFirmMetrics | null>(null);
  const [recentTickets, setRecentTickets] = useState<SupportTicket[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const preview = SUPPORT_ASSISTANT_STATUS !== "live";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, showTicket]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const metrics = await fetchSupportMetrics();
      if (cancelled || !metrics) return;
      setFirmMetrics(metrics);
      const tickets = await listSupportTickets(5);
      if (!cancelled) setRecentTickets(tickets);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    const userMsg = createUserSupportMessage(text);
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setBusy(true);
    try {
      const res = await postSupportChat(text, { surfaceId: "support.assistant" });
      setLastEngine(res.engine);
      const reply: SupportMessage = {
        id: newId(),
        role: "assistant",
        content: res.content,
        createdAt: new Date().toISOString(),
        helpDocId: res.help_doc_id ?? undefined,
        tourId: res.tour_id ?? undefined,
      };
      setMessages((prev) => [...prev, reply]);
        if (res.suggest_ticket) {
          setShowTicket(true);
          if (!ticketSubject) setTicketSubject(text.slice(0, 80));
          if (!ticketBody) {
            setTicketBody(
              [
                "【いつ】",
                "【画面】Doc / PDF / カルテ / その他:",
                "【しようとしたこと】",
                text,
                "【出たメッセージ】",
                "",
              ].join("\n"),
            );
          }
          if (/バグ|不具合|エラー|動かない/.test(text)) {
            setTicketKind("bug");
          }
        }
    } catch {
      const reply = buildMockSupportReply(text);
      setLastEngine("local_fallback");
      setMessages((prev) => [...prev, reply]);
      setShowTicket(true);
    } finally {
      setBusy(false);
    }
  };

  const startTour = (tourId: string) => {
    window.dispatchEvent(
      new CustomEvent("docugrid:start-tour", { detail: { id: tourId } }),
    );
  };

  const submitTicket = async () => {
    setTicketError(null);
    setTicketOk(null);
    setMailtoHref(null);
    const subject = ticketSubject.trim();
    const body = ticketBody.trim();
    if (!subject || !body) {
      setTicketError("件名と本文を入力してください");
      return;
    }
    setBusy(true);
    try {
      const ticket = await createSupportTicket({
        kind: ticketKind,
        subject,
        body,
        surfaceId: "support.assistant",
        preferredChannel: "email",
      });
      setTicketOk(
        `受付番号 ${ticket.id}（メール: ${ticket.email_status}）。CS はメール優先です。`,
      );
      if (ticket.mailto) setMailtoHref(ticket.mailto);
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: "assistant",
          content: `CS チケットを作成しました（${ticket.id}）。${SUPPORT_ESCALATION_COPY.emailFirst}`,
          createdAt: new Date().toISOString(),
          helpDocId: "support",
        },
      ]);
      if (firmMetrics) {
        const metrics = await fetchSupportMetrics();
        if (metrics) setFirmMetrics(metrics);
        setRecentTickets(await listSupportTickets(5));
      }
    } catch (e) {
      setTicketError(e instanceof Error ? e.message : "送信に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex max-h-[min(58vh,28rem)] flex-col">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="mb-2 self-start text-[11px] font-bold text-slate-500 hover:text-slate-800"
        >
          ← 戻る
        </button>
      ) : null}

      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <p className="text-[11px] font-bold text-slate-800">サポートチャット</p>
        {preview ? (
          <span className="rounded bg-teal-100 px-1 text-[8px] font-black uppercase text-teal-800">
            {SUPPORT_ASSISTANT_STATUS}
          </span>
        ) : null}
        {lastEngine ? (
          <span className="rounded bg-slate-100 px-1 text-[8px] font-bold text-slate-500">
            {lastEngine}
          </span>
        ) : null}
      </div>
      <p className="mb-2 text-[10px] leading-snug text-slate-500">
        ヘルプ検索で案内。解決しないときは下の CS チケット（メール優先）。
      </p>

      {firmMetrics ? (
        <div className="mb-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5">
          <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
            事務所 CS 指標（管理者）
          </p>
          <p className="mt-0.5 text-[10px] leading-snug text-slate-600">
            件数 {firmMetrics.total_tickets}
            {" · "}解決率 {Math.round((firmMetrics.resolution_rate || 0) * 100)}%
            {" · "}電話希望率 {Math.round((firmMetrics.phone_rate || 0) * 100)}%
          </p>
          {recentTickets.length > 0 ? (
            <ul className="mt-1 max-h-16 space-y-0.5 overflow-y-auto text-[9px] text-slate-500">
              {recentTickets.map((t) => (
                <li key={t.id} className="truncate">
                  <span className="font-bold text-slate-600">{t.status}</span> {t.subject}
                </li>
              ))}
            </ul>
          ) : null}
          <Link
            href="/help?id=support-ops"
            className="mt-1 inline-block text-[9px] font-bold text-teal-700 underline"
          >
            運用ポリシー
          </Link>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2">
        {messages.length === 0 ? (
          <p className="px-1 py-2 text-[11px] leading-relaxed text-slate-500">
            例:「保存はどこ？」「要確認キュー」「不具合を報告したい」
          </p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={[
                "rounded-lg px-2.5 py-2 text-[11px] leading-relaxed whitespace-pre-wrap",
                m.role === "user"
                  ? "ml-4 bg-teal-600 text-white"
                  : "mr-2 border border-slate-200 bg-white text-slate-700",
              ].join(" ")}
            >
              {m.content}
              {m.role === "assistant" ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.helpDocId ? (
                    <Link
                      href={`/help?id=${encodeURIComponent(m.helpDocId)}`}
                      className="rounded-md bg-teal-50 px-1.5 py-0.5 text-[10px] font-bold text-teal-800 underline-offset-2 hover:underline"
                    >
                      ヘルプを開く
                    </Link>
                  ) : null}
                  {m.tourId ? (
                    <button
                      type="button"
                      onClick={() => startTour(m.tourId!)}
                      className="inline-flex items-center gap-0.5 rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold text-violet-800 hover:bg-violet-100"
                    >
                      <Sparkles className="h-3 w-3" />
                      ガイドを再生
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))
        )}

        {showTicket ? (
          <div className="rounded-lg border border-blue-200 bg-white p-2.5">
            <p className="text-[11px] font-bold text-slate-800">CS にメールでつなぐ</p>
            <p className="mt-0.5 text-[10px] text-slate-500">
              {SUPPORT_ESCALATION_COPY.emailFirst}
            </p>
            <label className="mt-2 block text-[10px] font-bold text-slate-600">
              種類
              <select
                value={ticketKind}
                onChange={(e) => setTicketKind(e.target.value as SupportTicketKind)}
                className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-[11px]"
              >
                <option value="bug">不具合</option>
                <option value="howto_unresolved">使い方がわからない</option>
                <option value="other">その他</option>
              </select>
            </label>
            <label className="mt-1.5 block text-[10px] font-bold text-slate-600">
              件名
              <input
                value={ticketSubject}
                onChange={(e) => setTicketSubject(e.target.value)}
                className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-[11px]"
              />
            </label>
            <label className="mt-1.5 block text-[10px] font-bold text-slate-600">
              内容
              <textarea
                value={ticketBody}
                onChange={(e) => setTicketBody(e.target.value)}
                rows={5}
                className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-[11px] leading-snug"
              />
            </label>
            {ticketError ? (
              <p className="mt-1 text-[10px] font-bold text-rose-600">{ticketError}</p>
            ) : null}
            {ticketOk ? (
              <p className="mt-1 text-[10px] font-bold text-teal-700">{ticketOk}</p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                disabled={busy}
                onClick={() => void submitTicket()}
                className="rounded-lg bg-blue-600 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-blue-500 disabled:opacity-50"
              >
                チケット送信
              </button>
              {mailtoHref ? (
                <a
                  href={mailtoHref}
                  className="rounded-lg border border-slate-200 px-2.5 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-50"
                >
                  メールアプリで開く
                </a>
              ) : null}
              <button
                type="button"
                onClick={() => setShowTicket(false)}
                className="rounded-lg px-2 py-1 text-[10px] font-bold text-slate-500 hover:bg-slate-100"
              >
                閉じる
              </button>
            </div>
            <p className="mt-2 text-[9px] leading-snug text-slate-400">
              {SUPPORT_ESCALATION_COPY.phoneOnlyWhenNeeded}{" "}
              <Link href="/help?id=support-ops" className="font-bold text-teal-700 underline">
                運用ポリシー
              </Link>
            </p>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowTicket(true)}
            className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 bg-white px-2 py-1.5 text-[10px] font-bold text-slate-600 hover:bg-slate-50"
          >
            <Mail className="h-3 w-3 text-blue-600" />
            CS チケットを書く
          </button>
        )}

        <div ref={bottomRef} />
      </div>

      <form
        className="mt-2 flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={busy ? "処理中…" : "質問を入力…"}
          disabled={busy}
          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] text-slate-800 outline-none focus:border-teal-400 disabled:bg-slate-100"
        />
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center justify-center rounded-lg bg-teal-600 px-2.5 text-white hover:bg-teal-500 disabled:opacity-50"
          aria-label="送信"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  );
}
