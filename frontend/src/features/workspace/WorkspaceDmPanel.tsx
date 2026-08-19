"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Loader2,
  Mail,
  MessageCircle,
  MessagesSquare,
  Plug,
  RefreshCw,
  Settings2,
} from "lucide-react";
import {
  enableDmLocalLab,
  fetchDmInboundHooks,
  fetchDmWorkspace,
  ingestDmItem,
  saveDmTools,
  sendDmMessage,
  simulateDmInbound,
  type DmInboxItem,
  type DmToolStatus,
  type DmWorkspacePayload,
} from "@/features/workspace/dm-workspace-api";
import { testMessagingChannel } from "@/features/integrations/messaging-channels-api";
import { parseApiErrorBody } from "@/lib/parse-api-error";
import { settingsHref } from "@/lib/app-surface";

type Props = {
  clientId?: string;
  clientName?: string;
};

const CHANNEL_FILTERS = [
  { id: "all", label: "すべて" },
  { id: "email", label: "メール" },
  { id: "slack", label: "Slack" },
  { id: "line", label: "LINE" },
] as const;

const TOOL_ICONS = {
  email: Mail,
  slack: MessagesSquare,
  line: MessageCircle,
} as const;

export function WorkspaceDmColumn({ clientId }: Props) {
  const [tools, setTools] = useState<DmToolStatus[]>([]);
  const [channel, setChannel] = useState<string>("all");
  const [showSetup, setShowSetup] = useState(false);

  useEffect(() => {
    void fetchDmWorkspace({ clientId, limit: 5 })
      .then((d) => setTools(d.tools))
      .catch(() => setTools([]));
  }, [clientId, showSetup]);

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-3 py-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-violet-600">DM</p>
        <p className="mt-1 text-xs font-bold text-slate-800">統合受信箱</p>
      </div>

      <div className="space-y-1 border-b border-slate-100 px-2 py-2">
        {CHANNEL_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => {
              setChannel(f.id);
              window.dispatchEvent(
                new CustomEvent("docugrid:dm-filter", { detail: { channel: f.id } }),
              );
            }}
            className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs font-bold ${
              channel === f.id
                ? "bg-violet-50 text-violet-900"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-3">
        <p className="mb-2 px-1 text-[10px] font-black uppercase tracking-wide text-slate-400">
          メッセージツール
        </p>
        <ul className="space-y-1">
          {(tools.length
            ? tools
            : [
                { id: "email", label: "メール", enabled: false, ready: false },
                { id: "slack", label: "Slack", enabled: false, ready: false },
                { id: "line", label: "LINE", enabled: false, ready: false },
              ]
          ).map((t) => {
            const Icon = TOOL_ICONS[t.id as keyof typeof TOOL_ICONS] || Plug;
            return (
              <li
                key={t.id}
                className="flex items-center gap-2 rounded-lg border border-slate-100 px-2 py-2"
              >
                <Icon className="h-3.5 w-3.5 text-slate-500" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-slate-800">{t.label}</p>
                  <p className="text-[10px] text-slate-500">
                    {t.ready
                      ? t.mode === "local"
                        ? "ローカル利用中"
                        : "接続済み · 送信可"
                      : t.enabled
                        ? "設定不足"
                        : "未接続"}
                  </p>
                </div>
                <span
                  className={`h-2 w-2 rounded-full ${
                    t.ready ? "bg-emerald-500" : "bg-slate-300"
                  }`}
                />
              </li>
            );
          })}
        </ul>
      </div>

      <div className="space-y-2 border-t border-slate-100 p-2">
        <button
          type="button"
          onClick={() => {
            setShowSetup(true);
            window.dispatchEvent(new CustomEvent("docugrid:dm-setup", { detail: { open: true } }));
          }}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-2 py-2 text-[11px] font-bold text-white hover:bg-slate-800"
        >
          <Settings2 className="h-3.5 w-3.5" />
          ツールを設定
        </button>
        <Link
          href={settingsHref("firm", "messaging")}
          className="block text-center text-[10px] font-bold text-violet-700 hover:underline"
        >
          設定 → 通知連携
        </Link>
      </div>
    </aside>
  );
}

