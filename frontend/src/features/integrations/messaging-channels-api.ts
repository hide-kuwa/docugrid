import { API_BASE } from "@/config/api";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";

export type EmailChannelConfig = {
  enabled: boolean;
  provider: "resend" | "sendgrid" | "smtp" | string;
  from_email: string;
  reply_to: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_use_tls: boolean;
  api_key_configured: boolean;
  api_key_last4: string | null;
  ready: boolean;
};

export type SlackChannelConfig = {
  enabled: boolean;
  mode: "webhook" | "bot" | string;
  default_channel: string;
  webhook_url_configured: boolean;
  webhook_url_last4: string | null;
  bot_token_configured: boolean;
  bot_token_last4: string | null;
  signing_secret_configured?: boolean;
  ready: boolean;
};

export type LineChannelConfig = {
  enabled: boolean;
  mode: "messaging_api" | "notify" | string;
  destination_user_id: string;
  channel_access_token_configured: boolean;
  channel_access_token_last4: string | null;
  ready: boolean;
};

export type MessagingChannelsPayload = {
  email: EmailChannelConfig;
  slack: SlackChannelConfig;
  line: LineChannelConfig;
  updated_at?: string | null;
  summary?: {
    any_ready: boolean;
    ready_channels: string[];
    enabled_channels: string[];
  };
};

export type MessagingChannelsUpdate = {
  email?: Partial<{
    enabled: boolean;
    provider: string;
    from_email: string;
    reply_to: string;
    smtp_host: string;
    smtp_port: number;
    smtp_user: string;
    smtp_use_tls: boolean;
    api_key: string;
    clear_api_key: boolean;
  }>;
  slack?: Partial<{
    enabled: boolean;
    mode: string;
    default_channel: string;
    webhook_url: string;
    clear_webhook_url: boolean;
    bot_token: string;
    clear_bot_token: boolean;
    signing_secret: string;
    clear_signing_secret: boolean;
  }>;
  line?: Partial<{
    enabled: boolean;
    mode: string;
    destination_user_id: string;
    channel_access_token: string;
    clear_channel_access_token: boolean;
  }>;
};

export async function fetchMessagingChannels(): Promise<MessagingChannelsPayload> {
  const res = await authFetch(`${API_BASE}/messaging-channels`, {
    headers: buildAuthHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as MessagingChannelsPayload;
}

export async function saveMessagingChannels(
  body: MessagingChannelsUpdate,
): Promise<MessagingChannelsPayload> {
  const res = await authFetch(`${API_BASE}/messaging-channels`, {
    method: "PUT",
    headers: { ...buildAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as MessagingChannelsPayload;
}

export async function testMessagingChannel(args: {
  channel: "email" | "slack" | "line";
  to?: string;
  dryRun?: boolean;
}): Promise<Record<string, unknown>> {
  const res = await authFetch(`${API_BASE}/messaging-channels/test`, {
    method: "POST",
    headers: { ...buildAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      channel: args.channel,
      to: args.to,
      dry_run: args.dryRun ?? true,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as Record<string, unknown>;
}
