"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Puzzle } from "lucide-react";
import { ConfigSheetIntro } from "@/features/config/components/ConfigSheetIntro";
import { parseApiErrorBody } from "@/lib/parse-api-error";
import {
  assignAdminAddon,
  createAdminAddon,
  fetchAdminAddons,
  fetchFirmAddons,
  installFirmAddon,
  promoteAdminAddon,
  uninstallFirmAddon,
  type AdminAddon,
  type FirmAddon,
} from "./addons-api";

const STATUS_LABEL: Record<string, string> = {
  official: "公式",
  draft: "下書き",
  pilot: "パイロット",
  internal: "こちら専用",
};

type Props = {
  isPlatformAdmin: boolean;
  consoleKind: "firm" | "dev";
};

export function AddonsSettingsTab({ isPlatformAdmin, consoleKind }: Props) {
  const showPlatform = isPlatformAdmin && consoleKind === "dev";
  return showPlatform ? <AddonsPlatformPanel /> : <AddonsFirmPanel />;
}

function AddonsFirmPanel() {
  const [addons, setAddons] = useState<FirmAddon[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const data = await fetchFirmAddons();
      setAddons(data.addons);
    } catch (e) {
      setMessage(parseApiErrorBody(e) || "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => groupBy(addons, (a) => a.group), [addons]);

  const toggle = async (addon: FirmAddon) => {
    setBusyId(addon.id);
    setMessage("");
    try {
      if (addon.installed) await uninstallFirmAddon(addon.id);
      else await installFirmAddon(addon.id);
      await load();
    } catch (e) {
      setMessage(parseApiErrorBody(e) || "更新に失敗しました");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="fade-in-up space-y-4">
      <ConfigSheetIntro
        sheetId="addons"
        sheetLabel="ADDONS"
        title="アドオン"
        description="公式パックをこの事務所に付け外しします。こちら専用のアドオンは一覧に出ても操作できません。"
      />
      {message ? <p className="text-sm text-rose-700">{message}</p> : null}
      {loading ? (
        <p className="text-sm text-slate-400">読み込み中…</p>
      ) : addons.length === 0 ? (
        <p className="text-sm text-slate-400">付けられるアドオンはまだありません。</p>
      ) : (
        grouped.map(([group, items]) => (
          <div key={group} className="space-y-2">
            <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{group}</h3>
            <ul className="space-y-2">
              {items.map((addon) => (
                <li
                  key={addon.id}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Puzzle className="h-4 w-4 text-violet-600" />
                      <p className="text-sm font-bold text-slate-800">{addon.title}</p>
                      <StatusBadge status={addon.status} />
                      {addon.installed ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                          使用中
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{addon.summary}</p>
                    {addon.locked && addon.lockedReason ? (
                      <p className="mt-1 text-[11px] text-slate-400">{addon.lockedReason}</p>
                    ) : null}
                  </div>
                  {addon.canInstall || addon.canUninstall ? (
                    <button
                      type="button"
                      disabled={busyId === addon.id}
                      onClick={() => void toggle(addon)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 disabled:opacity-40"
                    >
                      {addon.installed ? "外す" : "付ける"}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}

function AddonsPlatformPanel() {
  const [addons, setAddons] = useState<AdminAddon[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [title, setTitle] = useState("");
  const [addonId, setAddonId] = useState("");
  const [summary, setSummary] = useState("");
  const [pilotFirmId, setPilotFirmId] = useState("");
  const [assignFirmId, setAssignFirmId] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const data = await fetchAdminAddons();
      setAddons(data.addons);
    } catch (e) {
      setMessage(parseApiErrorBody(e) || "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setSaving(true);
    setMessage("");
    try {
      await createAdminAddon({
        id: addonId.trim() || undefined,
        title: title.trim(),
        summary: summary.trim(),
        installableBy: "firm",
        pilotFirmIds: pilotFirmId.trim() ? [pilotFirmId.trim()] : [],
      });
      setTitle("");
      setAddonId("");
      setSummary("");
      setPilotFirmId("");
      await load();
      setMessage("下書きを作成しました。パイロット事務所に載せてから公式へ昇格できます。");
    } catch (e) {
      setMessage(parseApiErrorBody(e) || "作成に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="fade-in-up space-y-4">
      <ConfigSheetIntro
        sheetId="addons"
        sheetLabel="ADDONS / PLATFORM"
        title="アドオン（こちら側）"
        description="下書きを1事務所に載せて試し、うまくいったら公式カタログへ昇格します。internal は事務所が付け外しできません。"
      />
      {message ? <p className="text-sm text-slate-700">{message}</p> : null}

      <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
        <p className="text-xs font-bold text-slate-700">新しい下書き</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <input
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
            placeholder="タイトル（例: 医療届出パック）"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-mono text-sm"
            placeholder="ID（任意: medical-filings）"
            value={addonId}
            onChange={(e) => setAddonId(e.target.value)}
          />
          <input
            className="sm:col-span-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
            placeholder="要約"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
          <input
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-mono text-sm"
            placeholder="パイロット事務所 ID（任意）"
            value={pilotFirmId}
            onChange={(e) => setPilotFirmId(e.target.value)}
          />
          <button
            type="button"
            disabled={saving || !title.trim()}
            onClick={() => void create()}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
          >
            下書きを作成
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">読み込み中…</p>
      ) : (
        <ul className="space-y-2">
          {addons.map((addon) => (
            <li key={addon.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-bold text-slate-800">{addon.title}</p>
                <span className="font-mono text-[10px] text-slate-400">{addon.id}</span>
                <StatusBadge status={addon.status} />
                <span className="text-[10px] text-slate-400">
                  {addon.installableBy === "firm" ? "事務所が付けられる" : "こちら専用"}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{addon.summary}</p>
              <p className="mt-1 text-[11px] text-slate-400">
                導入 {addon.installedFirmIds.length} 事務所
                {addon.pilotFirmIds.length > 0 ? ` · パイロット ${addon.pilotFirmIds.join(", ")}` : ""}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  className="w-44 rounded-lg border border-slate-200 px-2 py-1 font-mono text-xs"
                  placeholder="事務所 ID"
                  value={assignFirmId}
                  onChange={(e) => setAssignFirmId(e.target.value)}
                />
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-bold"
                  onClick={() => {
                    if (!assignFirmId.trim()) return;
                    void assignAdminAddon(addon.id, assignFirmId.trim(), true)
                      .then(() => load())
                      .catch((e) => setMessage(parseApiErrorBody(e) || "配布に失敗しました"));
                  }}
                >
                  この事務所に載せる
                </button>
                {addon.status === "draft" || addon.status === "pilot" ? (
                  <button
                    type="button"
                    className="rounded-lg bg-violet-700 px-2 py-1 text-[11px] font-bold text-white"
                    onClick={() => {
                      void promoteAdminAddon(addon.id)
                        .then(() => load())
                        .catch((e) => setMessage(parseApiErrorBody(e) || "昇格に失敗しました"));
                    }}
                  >
                    公式へ昇格
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "official"
      ? "bg-violet-50 text-violet-800"
      : status === "internal"
        ? "bg-slate-100 text-slate-700"
        : "bg-amber-50 text-amber-800";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${cls}`}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}

function groupBy<T>(items: T[], key: (item: T) => string): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const g = key(item) || "other";
    if (!map.has(g)) map.set(g, []);
    map.get(g)!.push(item);
  }
  return [...map.entries()];
}
