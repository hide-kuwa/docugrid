"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Mail, MessageCircle, MessagesSquare } from "lucide-react";
import { FeatureSurfaceSection } from "@/features/feature-surfaces/FeatureSurfaceGate";
import {
  fetchMessagingChannels,
  saveMessagingChannels,
  testMessagingChannel,
  type MessagingChannelsPayload,
} from "@/features/integrations/messaging-channels-api";
import { parseApiErrorBody } from "@/lib/parse-api-error";

const FEATURE_ID = "messaging.channels";

export function MessagingChannelsPanel() {
  const [data, setData] = useState<MessagingChannelsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [emailEnabled, setEmailEnabled] = useState(false);
  const [emailProvider, setEmailProvider] = useState("resend");
  const [fromEmail, setFromEmail] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpUser, setSmtpUser] = useState("");
  const [emailApiKey, setEmailApiKey] = useState("");

  const [slackEnabled, setSlackEnabled] = useState(false);
  const [slackMode, setSlackMode] = useState("webhook");
  const [slackChannel, setSlackChannel] = useState("");
  const [slackWebhook, setSlackWebhook] = useState("");
  const [slackBotToken, setSlackBotToken] = useState("");

  const [lineEnabled, setLineEnabled] = useState(false);
  const [lineMode, setLineMode] = useState("messaging_api");
  const [lineDest, setLineDest] = useState("");
  const [lineToken, setLineToken] = useState("");

  const apply = useCallback((payload: MessagingChannelsPayload) => {
    setData(payload);
    setEmailEnabled(payload.email.enabled);
    setEmailProvider(payload.email.provider || "resend");
    setFromEmail(payload.email.from_email || "");
    setReplyTo(payload.email.reply_to || "");
    setSmtpHost(payload.email.smtp_host || "");
    setSmtpPort(payload.email.smtp_port || 587);
    setSmtpUser(payload.email.smtp_user || "");
    setSlackEnabled(payload.slack.enabled);
    setSlackMode(payload.slack.mode || "webhook");
    setSlackChannel(payload.slack.default_channel || "");
    setLineEnabled(payload.line.enabled);
    setLineMode(payload.line.mode || "messaging_api");
    setLineDest(payload.line.destination_user_id || "");
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      apply(await fetchMessagingChannels());
    } catch (e) {
      setMessage(parseApiErrorBody(e) || "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [apply]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    try {
      const saved = await saveMessagingChannels({
        email: {
          enabled: emailEnabled,
          provider: emailProvider,
          from_email: fromEmail,
          reply_to: replyTo,
          smtp_host: smtpHost,
          smtp_port: smtpPort,
          smtp_user: smtpUser,
          ...(emailApiKey.trim() ? { api_key: emailApiKey.trim() } : {}),
        },
        slack: {
          enabled: slackEnabled,
          mode: slackMode,
          default_channel: slackChannel,
          ...(slackWebhook.trim() ? { webhook_url: slackWebhook.trim() } : {}),
          ...(slackBotToken.trim() ? { bot_token: slackBotToken.trim() } : {}),
        },
        line: {
          enabled: lineEnabled,
          mode: lineMode,
          destination_user_id: lineDest,
          ...(lineToken.trim()
            ? { channel_access_token: lineToken.trim() }
            : {}),
        },
      });
      apply(saved);
      setEmailApiKey("");
      setSlackWebhook("");
      setSlackBotToken("");
      setLineToken("");
      setMessage("保存しました。シークレットは暗号化して事務所単位で保持します。");
    } catch (e) {
      setMessage(parseApiErrorBody(e) || "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (
    channel: "email" | "slack" | "line",
    dryRun: boolean,
  ) => {
    setSaving(true);
    setMessage("");
    try {
      const res = await testMessagingChannel({ channel, dryRun });
      setMessage(
        dryRun
          ? `検証OK（${channel}）: ${String(res.hint || res.status || "ready")}`
          : `テスト送信OK（${channel}）`,
      );
      await load();
    } catch (e) {
      setMessage(parseApiErrorBody(e) || `${channel} のテストに失敗しました`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        通知連携を読み込み中…
      </div>
    );
  }

  return (
    <FeatureSurfaceSection
      featureId={FEATURE_ID}
      bodyClassName="space-y-5 p-4"
      fallbackMessage="メール・Slack・LINE をログイン後にノーコード接続します。未設定のチャネルは通知に使えません。"
    >
      <header className="space-y-1">
        <h3 className="text-sm font-bold text-slate-800">通知連携（メール / Slack / LINE）</h3>
        <p className="text-xs text-slate-500">
          事務所管理者が設定します。API キーや Webhook は画面に再表示されず、保存後は末尾4桁のみ確認できます。
        </p>
        {data?.summary ? (
          <p className="text-[11px] text-slate-500">
            有効: {data.summary.enabled_channels.join(", ") || "なし"} · 送信準備OK:{" "}
            {data.summary.ready_channels.join(", ") || "なし"}
          </p>
        ) : null}
      </header>

      {/* Email */}
      <article className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-slate-600" />
            <span className="text-sm font-bold text-slate-800">メール</span>
            <ReadyBadge ready={!!data?.email.ready} />
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            有効
            <input
              type="checkbox"
              checked={emailEnabled}
              onChange={(e) => setEmailEnabled(e.target.checked)}
            />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-600">
            プロバイダ
            <select
              className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              value={emailProvider}
              onChange={(e) => setEmailProvider(e.target.value)}
            >
              <option value="resend">Resend</option>
              <option value="sendgrid">SendGrid</option>
              <option value="smtp">SMTP</option>
              <option value="local">local（外部送信なし）</option>
            </select>
          </label>
          <label className="text-xs text-slate-600">
            From
            <input
              className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              placeholder="noreply@example.com"
            />
          </label>
          <label className="text-xs text-slate-600">
            Reply-To（任意）
            <input
              className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
            />
          </label>
          <label className="text-xs text-slate-600">
            APIキー / SMTPパスワード
            <input
              type="password"
              className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              value={emailApiKey}
              onChange={(e) => setEmailApiKey(e.target.value)}
              placeholder={
                data?.email.api_key_configured
                  ? `設定済み …${data.email.api_key_last4 ?? ""}`
                  : "未設定"
              }
            />
          </label>
        </div>
        {emailProvider === "smtp" ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs text-slate-600 sm:col-span-2">
              SMTPホスト
              <input
                className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
              />
            </label>
            <label className="text-xs text-slate-600">
              ポート
              <input
                type="number"
                className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                value={smtpPort}
                onChange={(e) => setSmtpPort(Number(e.target.value) || 587)}
              />
            </label>
            <label className="text-xs text-slate-600 sm:col-span-3">
              SMTPユーザー
              <input
                className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                value={smtpUser}
                onChange={(e) => setSmtpUser(e.target.value)}
              />
            </label>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleTest("email", true)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 disabled:opacity-50"
          >
            設定を検証
          </button>
        </div>
      </article>

      {/* Slack */}
      <article className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MessagesSquare className="h-4 w-4 text-slate-600" />
            <span className="text-sm font-bold text-slate-800">Slack</span>
            <ReadyBadge ready={!!data?.slack.ready} />
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            有効
            <input
              type="checkbox"
              checked={slackEnabled}
              onChange={(e) => setSlackEnabled(e.target.checked)}
            />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-600">
            接続方式
            <select
              className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              value={slackMode}
              onChange={(e) => setSlackMode(e.target.value)}
            >
              <option value="webhook">Incoming Webhook</option>
              <option value="bot">Bot Token</option>
              <option value="local">local（外部送信なし・受信箱のみ）</option>
            </select>
          </label>
          <label className="text-xs text-slate-600">
            既定チャンネル（Bot時）
            <input
              className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              value={slackChannel}
              onChange={(e) => setSlackChannel(e.target.value)}
              placeholder="#ops または C0123…"
            />
          </label>
          {slackMode === "webhook" ? (
            <label className="text-xs text-slate-600 sm:col-span-2">
              Webhook URL
              <input
                type="password"
                className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-xs"
                value={slackWebhook}
                onChange={(e) => setSlackWebhook(e.target.value)}
                placeholder={
                  data?.slack.webhook_url_configured
                    ? `設定済み …${data.slack.webhook_url_last4 ?? ""}`
                    : "https://hooks.slack.com/services/…"
                }
              />
            </label>
          ) : slackMode === "bot" ? (
            <label className="text-xs text-slate-600 sm:col-span-2">
              Bot Token (xoxb-…)
              <input
                type="password"
                className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-xs"
                value={slackBotToken}
                onChange={(e) => setSlackBotToken(e.target.value)}
                placeholder={
                  data?.slack.bot_token_configured
                    ? `設定済み …${data.slack.bot_token_last4 ?? ""}`
                    : "未設定"
                }
              />
            </label>
          ) : (
            <p className="text-xs text-slate-500 sm:col-span-2">
              local モード: 外部 Slack へは送らず、DM 受信箱にだけ残します。
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleTest("slack", true)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 disabled:opacity-50"
          >
            設定を検証
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleTest("slack", false)}
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
          >
            テスト送信
          </button>
        </div>
      </article>

      {/* LINE */}
      <article className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-slate-600" />
            <span className="text-sm font-bold text-slate-800">LINE</span>
            <ReadyBadge ready={!!data?.line.ready} />
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            有効
            <input
              type="checkbox"
              checked={lineEnabled}
              onChange={(e) => setLineEnabled(e.target.checked)}
            />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-600">
            接続方式
            <select
              className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              value={lineMode}
              onChange={(e) => setLineMode(e.target.value)}
            >
              <option value="messaging_api">Messaging API</option>
              <option value="notify">LINE Notify 互換（宛先必須）</option>
              <option value="local">local（外部送信なし・受信箱のみ）</option>
            </select>
          </label>
          <label className="text-xs text-slate-600">
            テスト宛先 User ID（任意）
            <input
              className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-xs"
              value={lineDest}
              onChange={(e) => setLineDest(e.target.value)}
            />
          </label>
          {lineMode === "local" ? (
            <p className="text-xs text-slate-500 sm:col-span-2">
              local モード: 外部 LINE へは送らず、DM 受信箱にだけ残します。
            </p>
          ) : (
            <label className="text-xs text-slate-600 sm:col-span-2">
              Channel Access Token
              <input
                type="password"
                className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-xs"
                value={lineToken}
                onChange={(e) => setLineToken(e.target.value)}
                placeholder={
                  data?.line.channel_access_token_configured
                    ? `設定済み …${data.line.channel_access_token_last4 ?? ""}`
                    : "未設定"
                }
              />
            </label>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleTest("line", true)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 disabled:opacity-50"
          >
            設定を検証
          </button>
        </div>
      </article>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSave()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "処理中…" : "保存する"}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void load()}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50"
        >
          再読込
        </button>
      </div>

      {message ? (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">{message}</p>
      ) : null}
    </FeatureSurfaceSection>
  );
}

function ReadyBadge({ ready }: { ready: boolean }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
        ready ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-500"
      }`}
    >
      {ready ? "送信準備OK" : "未設定"}
    </span>
  );
}