export function WorkspaceDmMain({ clientId, clientName }: Props) {
  const [data, setData] = useState<DmWorkspacePayload | null>(null);
  const [channel, setChannel] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [setupOpen, setSetupOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // inline setup drafts
  const [slackWebhook, setSlackWebhook] = useState("");
  const [slackMode, setSlackMode] = useState("local");
  const [emailFrom, setEmailFrom] = useState("");
  const [emailKey, setEmailKey] = useState("");
  const [emailProvider, setEmailProvider] = useState("local");
  const [lineToken, setLineToken] = useState("");
  const [lineMode, setLineMode] = useState("local");
  const [composeChannel, setComposeChannel] = useState<"email" | "slack" | "line">("slack");
  const [composeText, setComposeText] = useState("");
  const [composeTo, setComposeTo] = useState("");
  const [hooks, setHooks] = useState<{
    hooks: Record<string, string>;
    notes: string[];
  } | null>(null);

  const anyReady = Boolean(data?.tools.some((t) => t.ready));
  const allLocalReady = Boolean(
    data?.tools.filter((t) => ["email", "slack", "line"].includes(t.id)).every((t) => t.ready),
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const payload = await fetchDmWorkspace({
        channel: channel === "all" ? undefined : channel,
        clientId,
        limit: 100,
      });
      setData(payload);
      setSelectedId((prev) => prev || payload.items[0]?.id || null);
    } catch (e) {
      setMessage(parseApiErrorBody(e) || "受信箱の読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [channel, clientId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const onFilter = (ev: Event) => {
      const detail = (ev as CustomEvent<{ channel?: string }>).detail;
      if (detail?.channel) setChannel(detail.channel);
    };
    const onSetup = (ev: Event) => {
      const detail = (ev as CustomEvent<{ open?: boolean }>).detail;
      if (detail?.open) setSetupOpen(true);
    };
    window.addEventListener("docugrid:dm-filter", onFilter);
    window.addEventListener("docugrid:dm-setup", onSetup);
    return () => {
      window.removeEventListener("docugrid:dm-filter", onFilter);
      window.removeEventListener("docugrid:dm-setup", onSetup);
    };
  }, []);

  const selected = useMemo(
    () => data?.items.find((i) => i.id === selectedId) ?? null,
    [data, selectedId],
  );

  const saveTool = async (tool: "email" | "slack" | "line") => {
    setBusy(true);
    setMessage("");
    try {
      const patch: Record<string, unknown> = {};
      if (tool === "slack") {
        const mode = slackWebhook.trim() ? "webhook" : slackMode;
        patch.slack = {
          enabled: true,
          mode,
          ...(slackWebhook.trim() ? { webhook_url: slackWebhook.trim() } : {}),
        };
      }
      if (tool === "email") {
        patch.email = {
          enabled: true,
          provider: emailProvider,
          from_email: emailFrom || "noreply@localhost",
          ...(emailKey.trim() ? { api_key: emailKey.trim() } : {}),
        };
      }
      if (tool === "line") {
        const mode = lineToken.trim() ? "messaging_api" : lineMode;
        patch.line = {
          enabled: true,
          mode,
          ...(lineToken.trim() ? { channel_access_token: lineToken.trim() } : {}),
          ...(composeTo.trim() ? { destination_user_id: composeTo.trim() } : {}),
        };
      }
      const next = await saveDmTools(patch);
      setData(next);
      setSlackWebhook("");
      setEmailKey("");
      setLineToken("");
      setMessage(
        `${tool} を保存しました。${
          tool === "email" && emailProvider === "local"
            ? "送信すると受信箱に残ります。"
            : "local なら送信・模擬受信がすぐ使えます。"
        }`,
      );
      await reload();
    } catch (e) {
      setMessage(parseApiErrorBody(e) || "保存に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const runValidate = async (tool: "email" | "slack" | "line") => {
    setBusy(true);
    try {
      await testMessagingChannel({ channel: tool, dryRun: true });
      setMessage(`${tool} の設定を検証しました`);
      await reload();
    } catch (e) {
      setMessage(parseApiErrorBody(e) || "検証に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const runSend = async () => {
    if (!composeText.trim()) {
      setMessage("送信本文を入力してください");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const res = await sendDmMessage({
        channel: composeChannel,
        text: composeText.trim(),
        to: composeTo.trim() || undefined,
        subject: composeChannel === "email" ? "DocuGrid から" : undefined,
        client_id: clientId,
      });
      setSelectedId(res.item.id);
      setComposeText("");
      setMessage(`送信しました（${composeChannel}）`);
      await reload();
    } catch (e) {
      setMessage(parseApiErrorBody(e) || "送信に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const runSimulate = async (ch: "email" | "slack" | "line") => {
    setBusy(true);
    try {
      await simulateDmInbound({ channel: ch, client_id: clientId, count: 2 });
      setChannel(ch);
      setMessage(`${ch} の模擬受信を追加しました（契約不要）`);
      await reload();
    } catch (e) {
      setMessage(parseApiErrorBody(e) || "模擬受信に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const runEnableLocal = async () => {
    setBusy(true);
    setMessage("");
    try {
      const res = await enableDmLocalLab({ client_id: clientId, seed: true, count: 1 });
      setData(res.workspace);
      setSelectedId(res.seeded[0]?.id || res.workspace.items[0]?.id || null);
      setComposeChannel("slack");
      setSetupOpen(false);
      setMessage("ローカル利用を有効化しました。送信・模擬受信が使えます。");
    } catch (e) {
      setMessage(parseApiErrorBody(e) || "ローカル有効化に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const loadHooks = async () => {
    setBusy(true);
    try {
      const h = await fetchDmInboundHooks();
      setHooks({ hooks: h.hooks, notes: h.notes });
      setMessage("Webhook URL を表示しました（無料の Slack/LINE 設定に貼れます）");
    } catch (e) {
      setMessage(parseApiErrorBody(e) || "Webhook 情報の取得に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const addManual = async () => {
    setBusy(true);
    try {
      const item = await ingestDmItem({
        channel: "system",
        title: "手動メモ",
        body: `${clientName || clientId || "事務所"} 向けの連絡メモ`,
        direction: "system",
        client_id: clientId,
        participants: "事務所",
      });
      setSelectedId(item.id);
      await reload();
    } catch (e) {
      setMessage(parseApiErrorBody(e) || "追加に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden bg-slate-50">
      {/* thread list */}
      <section className="flex w-80 shrink-0 flex-col border-r border-slate-200 bg-white">
        <header className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
          <div>
            <h2 className="text-sm font-black text-slate-800">受信トレイ</h2>
            <p className="text-[10px] text-slate-500">
              {clientName ? `${clientName} · ` : ""}
              {channel === "all" ? "全チャネル" : channel}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void reload()}
            className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50"
            title="再読込"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading && !data ? (
            <div className="flex items-center gap-2 p-4 text-xs text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              読み込み中…
            </div>
          ) : !data?.items.length ? (
            <div className="space-y-3 p-4 text-center">
              <p className="text-xs font-bold text-slate-700">まだメッセージがありません</p>
              <p className="text-[11px] text-slate-500">
                まずローカル利用を有効にすると、送信と模擬受信がすぐ使えます（外部キー不要）。
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void runEnableLocal()}
                className="rounded-lg bg-violet-700 px-3 py-2 text-[11px] font-bold text-white disabled:opacity-50"
              >
                ローカルで使えるようにする
              </button>
            </div>
          ) : (
            <ul>
              {data.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={`block w-full border-b border-slate-100 px-3 py-2.5 text-left hover:bg-violet-50/50 ${
                      selectedId === item.id ? "bg-violet-50" : "bg-white"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <ChannelChip channel={item.channel} />
                      <span className="truncate text-xs font-bold text-slate-800">
                        {item.title}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">{item.body}</p>
                    <p className="mt-1 text-[10px] text-slate-400">
                      {String(item.occurred_at || "").slice(0, 16).replace("T", " ")}
                      {item.participants ? ` · ${item.participants}` : ""}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* detail / setup */}
      <section className="flex min-w-0 flex-1 flex-col">
        {setupOpen ? (
          <ToolsSetupPanel
            data={data}
            busy={busy}
            slackWebhook={slackWebhook}
            setSlackWebhook={setSlackWebhook}
            emailFrom={emailFrom}
            setEmailFrom={setEmailFrom}
            emailKey={emailKey}
            setEmailKey={setEmailKey}
            emailProvider={emailProvider}
            setEmailProvider={setEmailProvider}
            lineToken={lineToken}
            setLineToken={setLineToken}
            hooks={hooks}
            onLoadHooks={() => void loadHooks()}
            onClose={() => setSetupOpen(false)}
            onSave={(t) => void saveTool(t)}
            onValidate={(t) => void runValidate(t)}
            onSimulate={(t) => void runSimulate(t)}
            onEnableLocal={() => void runEnableLocal()}
          />
        ) : selected ? (
          <MessageDetail item={selected} onOpenSetup={() => setSetupOpen(true)} />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <MessagesSquare className="mb-3 h-10 w-10 text-slate-300" />
            <h2 className="text-lg font-black text-slate-700">DM ワークスペース</h2>
            <p className="mt-2 max-w-md text-sm text-slate-500">
              外部キーなしで送信・受信箱まで動くローカル利用を有効にしてください。あとから本物の
              Slack / LINE / SMTP に切り替えられます。
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void runEnableLocal()}
                className="rounded-lg bg-violet-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
              >
                ローカルで使えるようにする
              </button>
              <button
                type="button"
                onClick={() => setSetupOpen(true)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700"
              >
                詳細設定
              </button>
            </div>
          </div>
        )}

        <footer className="space-y-2 border-t border-slate-200 bg-white px-3 py-2">
          {!anyReady ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2">
              <p className="flex-1 text-[11px] font-bold text-amber-900">
                まだ送信できません。ローカル利用を有効にするとすぐ使えます。
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void runEnableLocal()}
                className="rounded-lg bg-violet-700 px-2.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
              >
                有効にする
              </button>
            </div>
          ) : null}
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-[10px] font-bold text-slate-500">
              送信先チャネル
              <select
                className="mt-0.5 block rounded border border-slate-200 px-2 py-1 text-xs"
                value={composeChannel}
                onChange={(e) =>
                  setComposeChannel(e.target.value as "email" | "slack" | "line")
                }
              >
                <option value="slack">Slack</option>
                <option value="email">メール</option>
                <option value="line">LINE</option>
              </select>
            </label>
            <label className="min-w-[10rem] flex-1 text-[10px] font-bold text-slate-500">
              宛先（メールto / LINE userId / Slack #ch）
              <input
                className="mt-0.5 block w-full rounded border border-slate-200 px-2 py-1 text-xs"
                value={composeTo}
                onChange={(e) => setComposeTo(e.target.value)}
                placeholder="local なら空でOK"
              />
            </label>
            <label className="min-w-[14rem] flex-[2] text-[10px] font-bold text-slate-500">
              本文
              <input
                className="mt-0.5 block w-full rounded border border-slate-200 px-2 py-1 text-xs"
                value={composeText}
                onChange={(e) => setComposeText(e.target.value)}
                placeholder={
                  anyReady
                    ? "メッセージを入力して送信"
                    : "先にローカル利用を有効化してください"
                }
                disabled={!anyReady}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void runSend();
                  }
                }}
              />
            </label>
            <button
              type="button"
              disabled={busy || !anyReady}
              onClick={() => void runSend()}
              className="rounded-lg bg-violet-700 px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
            >
              送信
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setSetupOpen(true)}
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-700"
            >
              ツール設定
            </button>
            {!allLocalReady ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void runEnableLocal()}
                className="rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-[11px] font-bold text-violet-900 disabled:opacity-50"
              >
                ローカル有効化
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy || !anyReady}
              onClick={() => void runSimulate(composeChannel)}
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 disabled:opacity-50"
            >
              模擬受信
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void addManual()}
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-700"
            >
              メモを追加
            </button>
            {message ? <span className="text-[11px] text-slate-600">{message}</span> : null}
          </div>
        </footer>
      </section>
    </div>
  );
}

function ChannelChip({ channel }: { channel: string }) {
  const tone =
    channel === "slack"
      ? "bg-purple-100 text-purple-800"
      : channel === "line"
        ? "bg-emerald-100 text-emerald-800"
        : channel === "email"
          ? "bg-sky-100 text-sky-800"
          : "bg-slate-100 text-slate-600";
  return (
    <span className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase ${tone}`}>
      {channel}
    </span>
  );
}

function MessageDetail({
  item,
  onOpenSetup,
}: {
  item: DmInboxItem;
  onOpenSetup: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ChannelChip channel={item.channel} />
            <h3 className="text-base font-black text-slate-800">{item.title}</h3>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {item.participants || "—"} ·{" "}
            {String(item.occurred_at || "").slice(0, 19).replace("T", " ")}
            {item.projection ? " · 顧客COMMSから" : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenSetup}
          className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-600"
        >
          接続設定
        </button>
      </div>
      <div className="mt-4 whitespace-pre-wrap rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-700 shadow-sm">
        {item.body || "（本文なし）"}
      </div>
    </div>
  );
}

function ToolsSetupPanel({
  data,
  busy,
  slackWebhook,
  setSlackWebhook,
  emailFrom,
  setEmailFrom,
  emailKey,
  setEmailKey,
  emailProvider,
  setEmailProvider,
  lineToken,
  setLineToken,
  hooks,
  onLoadHooks,
  onClose,
  onSave,
  onValidate,
  onSimulate,
  onEnableLocal,
}: {
  data: DmWorkspacePayload | null;
  busy: boolean;
  slackWebhook: string;
  setSlackWebhook: (v: string) => void;
  emailFrom: string;
  setEmailFrom: (v: string) => void;
  emailKey: string;
  setEmailKey: (v: string) => void;
  emailProvider: string;
  setEmailProvider: (v: string) => void;
  lineToken: string;
  setLineToken: (v: string) => void;
  hooks: { hooks: Record<string, string>; notes: string[] } | null;
  onLoadHooks: () => void;
  onClose: () => void;
  onSave: (t: "email" | "slack" | "line") => void;
  onValidate: (t: "email" | "slack" | "line") => void;
  onSimulate: (t: "email" | "slack" | "line") => void;
  onEnableLocal: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-black text-slate-800">メッセージツールを接続</h3>
          <p className="mt-1 text-xs text-slate-500">
            まずはローカル利用で送受信を動かします。あとから Webhook / SMTP / LINE トークンに切り替え可能です。
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-600"
        >
          閉じる
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onEnableLocal}
          className="rounded-lg bg-violet-700 px-2.5 py-1 text-[11px] font-bold text-white disabled:opacity-50"
        >
          全部ローカルで有効化
        </button>
        {(["slack", "email", "line"] as const).map((ch) => (
          <button
            key={ch}
            type="button"
            disabled={busy}
            onClick={() => onSimulate(ch)}
            className="rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-900 disabled:opacity-50"
          >
            {ch} 模擬受信
          </button>
        ))}
        <button
          type="button"
          disabled={busy}
          onClick={onLoadHooks}
          className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-700 disabled:opacity-50"
        >
          Webhook URL を表示
        </button>
      </div>

      {hooks ? (
        <div className="mt-3 space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px]">
          {Object.entries(hooks.hooks).map(([k, url]) => (
            <p key={k} className="break-all font-mono text-slate-700">
              <span className="font-bold uppercase text-slate-500">{k}: </span>
              {url}
            </p>
          ))}
          <ul className="mt-2 list-inside list-disc text-slate-500">
            {hooks.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 space-y-4">
        <ToolCard
          title="Slack"
          ready={!!data?.channels?.slack?.ready}
          hint="local=受信箱のみ。本物は Incoming Webhook URL を貼って保存"
        >
          <p className="mb-2 text-[10px] font-bold text-slate-500">
            現在: {data?.channels?.slack?.mode || "—"}
            {data?.channels?.slack?.ready ? " · ready" : ""}
          </p>
          <input
            type="password"
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-xs"
            placeholder="https://hooks.slack.com/services/…（空のまま保存=local）"
            value={slackWebhook}
            onChange={(e) => setSlackWebhook(e.target.value)}
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => onSave("slack")}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
            >
              保存して接続
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onValidate("slack")}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-700 disabled:opacity-50"
            >
              検証
            </button>
          </div>
        </ToolCard>

        <ToolCard
          title="メール（local / SMTP）"
          ready={!!data?.channels?.email?.ready}
          hint="local=外部送信なしで受信箱に残す。SMTPは Gmail アプリパスワード等で可"
        >
          <select
            className="mb-2 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
            value={emailProvider}
            onChange={(e) => setEmailProvider(e.target.value)}
          >
            <option value="local">local（契約不要・受信箱のみ）</option>
            <option value="smtp">SMTP（自前メール）</option>
            <option value="resend">Resend</option>
            <option value="sendgrid">SendGrid</option>
          </select>
          <input
            className="mb-2 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
            placeholder="noreply@example.com"
            value={emailFrom}
            onChange={(e) => setEmailFrom(e.target.value)}
          />
          {emailProvider !== "local" ? (
            <input
              type="password"
              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-xs"
              placeholder={
                data?.channels?.email?.api_key_configured
                  ? `設定済み …${data.channels.email.api_key_last4 ?? ""}`
                  : "APIキー / SMTPパスワード"
              }
              value={emailKey}
              onChange={(e) => setEmailKey(e.target.value)}
            />
          ) : null}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => onSave("email")}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
            >
              保存して接続
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onValidate("email")}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-700 disabled:opacity-50"
            >
              検証
            </button>
          </div>
        </ToolCard>

        <ToolCard
          title="LINE"
          ready={!!data?.channels?.line?.ready}
          hint="local=受信箱のみ。本物は Channel Access Token を貼って保存"
        >
          <p className="mb-2 text-[10px] font-bold text-slate-500">
            現在: {data?.channels?.line?.mode || "—"}
            {data?.channels?.line?.ready ? " · ready" : ""}
          </p>
          <input
            type="password"
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-xs"
            placeholder={
              data?.channels?.line?.channel_access_token_configured
                ? `設定済み …${data.channels.line.channel_access_token_last4 ?? ""}`
                : "Channel Access Token（空のまま保存=local）"
            }
            value={lineToken}
            onChange={(e) => setLineToken(e.target.value)}
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => onSave("line")}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
            >
              保存して接続
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onValidate("line")}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-700 disabled:opacity-50"
            >
              検証
            </button>
          </div>
        </ToolCard>
      </div>
    </div>
  );
}

function ToolCard({
  title,
  ready,
  hint,
  children,
}: {
  title: string;
  ready: boolean;
  hint: string;
  children: ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-bold text-slate-800">{title}</h4>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
            ready ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-500"
          }`}
        >
          {ready ? "接続済み" : "未接続"}
        </span>
      </div>
      <p className="mb-2 text-[11px] text-slate-500">{hint}</p>
      {children}
    </article>
  );
}
