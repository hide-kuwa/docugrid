import { STAKEHOLDER_MASTER } from "@/config/organization";
import { versionSourceLabel, type DocumentVersionItem } from "./document-versions";
import type { ReviewEventItem } from "./review-events";
import {
  EnhancedDocVersion,
  isPersistedDocumentVersionId,
  WorkflowStatus,
} from "../types";

export const resolveActorName = (stakeholderId: string | null, email: string | null): string => {
  if (stakeholderId) {
    const match = STAKEHOLDER_MASTER.find((item) => item.id === stakeholderId);
    if (match) return match.displayName;
  }
  return email || stakeholderId || "操作者";
};

export const formatEventDate = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const HISTORY_META_EVENT_TYPES = new Set([
  "document_delete",
  "version_delete",
  "client_share",
  "client_unshare",
]);

const HISTORY_NOISE_EVENT_TYPES = new Set([
  "page_view",
  "viewer_open_preview",
  "viewer_open_edit",
  "viewer_close",
]);

const findVersionReviewEvent = (
  events: ReviewEventItem[],
  versionId: string,
): ReviewEventItem | undefined =>
  events.find(
    (e) => e.document_version_id === versionId && !HISTORY_NOISE_EVENT_TYPES.has(e.event_type),
  );

const collectVersionPageViewLogs = (events: ReviewEventItem[], versionId: string): string[] => {
  const seen = new Set<string>();
  const logs: string[] = [];
  for (const e of events) {
    if (e.document_version_id !== versionId || e.event_type !== "page_view") continue;
    const title = e.action_title?.trim();
    if (!title || seen.has(title)) continue;
    seen.add(title);
    logs.push(title);
  }
  return logs;
};

export const reviewEventToVersion = (event: ReviewEventItem): EnhancedDocVersion => ({
  ver:
    event.version_label ||
    (HISTORY_META_EVENT_TYPES.has(event.event_type) ? "—" : "v1.0.0"),
  date: formatEventDate(event.created_at),
  user: resolveActorName(event.actor_stakeholder_id, event.actor_email),
  action: event.action_title || event.event_type,
  status: (event.status as WorkflowStatus) || "draft",
  actionsLog: event.reason ? [event.reason] : [],
  isMajor: event.is_major,
  versionId: event.document_version_id || event.id,
  isDeletion: event.event_type === "document_delete" || event.event_type === "version_delete",
  metaEventType:
    event.event_type === "client_share"
      ? "client_share"
      : event.event_type === "client_unshare"
        ? "client_unshare"
        : undefined,
});

export const isHistoryMetaEntry = (entry: EnhancedDocVersion): boolean =>
  entry.isDeletion === true || entry.metaEventType != null;

export const findLatestVersionEntryIndex = (entries: EnhancedDocVersion[]): number =>
  entries.findIndex(
    (entry) => isPersistedDocumentVersionId(entry.versionId) && !isHistoryMetaEntry(entry),
  );

export const buildHistoryFromVersions = (
  versions: DocumentVersionItem[],
  events: ReviewEventItem[],
): EnhancedDocVersion[] => {
  type Row = EnhancedDocVersion & { sortAt: string };
  const rows: Row[] = versions.map((v) => {
    const ev = findVersionReviewEvent(events, v.id);
    const pageViewLogs = collectVersionPageViewLogs(events, v.id);
    const actionsLog = [...(ev?.reason ? [ev.reason] : []), ...pageViewLogs];
    return {
      ver: v.version_label,
      date: formatEventDate(v.created_at),
      user: resolveActorName(v.created_by_stakeholder_id, v.created_by_email),
      action: ev?.action_title || versionSourceLabel(v.source),
      status: (ev?.status as WorkflowStatus) || "draft",
      actionsLog,
      isMajor: ev?.is_major ?? /\.0\.0$/.test(v.version_label),
      versionId: v.id,
      sortAt: v.created_at,
    };
  });
  for (const e of events) {
    if (!HISTORY_META_EVENT_TYPES.has(e.event_type)) continue;
    rows.push({ ...reviewEventToVersion(e), sortAt: e.created_at });
  }
  return rows
    .sort((a, b) => b.sortAt.localeCompare(a.sortAt))
    .map(({ sortAt: _sortAt, ...rest }) => rest);
};

export const WORKFLOW_BUMP: Partial<Record<string, import("./document-versions").VersionBump>> = {
  work_save: "minor",
  audit_start: "audit_start",
  approve: "major",
};

export const fallbackActiveVersion: EnhancedDocVersion = {
  ver: "---",
  date: "",
  user: "",
  action: "",
  status: "draft",
  actionsLog: [],
  isMajor: false,
  versionId: "fallback",
};
