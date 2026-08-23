import { APP_ROLES } from "@/config/organization";
import { resolveActorName, formatEventDate } from "./viewer-history";
import type { ReviewEventItem } from "./review-events";

const CLIENT_ROLES = new Set(["client_uploader"]);

const VIEW_EVENT_TYPES = new Set([
  "viewer_open_preview",
  "viewer_open_edit",
  "page_view",
]);

const STAMP_EVENT_TYPES = new Set(["acknowledge", "agree", "approve"]);

export const isContractSlotLabel = (slotLabel?: string | null): boolean =>
  /契約|覚書|合意|同意書|約定/.test(slotLabel ?? "");

export const isClientActorRole = (role?: string | null): boolean =>
  Boolean(role && CLIENT_ROLES.has(role));

export const roleLabelJa = (role?: string | null): string =>
  APP_ROLES.find((r) => r.id === role)?.label ?? role ?? "不明";

export type TrailViewRow = {
  key: string;
  actor: string;
  role: string;
  lastAt: string;
  lastAtLabel: string;
  opens: number;
};

export type TrailStampRow = {
  id: string;
  kind: "acknowledge" | "agree" | "approve";
  label: string;
  actor: string;
  role: string;
  at: string;
  atLabel: string;
  clientSide: boolean;
};

export type DocumentTrailSummary = {
  isContract: boolean;
  firmAgreed: boolean;
  clientAgreed: boolean;
  /** contract slots only: unsigned until both sides agree */
  agreement: "agreed" | "unsigned" | null;
  views: TrailViewRow[];
  stamps: TrailStampRow[];
};

const STAMP_LABEL: Record<string, string> = {
  acknowledge: "確認した",
  agree: "同意した",
  approve: "監査承認",
};

function actorKey(ev: ReviewEventItem): string {
  return ev.actor_stakeholder_id || ev.actor_email || "unknown";
}

export function summarizeDocumentTrail(
  events: ReviewEventItem[],
  slotLabel?: string | null,
): DocumentTrailSummary {
  const isContract = isContractSlotLabel(slotLabel);
  const viewMap = new Map<string, TrailViewRow>();
  for (const ev of events) {
    if (!VIEW_EVENT_TYPES.has(ev.event_type)) continue;
    const key = actorKey(ev);
    const prev = viewMap.get(key);
    const actor = resolveActorName(ev.actor_stakeholder_id, ev.actor_email);
    const role = roleLabelJa(ev.actor_role);
    if (!prev) {
      viewMap.set(key, {
        key,
        actor,
        role,
        lastAt: ev.created_at,
        lastAtLabel: formatEventDate(ev.created_at),
        opens: 1,
      });
    } else {
      prev.opens += 1;
      if (ev.created_at > prev.lastAt) {
        prev.lastAt = ev.created_at;
        prev.lastAtLabel = formatEventDate(ev.created_at);
      }
    }
  }
  const views = [...viewMap.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt));

  const stamps: TrailStampRow[] = events
    .filter((ev) => STAMP_EVENT_TYPES.has(ev.event_type))
    .map((ev) => ({
      id: ev.id,
      kind: ev.event_type as TrailStampRow["kind"],
      label: STAMP_LABEL[ev.event_type] ?? ev.action_title ?? ev.event_type,
      actor: resolveActorName(ev.actor_stakeholder_id, ev.actor_email),
      role: roleLabelJa(ev.actor_role),
      at: ev.created_at,
      atLabel: formatEventDate(ev.created_at),
      clientSide: isClientActorRole(ev.actor_role),
    }))
    .sort((a, b) => b.at.localeCompare(a.at));

  const agree = stamps.filter((s) => s.kind === "agree");
  const firmAgreed = agree.some((s) => !s.clientSide);
  const clientAgreed = agree.some((s) => s.clientSide);
  const agreement = isContract ? (firmAgreed && clientAgreed ? "agreed" : "unsigned") : null;

  return { isContract, firmAgreed, clientAgreed, agreement, views, stamps };
}

export function actorAlreadyStamped(
  events: ReviewEventItem[],
  kind: "acknowledge" | "agree",
  actorEmail?: string | null,
  actorStakeholderId?: string | null,
): boolean {
  return events.some(
    (ev) =>
      ev.event_type === kind &&
      ((actorEmail && ev.actor_email === actorEmail) ||
        (actorStakeholderId && ev.actor_stakeholder_id === actorStakeholderId)),
  );
}
