import {
  CLIENT_PROFILE_FIELD_IDS,
  MASTER_EDITABLE_FIELD_IDS,
  MAX_PROFILE_HISTORY_PER_FIELD,
  type ProfileFieldChange,
  type ProfileFieldMeta,
  type ProfileFieldSource,
} from "@/config/client-profile-fields";
import type { OrgClient } from "@/config/organization";

export type FieldChangeActor = {
  email: string;
  name: string;
  stakeholderId?: string;
};

function actorLabel(actor: FieldChangeActor): string {
  return (actor.name || actor.email).trim();
}

export function appendFieldHistory(
  history: Record<string, ProfileFieldChange[]> | undefined,
  fieldId: string,
  entry: ProfileFieldChange,
): Record<string, ProfileFieldChange[]> {
  const prev = history?.[fieldId] ?? [];
  return {
    ...(history ?? {}),
    [fieldId]: [entry, ...prev].slice(0, MAX_PROFILE_HISTORY_PER_FIELD),
  };
}

function buildChangeEntry(
  newValue: string,
  previousValue: string,
  actor: FieldChangeActor,
  source: ProfileFieldSource = "manual",
): ProfileFieldChange {
  const now = new Date().toISOString();
  return {
    value: newValue,
    previousValue,
    source,
    updatedAt: now,
    updatedBy: actorLabel(actor),
    updatedById: actor.stakeholderId,
  };
}

function buildMetaEntry(
  actor: FieldChangeActor,
  source: ProfileFieldSource = "manual",
): ProfileFieldMeta {
  return {
    source,
    updatedAt: new Date().toISOString(),
    updatedBy: actorLabel(actor),
    updatedById: actor.stakeholderId,
  };
}

export function readMasterFieldValue(client: OrgClient, fieldId: string): string {
  if (fieldId === "_name") return client.name ?? "";
  if (fieldId === "_fiscal_month") {
    return client.fiscalMonth ? String(client.fiscalMonth) : "";
  }
  return "";
}

export function applyProfileFieldUpdate(
  client: OrgClient,
  fieldId: string,
  newValue: string,
  actor: FieldChangeActor,
): OrgClient {
  if (!CLIENT_PROFILE_FIELD_IDS.includes(fieldId)) return client;
  const current = client.profile?.[fieldId] ?? "";
  if (current === newValue) return client;
  const previousValue = current.trim();
  const change = buildChangeEntry(newValue, previousValue, actor);
  return {
    ...client,
    profile: { ...(client.profile ?? {}), [fieldId]: newValue },
    profileMeta: {
      ...(client.profileMeta ?? {}),
      [fieldId]: buildMetaEntry(actor),
    },
    profileHistory: appendFieldHistory(client.profileHistory, fieldId, change),
  };
}

export function applyMasterFieldUpdate(
  client: OrgClient,
  fieldId: string,
  rawValue: string,
  actor: FieldChangeActor,
): OrgClient {
  if (!MASTER_EDITABLE_FIELD_IDS.includes(fieldId as (typeof MASTER_EDITABLE_FIELD_IDS)[number])) {
    return client;
  }

  if (fieldId === "_name") {
    const previousValue = (client.name ?? "").trim();
    const newValue = rawValue.trim();
    if (!newValue || previousValue === newValue) return client;
    const change = buildChangeEntry(newValue, previousValue, actor, "master");
    return {
      ...client,
      name: newValue,
      profileHistory: appendFieldHistory(client.profileHistory, fieldId, change),
    };
  }

  if (fieldId === "_fiscal_month") {
    const parsed = Number.parseInt(rawValue, 10);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 12) return client;
    const previousValue = client.fiscalMonth ? String(client.fiscalMonth) : "";
    if (previousValue === String(parsed)) return client;
    const change = buildChangeEntry(String(parsed), previousValue, actor, "master");
    return {
      ...client,
      fiscalMonth: parsed,
      profileHistory: appendFieldHistory(client.profileHistory, fieldId, change),
    };
  }

  return client;
}

export function applyFieldUpdate(
  client: OrgClient,
  fieldId: string,
  value: string,
  actor: FieldChangeActor,
): OrgClient {
  if (fieldId.startsWith("_")) {
    return applyMasterFieldUpdate(client, fieldId, value, actor);
  }
  return applyProfileFieldUpdate(client, fieldId, value, actor);
}

/** 設定画面の一括保存時 — 読み込み時点との差分を履歴に追記する。 */
export function mergeClientHistoryOnSave(
  before: OrgClient,
  after: OrgClient,
  actor: FieldChangeActor,
): OrgClient {
  let profileHistory = { ...(after.profileHistory ?? {}) };
  let profileMeta = { ...(after.profileMeta ?? {}) };

  const record = (
    fieldId: string,
    newValue: string,
    previousValue: string,
    source: ProfileFieldSource,
  ) => {
    const prev = previousValue.trim();
    const next = newValue.trim();
    if (prev === next && newValue === previousValue) return;
    const change = buildChangeEntry(newValue, previousValue, actor, source);
    profileHistory = appendFieldHistory(profileHistory, fieldId, change);
    if (!fieldId.startsWith("_")) {
      profileMeta = { ...profileMeta, [fieldId]: buildMetaEntry(actor, source) };
    }
  };

  record("_name", after.name ?? "", before.name ?? "", "master");
  record(
    "_fiscal_month",
    String(after.fiscalMonth ?? ""),
    before.fiscalMonth ? String(before.fiscalMonth) : "",
    "master",
  );

  for (const fieldId of CLIENT_PROFILE_FIELD_IDS) {
    record(
      fieldId,
      after.profile?.[fieldId] ?? "",
      before.profile?.[fieldId] ?? "",
      "manual",
    );
  }

  return { ...after, profileMeta, profileHistory };
}
