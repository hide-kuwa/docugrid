"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Download,
  FileCode2,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { IntegrationPortFormModal } from "@/features/dev/components/IntegrationPortFormModal";
import { IntegrationPortTestPanel } from "@/features/dev/components/IntegrationPortTestPanel";
import {
  createIntegrationPort,
  deleteIntegrationPort,
  EMPTY_PORT_FORM,
  exportIntegrationPortsYaml,
  fetchIntegrationPorts,
  importIntegrationPortsYaml,
  portToForm,
  reloadIntegrationPorts,
  statusLabel,
  statusTone,
  updateIntegrationPort,
  validateIntegrationPortsYaml,
  type ImportMode,
  type IntegrationPortItem,
  type IntegrationPortWriteBody,
  type IntegrationPortsListResponse,
} from "@/lib/integration-ports-api";

type Tab = "list" | "yaml";
type LoadState = "loading" | "ready" | "error";

export function IntegrationPortsPanel() {
  const [tab, setTab] = useState<Tab>("list");
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<IntegrationPortsListResponse | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [formInitial, setFormInitial] = useState<IntegrationPortWriteBody>(EMPTY_PORT_FORM);
  const [saving, setSaving] = useState(false);

  const [yamlText, setYamlText] = useState("");
  const [yamlBusy, setYamlBusy] = useState(false);
  const [validateResult, setValidateResult] = useState<{
    valid: boolean;
    errors: string[];
    port_count?: number;
  } | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>("merge");

  const load = useCallback(async () => {
    setLoadState("loading");
    setError(null);
    try {
      const res = await fetchIntegrationPorts();
      setData(res);
      setLoadState("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onReload = async () => {
    setReloading(true);
    setError(null);
    try {
      await reloadIntegrationPorts();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "再読込に失敗しました");
    } finally {
      setReloading(false);
    }
  };

  const openCreate = () => {
    setFormMode("create");
    setFormInitial({ ...EMPTY_PORT_FORM });
    setFormOpen(true);
  };

  const openEdit = (port: IntegrationPortItem) => {
    setFormMode("edit");
    setFormInitial(portToForm(port));
    setFormOpen(true);
  };

  const onSave = async (body: IntegrationPortWriteBody) => {
    setSaving(true);
    setError(null);
    try {
      if (formMode === "create") {
        await createIntegrationPort(body);
      } else {
        await updateIntegrationPort(body.port_id, body);
      }
      setFormOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (port: IntegrationPortItem) => {
    if (!window.confirm(`「${port.label_ja}」(${port.port_id}) を削除しますか？`)) return;
    setError(null);
    try {
      await deleteIntegrationPort(port.port_id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました");
    }
  };

  const onExportYaml = async () => {
    setYamlBusy(true);
    setError(null);
    try {
      const res = await exportIntegrationPortsYaml();
      setYamlText(res.yaml_text);
      setTab("yaml");
      setValidateResult(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "エクスポートに失敗しました");
    } finally {
      setYamlBusy(false);
    }
  };

  const onValidateYaml = async () => {
    setYamlBusy(true);
    setError(null);
    try {
      const res = await validateIntegrationPortsYaml(yamlText);
      setValidateResult({
        valid: res.valid,
        errors: res.errors,
        port_count: res.port_count,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "検証に失敗しました");
    } finally {
      setYamlBusy(false);
    }
  };

  const onImportYaml = async () => {
    const label =
      importMode === "replace"
        ? "既存のポートをすべて置き換えます。続行しますか？"
        : "YAML のポートを既存にマージします。続行しますか？";
    if (!window.confirm(label)) return;
    setYamlBusy(true);
    setError(null);
    try {
      await importIntegrationPortsYaml(yamlText, importMode);
      setValidateResult(null);
      await load();
      setTab("list");
    } catch (e) {
      setError(e instanceof Error ? e.message : "インポートに失敗しました");
    } finally {
      setYamlBusy(false);
    }
  };

  if (loadState === "loading" && !data) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        カタログを読み込み中…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-slate-400">
            YAML 正本の編集に加え、ポートごとの dry-run テスト送信ができます（C4）。
          </p>
          {data ? (
            <p className="mt-1 font-mono text-[10px] text-slate-500">
              v{data.version} · {data.port_count} ports · {data.config_path}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-500"
          >
            <Plus className="h-3.5 w-3.5" />
            追加
          </button>
          <button
            type="button"
            onClick={() => void onExportYaml()}
            disabled={yamlBusy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            エクスポート
          </button>
          <button
            type="button"
            onClick={() => void onReload()}
            disabled={reloading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-600/40 bg-amber-950/40 px-3 py-1.5 text-xs font-bold text-amber-200 hover:bg-amber-950/70 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${reloading ? "animate-spin" : ""}`} />
            再読込
          </button>
        </div>
      </div>

      <div className="flex gap-1 rounded-lg border border-slate-700 bg-slate-900/60 p-1">
        <TabButton active={tab === "list"} onClick={() => setTab("list")}>
          一覧
        </TabButton>
        <TabButton active={tab === "yaml"} onClick={() => setTab("yaml")}>
          <FileCode2 className="mr-1 inline h-3 w-3" />
          YAML
        </TabButton>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-800/50 bg-red-950/30 px-4 py-3 text-xs text-red-200">
          {error}
        </div>
      ) : null}

      {tab === "list" && data ? (
        <div className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-900/80">
          <table className="min-w-full border-collapse text-left text-[11px] text-slate-300">
            <thead className="bg-slate-800/80 text-[10px] font-black uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-8 border-b border-slate-700 px-2 py-2" />
                <th className="border-b border-slate-700 px-3 py-2">連携名</th>
                <th className="border-b border-slate-700 px-3 py-2">port_id</th>
                <th className="border-b border-slate-700 px-3 py-2">SSOT</th>
                <th className="border-b border-slate-700 px-3 py-2">手入力方針</th>
                <th className="border-b border-slate-700 px-3 py-2">方向</th>
                <th className="border-b border-slate-700 px-3 py-2">API</th>
                <th className="border-b border-slate-700 px-3 py-2">状態</th>
                <th className="w-20 border-b border-slate-700 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.ports.map((port) => (
                <PortRow
                  key={port.port_id}
                  port={port}
                  expanded={expandedId === port.port_id}
                  onToggle={() =>
                    setExpandedId((id) => (id === port.port_id ? null : port.port_id))
                  }
                  onEdit={() => openEdit(port)}
                  onDelete={() => void onDelete(port)}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "yaml" ? (
        <div className="space-y-3 rounded-xl border border-slate-700 bg-slate-900/80 p-4">
          <textarea
            className="min-h-[320px] w-full rounded-lg border border-slate-600 bg-slate-950 p-3 font-mono text-[11px] text-slate-200 focus:border-amber-500 focus:outline-none"
            value={yamlText}
            placeholder="YAML を貼り付けるか、エクスポートで取得してください"
            onChange={(e) => {
              setYamlText(e.target.value);
              setValidateResult(null);
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={yamlBusy || !yamlText.trim()}
              onClick={() => void onValidateYaml()}
              className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
            >
              検証
            </button>
            <select
              className="rounded-lg border border-slate-600 bg-slate-950 px-2 py-1.5 text-xs text-slate-200"
              value={importMode}
              onChange={(e) => setImportMode(e.target.value as ImportMode)}
            >
              <option value="merge">マージ（既存 + 上書き）</option>
              <option value="replace">置換（全入れ替え）</option>
            </select>
            <button
              type="button"
              disabled={yamlBusy || !yamlText.trim()}
              onClick={() => void onImportYaml()}
              className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-500 disabled:opacity-50"
            >
              インポート
            </button>
            {yamlBusy ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
          </div>
          {validateResult ? (
            <div
              className={`rounded-lg border px-3 py-2 text-xs ${
                validateResult.valid
                  ? "border-emerald-800/50 bg-emerald-950/30 text-emerald-200"
                  : "border-red-800/50 bg-red-950/30 text-red-200"
              }`}
            >
              {validateResult.valid ? (
                <p>検証 OK — {validateResult.port_count ?? 0} ports</p>
              ) : (
                <ul className="list-inside list-disc space-y-0.5">
                  {validateResult.errors.map((msg) => (
                    <li key={msg}>{msg}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      <IntegrationPortFormModal
        open={formOpen}
        mode={formMode}
        initial={formInitial}
        saving={saving}
        onClose={() => setFormOpen(false)}
        onSave={(body) => void onSave(body)}
      />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-xs font-bold ${
        active ? "bg-amber-600 text-white" : "text-slate-400 hover:text-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

function PortRow({
  port,
  expanded,
  onToggle,
  onEdit,
  onDelete,
}: {
  port: IntegrationPortItem;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const apiLabel =
    port.api_method && port.api_path
      ? `${port.api_method} ${port.api_path}`
      : port.api_path || "—";

  return (
    <>
      <tr className="hover:bg-slate-800/40">
        <td className="border-b border-slate-800 px-2 py-2">
          <button
            type="button"
            onClick={onToggle}
            className="rounded p-0.5 text-slate-500 hover:text-slate-300"
            aria-expanded={expanded}
            aria-label="詳細を表示"
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
        </td>
        <td className="border-b border-slate-800 px-3 py-2 font-bold text-white">
          {port.label_ja}
        </td>
        <td className="border-b border-slate-800 px-3 py-2 font-mono text-[10px] text-slate-400">
          {port.port_id}
        </td>
        <td className="border-b border-slate-800 px-3 py-2">
          {port.ssot_owner_label || port.ssot_owner || "—"}
        </td>
        <td className="border-b border-slate-800 px-3 py-2">
          {port.manual_policy_label || port.manual_policy || "—"}
        </td>
        <td className="border-b border-slate-800 px-3 py-2">{port.direction || "—"}</td>
        <td className="border-b border-slate-800 px-3 py-2 font-mono text-[10px]">
          {apiLabel}
        </td>
        <td className="border-b border-slate-800 px-3 py-2">
          <span
            className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusTone(port.status)}`}
          >
            {statusLabel(port.status)}
          </span>
        </td>
        <td className="border-b border-slate-800 px-2 py-2">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={onEdit}
              className="rounded p-1 text-slate-500 hover:text-amber-300"
              aria-label="編集"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="rounded p-1 text-slate-500 hover:text-red-300"
              aria-label="削除"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </td>
      </tr>
      {expanded ? (
        <tr className="bg-slate-950/60">
          <td colSpan={9} className="border-b border-slate-800 px-4 py-3">
            <dl className="grid gap-2 text-[10px] sm:grid-cols-2">
              <DetailItem label="source" value={port.source} />
              <DetailItem label="target" value={port.target} />
              <DetailItem label="idempotency_key" value={port.idempotency_key_template} />
              {port.notes ? (
                <div className="sm:col-span-2">
                  <dt className="font-bold text-slate-500">notes</dt>
                  <dd className="mt-0.5 text-slate-300">{port.notes}</dd>
                </div>
              ) : null}
            </dl>
            <IntegrationPortTestPanel port={port} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <dt className="font-bold text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-mono text-slate-300">{value}</dd>
    </div>
  );
}
