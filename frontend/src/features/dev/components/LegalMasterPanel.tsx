"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Globe,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sprout,
  Table2,
  Trash2,
  X,
} from "lucide-react";
import {
  createLegalMasterEntry,
  deleteLegalMasterEntry,
  domainLabel,
  exportLegalMasterCsv,
  fetchCorporateTaxRate,
  fetchLegalMasterEntries,
  fetchRefTable,
  fetchRefTables,
  fetchWithholdingMonthly,
  calcEmploymentInsurance,
  clipSocialInsuranceBasis,
  lookupBasicDeduction,
  lookupSpouseDeduction,
  lookupCorporatePercapita,
  calcSimplifiedConsumption,
  calcEmploymentIncome,
  calcIndividualResidentTax,
  checkMinimumWage,
  calcAssociationHealth,
  fetchAssociationHealthAmountTableAuth,
  upsertRefTableRow,
  formatValue,
  importLegalMasterCsv,
  previewNtaImport,
  seedLegalMaster,
  updateLegalMasterEntry,
  validateLegalMasterCsv,
  type ImportMode,
  type LegalMasterEntry,
  type LegalMasterWriteBody,
  type NtaImportTemplate,
  type NtaPreviewResponse,
  type WithholdingTable,
  type CorporateTaxTable,
  type RefTableSummary,
  type RefTable,
} from "@/lib/legal-master-api";

type Tab = "view" | "list" | "csv" | "nta";
type ValueType = "rate" | "amount" | "text";

const BRACKET_GROUP_ID = "__income_tax_bracket__";
const CONSUMPTION_GROUP_ID = "__consumption_tax__";
const WITHHOLDING_GROUP_ID = "__withholding_monthly__";
const CORPORATE_TAX_GROUP_ID = "__corporate_tax_rate__";
const REF_TABLE_PREFIX = "__ref_table__";
const CONSUMPTION_STANDARD_KEY = "consumption_tax.standard_rate";
const CONSUMPTION_REDUCED_KEY = "consumption_tax.reduced_rate";
// 地方消費税は消費税額の 22/78。総額に対する国税/地方の比率は 0.78 / 0.22。
const NATIONAL_RATIO = 0.78;
const LOCAL_RATIO = 0.22;

type ViewGroup = {
  id: string;
  label: string;
  domain: string;
  isBracket: boolean;
  entries: LegalMasterEntry[];
};

function byValidFromDesc(a: LegalMasterEntry, b: LegalMasterEntry): number {
  return (b.valid_from || "").localeCompare(a.valid_from || "");
}

function buildViewGroups(entries: LegalMasterEntry[]): ViewGroup[] {
  const groups: ViewGroup[] = [];
  const bracket = entries.filter((e) => e.domain === "income_tax_bracket");
  if (bracket.length > 0) {
    groups.push({
      id: BRACKET_GROUP_ID,
      label: "所得税の速算表",
      domain: "income_tax_bracket",
      isBracket: true,
      entries: bracket,
    });
  }
  const consumption = entries.filter((e) => e.domain === "consumption_tax");
  if (consumption.length > 0) {
    groups.push({
      id: CONSUMPTION_GROUP_ID,
      label: "消費税率",
      domain: "consumption_tax",
      isBracket: false,
      entries: consumption,
    });
  }
  const byKey = new Map<string, LegalMasterEntry[]>();
  for (const e of entries) {
    if (e.domain === "income_tax_bracket" || e.domain === "consumption_tax") continue;
    const list = byKey.get(e.master_key) ?? [];
    list.push(e);
    byKey.set(e.master_key, list);
  }
  for (const [key, list] of byKey) {
    const sorted = [...list].sort(byValidFromDesc);
    groups.push({
      id: key,
      label: sorted[0]?.label_ja || key,
      domain: sorted[0]?.domain || "",
      isBracket: false,
      entries: sorted,
    });
  }
  return groups;
}

function attrNum(e: LegalMasterEntry, key: string): number | null {
  const attrs = (e.attributes || {}) as Record<string, unknown>;
  const v = attrs[key];
  return typeof v === "number" ? v : null;
}

function ratePct(value: number | null | undefined): string {
  if (value == null) return "—";
  const pct = value * 100;
  return `${Number.isInteger(pct) ? pct : Number(pct.toFixed(1))}%`;
}

// 端数を最大2桁まで表示（末尾ゼロは省く）。6.24% / 1.76% などに対応。
function pctFlex(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${Number((value * 100).toFixed(2))}%`;
}

function yen(n: number | null | undefined): string {
  return n == null ? "—" : `${n.toLocaleString("ja-JP")}円`;
}

// 課税所得は 1,000 円単位で切り捨てるため「から / まで」の境界を復元する。
function bracketRangeLabel(min: number | null, max: number | null): string {
  const from = min == null || min === 0 ? 1000 : min;
  if (max == null) return `${from.toLocaleString("ja-JP")}円 以上`;
  const to = max - 1000;
  return `${from.toLocaleString("ja-JP")}円 から ${to.toLocaleString("ja-JP")}円まで`;
}

function isEffectiveOn(validFrom: string, validTo: string | null, on: string): boolean {
  if (validFrom && validFrom > on) return false;
  if (validTo && validTo < on) return false;
  return true;
}

// その日に有効な版（valid_from <= on <= valid_to）。無ければ最新版を返す。
function currentEffective(
  entries: LegalMasterEntry[],
  on: string,
): LegalMasterEntry | null {
  const sorted = [...entries].sort(byValidFromDesc);
  return sorted.find((e) => isEffectiveOn(e.valid_from, e.valid_to, on)) || sorted[0] || null;
}

const DOMAIN_OPTIONS: { value: string; label: string }[] = [
  { value: "consumption_tax", label: "消費税" },
  { value: "deduction_amount", label: "控除額" },
  { value: "income_tax_bracket", label: "所得税累進" },
  { value: "income_tax_surcharge", label: "所得税加算" },
];

type FormState = {
  domain: string;
  master_key: string;
  label_ja: string;
  valueType: ValueType;
  valueInput: string;
  valid_from: string;
  valid_to: string;
  source_law: string;
  jurisdiction: string;
  master_version_id: string;
  attributesJson: string;
};

const EMPTY_FORM: FormState = {
  domain: "consumption_tax",
  master_key: "",
  label_ja: "",
  valueType: "rate",
  valueInput: "",
  valid_from: "",
  valid_to: "",
  source_law: "",
  jurisdiction: "",
  master_version_id: "",
  attributesJson: "",
};

function entryToForm(e: LegalMasterEntry): FormState {
  let valueType: ValueType = "text";
  let valueInput = e.value_text ?? "";
  if (e.value_numeric != null) {
    if (e.value_numeric > 0 && e.value_numeric < 1) {
      valueType = "rate";
      valueInput = String(Math.round(e.value_numeric * 1000) / 10);
    } else {
      valueType = "amount";
      valueInput = String(e.value_numeric);
    }
  }
  return {
    domain: e.domain,
    master_key: e.master_key,
    label_ja: e.label_ja,
    valueType,
    valueInput,
    valid_from: e.valid_from || "",
    valid_to: e.valid_to || "",
    source_law: e.source_law || "",
    jurisdiction: e.jurisdiction || "",
    master_version_id: e.master_version_id || "",
    attributesJson:
      e.attributes && typeof e.attributes === "object"
        ? JSON.stringify(e.attributes, null, 0)
        : "",
  };
}

function formToBody(form: FormState): LegalMasterWriteBody {
  const body: LegalMasterWriteBody = {
    domain: form.domain.trim(),
    master_key: form.master_key.trim(),
    label_ja: form.label_ja.trim(),
    valid_from: form.valid_from.trim(),
    valid_to: form.valid_to.trim() || null,
    source_law: form.source_law.trim() || null,
    jurisdiction: form.jurisdiction.trim() || null,
    master_version_id: form.master_version_id.trim() || null,
    value_numeric: null,
    value_text: null,
    attributes: null,
  };
  const raw = form.valueInput.trim();
  if (form.valueType === "rate") {
    const pct = Number(raw);
    body.value_numeric = Number.isFinite(pct) ? Math.round((pct / 100) * 1e6) / 1e6 : null;
  } else if (form.valueType === "amount") {
    const num = Number(raw.replace(/,/g, ""));
    body.value_numeric = Number.isFinite(num) ? num : null;
  } else {
    body.value_text = raw || null;
  }
  if (form.attributesJson.trim()) {
    body.attributes = JSON.parse(form.attributesJson) as Record<string, unknown>;
  }
  return body;
}

export function LegalMasterPanel() {
  const [tab, setTab] = useState<Tab>("view");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<LegalMasterEntry[]>([]);
  const [meta, setMeta] = useState<{ entry_count: number; db_path: string } | null>(null);
  const [domainFilter, setDomainFilter] = useState("");
  const [asOf, setAsOf] = useState("2025-06-01");
  const [previewKey, setPreviewKey] = useState("consumption_tax.standard_rate");
  const [previewResult, setPreviewResult] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [withholding, setWithholding] = useState<WithholdingTable | null>(null);
  const [corporateTax, setCorporateTax] = useState<CorporateTaxTable | null>(null);
  const [refTableList, setRefTableList] = useState<RefTableSummary[]>([]);
  const [refTableDetails, setRefTableDetails] = useState<Record<string, RefTable>>({});

  const [csvText, setCsvText] = useState("");
  const [csvBusy, setCsvBusy] = useState(false);
  const [validateResult, setValidateResult] = useState<{
    valid: boolean;
    errors: string[];
    row_count: number;
  } | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>("merge");

  // フォーム式 CRUD
  const [editing, setEditing] = useState<{ id: string | null; form: FormState } | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // 国税庁取込
  const [ntaTemplate] = useState<NtaImportTemplate>("income_tax_speed_table");
  const [ntaUrl, setNtaUrl] = useState("");
  const [ntaText, setNtaText] = useState("");
  const [ntaValidFrom, setNtaValidFrom] = useState("2025-01-01");
  const [ntaSourceLaw, setNtaSourceLaw] = useState("所得税法");
  const [ntaBusy, setNtaBusy] = useState(false);
  const [ntaPreview, setNtaPreview] = useState<NtaPreviewResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchLegalMasterEntries({
        domain: domainFilter || undefined,
        asOf: asOf || undefined,
      });
      setEntries(res.entries);
      setMeta({ entry_count: res.entry_count, db_path: res.db_path });
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [domainFilter, asOf]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    fetchWithholdingMonthly()
      .then((res) => setWithholding(res.table))
      .catch(() => setWithholding(null));
    fetchCorporateTaxRate()
      .then((table) => setCorporateTax(table))
      .catch(() => setCorporateTax(null));
    fetchRefTables()
      .then(setRefTableList)
      .catch(() => setRefTableList([]));
  }, []);

  const selectedRefTableId = selectedGroupId?.startsWith(REF_TABLE_PREFIX)
    ? selectedGroupId.slice(REF_TABLE_PREFIX.length)
    : null;

  useEffect(() => {
    if (!selectedRefTableId || refTableDetails[selectedRefTableId]) return;
    fetchRefTable(selectedRefTableId)
      .then((table) => {
        if (table) setRefTableDetails((prev) => ({ ...prev, [selectedRefTableId]: table }));
      })
      .catch(() => undefined);
  }, [selectedRefTableId, refTableDetails]);

  const groups = useMemo(() => {
    const base = buildViewGroups(entries);
    if (corporateTax) {
      base.push({
        id: CORPORATE_TAX_GROUP_ID,
        label: "法人税の税率",
        domain: "corporate_tax",
        isBracket: false,
        entries: [],
      });
    }
    if (withholding) {
      base.push({
        id: WITHHOLDING_GROUP_ID,
        label: "源泉徴収税額表（月額表）",
        domain: "withholding_tax",
        isBracket: false,
        entries: [],
      });
    }
    for (const rt of refTableList) {
      base.push({
        id: `${REF_TABLE_PREFIX}${rt.id}`,
        label: rt.label_ja,
        domain: "ref_table",
        isBracket: false,
        entries: [],
      });
    }
    return base;
  }, [entries, withholding, corporateTax, refTableList]);

  useEffect(() => {
    if (groups.length === 0) {
      setSelectedGroupId(null);
      return;
    }
    setSelectedGroupId((prev) =>
      prev && groups.some((g) => g.id === prev) ? prev : groups[0].id,
    );
  }, [groups]);

  const selectedGroup = groups.find((g) => g.id === selectedGroupId) || null;

  const onExport = async () => {
    setCsvBusy(true);
    setError(null);
    try {
      const res = await exportLegalMasterCsv(domainFilter || undefined);
      setCsvText(res.csv_text);
      setTab("csv");
    } catch (e) {
      setError(e instanceof Error ? e.message : "エクスポートに失敗しました");
    } finally {
      setCsvBusy(false);
    }
  };

  const onSeed = async () => {
    setCsvBusy(true);
    setError(null);
    try {
      await seedLegalMaster();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "シードに失敗しました");
    } finally {
      setCsvBusy(false);
    }
  };

  const onValidateCsv = async () => {
    setCsvBusy(true);
    setError(null);
    try {
      const res = await validateLegalMasterCsv(csvText);
      setValidateResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "検証に失敗しました");
    } finally {
      setCsvBusy(false);
    }
  };

  const onImportCsv = async () => {
    if (!window.confirm(importMode === "replace" ? "全件置換しますか？" : "マージしますか？")) return;
    setCsvBusy(true);
    setError(null);
    try {
      await importLegalMasterCsv(csvText, importMode);
      setValidateResult(null);
      await load();
      setTab("list");
    } catch (e) {
      setError(e instanceof Error ? e.message : "インポートに失敗しました");
    } finally {
      setCsvBusy(false);
    }
  };

  const onPreview = () => {
    const match = entries.find((e) => e.master_key === previewKey);
    if (!match) {
      setPreviewResult(`as_of=${asOf}: 該当キーなし（フィルタ後一覧に無い場合があります）`);
      return;
    }
    setPreviewResult(
      `${match.label_ja}: ${formatValue(match)}（${match.valid_from} 〜 ${match.valid_to || "現行"}）`,
    );
  };

  const openCreate = () => {
    setSaveError(null);
    setEditing({
      id: null,
      form: { ...EMPTY_FORM, domain: domainFilter || EMPTY_FORM.domain },
    });
  };

  const openEdit = (e: LegalMasterEntry) => {
    setSaveError(null);
    setEditing({ id: e.id, form: entryToForm(e) });
  };

  const onSaveEntry = async () => {
    if (!editing) return;
    setSaveBusy(true);
    setSaveError(null);
    try {
      const body = formToBody(editing.form);
      if (!body.domain || !body.master_key || !body.label_ja || !body.valid_from) {
        throw new Error("ドメイン・master_key・名称・適用開始日 は必須です");
      }
      if (editing.id) {
        await updateLegalMasterEntry(editing.id, body);
      } else {
        await createLegalMasterEntry(body);
      }
      setEditing(null);
      await load();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaveBusy(false);
    }
  };

  const onDeleteEntry = async (e: LegalMasterEntry) => {
    if (!window.confirm(`「${e.label_ja}」(${e.valid_from}〜) を削除しますか？`)) return;
    setError(null);
    try {
      await deleteLegalMasterEntry(e.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
    }
  };

  // 過去/新しい版を「一元管理」する操作。
  const openAddVersion = (group: ViewGroup, seed?: LegalMasterEntry) => {
    setSaveError(null);
    const latest = seed ?? [...group.entries].sort(byValidFromDesc)[0];
    const base = latest ? entryToForm(latest) : { ...EMPTY_FORM, domain: group.domain };
    setEditing({
      id: null,
      form: { ...base, valid_from: "", valid_to: "", master_version_id: "" },
    });
  };

  const openAddBracketVersion = () => {
    setNtaPreview(null);
    setNtaUrl("");
    setNtaText("");
    setTab("nta");
  };

  const onDeleteBracketPeriod = async (group: ViewGroup, period: string) => {
    const rows = group.entries.filter((e) => e.valid_from === period);
    if (!window.confirm(`${period} 適用の速算表（${rows.length}件）を削除しますか？`)) return;
    setError(null);
    try {
      for (const r of rows) {
        await deleteLegalMasterEntry(r.id);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
    }
  };

  const today = new Date().toISOString().slice(0, 10);

  const onNtaPreview = async () => {
    setNtaBusy(true);
    setError(null);
    setNtaPreview(null);
    try {
      const res = await previewNtaImport({
        template: ntaTemplate,
        url: ntaUrl.trim() || undefined,
        text: ntaText.trim() || undefined,
        valid_from: ntaValidFrom,
        source_law: ntaSourceLaw.trim() || undefined,
      });
      setNtaPreview(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "取り込みプレビューに失敗しました");
    } finally {
      setNtaBusy(false);
    }
  };

  const onNtaImport = async () => {
    if (!ntaPreview) return;
    if (!window.confirm(`${ntaPreview.entries.length} 件をマスタへ取り込みます。よろしいですか？`)) return;
    setNtaBusy(true);
    setError(null);
    try {
      await importLegalMasterCsv(ntaPreview.csv_text, "merge");
      setNtaPreview(null);
      await load();
      setTab("list");
    } catch (e) {
      setError(e instanceof Error ? e.message : "取り込みに失敗しました");
    } finally {
      setNtaBusy(false);
    }
  };

  const rateOrAmountHint = useMemo(() => {
    if (!editing) return "";
    if (editing.form.valueType === "rate") return "例: 10 → 10%（0.1 で保存）";
    if (editing.form.valueType === "amount") return "例: 480000（円などの数値）";
    return "文字列の値";
  }, [editing]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-slate-400">
            法定基準値の履歴マスタ（valid_from / valid_to）。税率・控除額・所得税速算表などを登録し、判定・計算の基準にします。
          </p>
          {meta ? (
            <p className="mt-1 font-mono text-[10px] text-slate-500">
              {meta.entry_count} entries · {meta.db_path}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-500"
          >
            <Plus className="h-3.5 w-3.5" />
            追加
          </button>
          <button
            type="button"
            onClick={() => void onSeed()}
            disabled={csvBusy}
            className="inline-flex items-center gap-1 rounded-lg border border-emerald-700/50 px-3 py-1.5 text-xs font-bold text-emerald-200 hover:bg-emerald-950/40 disabled:opacity-50"
          >
            <Sprout className="h-3.5 w-3.5" />
            シード
          </button>
          <button
            type="button"
            onClick={() => void onExport()}
            disabled={csvBusy}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1 rounded-lg border border-amber-600/40 bg-amber-950/40 px-3 py-1.5 text-xs font-bold text-amber-200 hover:bg-amber-950/70"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            再読込
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-700 bg-slate-900/60 p-3">
        <label className="text-[10px] text-slate-500">
          as_of（一覧フィルタ）
          <input
            type="date"
            className="mt-1 block rounded border border-slate-600 bg-slate-950 px-2 py-1 text-xs text-slate-200"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
          />
        </label>
        <label className="text-[10px] text-slate-500">
          domain
          <select
            className="mt-1 block rounded border border-slate-600 bg-slate-950 px-2 py-1 text-xs text-slate-200"
            value={domainFilter}
            onChange={(e) => setDomainFilter(e.target.value)}
          >
            <option value="">すべて</option>
            {DOMAIN_OPTIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-1 flex-wrap items-end gap-2">
          <label className="min-w-[12rem] flex-1 text-[10px] text-slate-500">
            プレビュー master_key
            <input
              className="mt-1 w-full rounded border border-slate-600 bg-slate-950 px-2 py-1 font-mono text-xs text-slate-200"
              value={previewKey}
              onChange={(e) => setPreviewKey(e.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={onPreview}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-600"
          >
            <Search className="h-3.5 w-3.5" />
            一覧から確認
          </button>
        </div>
      </div>
      {previewResult ? (
        <p className="rounded-lg border border-blue-800/40 bg-blue-950/30 px-3 py-2 text-xs text-blue-200">
          {previewResult}
        </p>
      ) : null}

      <div className="flex gap-1 rounded-lg border border-slate-700 bg-slate-900/60 p-1">
        <TabBtn active={tab === "view"} onClick={() => setTab("view")}>
          <Table2 className="mr-1 inline h-3 w-3" />
          表で見る
        </TabBtn>
        <TabBtn active={tab === "list"} onClick={() => setTab("list")}>
          一覧・編集
        </TabBtn>
        <TabBtn active={tab === "nta"} onClick={() => setTab("nta")}>
          <Globe className="mr-1 inline h-3 w-3" />
          国税庁取込
        </TabBtn>
        <TabBtn active={tab === "csv"} onClick={() => setTab("csv")}>
          <FileSpreadsheet className="mr-1 inline h-3 w-3" />
          CSV
        </TabBtn>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-800/50 bg-red-950/30 px-4 py-3 text-xs text-red-200">
          {error}
        </div>
      ) : null}

      {tab === "view" ? (
        loading ? (
          <div className="flex justify-center py-12 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : groups.length === 0 ? (
          <div className="rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-8 text-center text-xs text-slate-500">
            登録されている基準値がありません。「一覧・編集」の追加、または「国税庁取込」から登録してください。
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-[minmax(12rem,16rem)_1fr]">
            <aside className="max-h-[calc(100vh-16rem)] space-y-1 self-start overflow-y-auto rounded-xl border border-slate-700 bg-slate-900/60 p-2 md:sticky md:top-4">
              {groups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setSelectedGroupId(g.id)}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs font-bold transition ${
                    g.id === selectedGroupId
                      ? "bg-amber-600 text-white"
                      : "text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  <span className="truncate">{g.label}</span>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-black ${
                      g.id === selectedGroupId ? "bg-amber-800/60 text-amber-100" : "bg-slate-800 text-slate-500"
                    }`}
                  >
                    {domainLabel(g.domain)}
                  </span>
                </button>
              ))}
            </aside>
            <div className="min-w-0">
              {selectedGroup?.id === WITHHOLDING_GROUP_ID && withholding ? (
                <WithholdingMonthlyDetail table={withholding} />
              ) : selectedGroup?.id === CORPORATE_TAX_GROUP_ID && corporateTax ? (
                <CorporateTaxRateDetail table={corporateTax} />
              ) : selectedRefTableId && refTableDetails[selectedRefTableId] ? (
                <RefTableDetail
                  table={refTableDetails[selectedRefTableId]}
                  asOf={asOf}
                  onTableUpdated={(t) =>
                    setRefTableDetails((prev) => ({ ...prev, [selectedRefTableId]: t }))
                  }
                />
              ) : selectedRefTableId ? (
                <div className="flex justify-center py-12 text-slate-400">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : selectedGroup ? (
                <GroupDetail
                  group={selectedGroup}
                  today={today}
                  onEdit={openEdit}
                  onDelete={(e) => void onDeleteEntry(e)}
                  onAddVersion={openAddVersion}
                  onAddBracketVersion={openAddBracketVersion}
                  onDeleteBracketPeriod={(g, p) => void onDeleteBracketPeriod(g, p)}
                />
              ) : null}
            </div>
          </div>
        )
      ) : null}

      {tab === "list" ? (
        loading ? (
          <div className="flex justify-center py-12 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-900/80">
            <table className="min-w-full border-collapse text-left text-[11px] text-slate-300">
              <thead className="bg-slate-800/80 text-[10px] font-black uppercase text-slate-500">
                <tr>
                  <th className="border-b border-slate-700 px-3 py-2">ドメイン</th>
                  <th className="border-b border-slate-700 px-3 py-2">名称</th>
                  <th className="border-b border-slate-700 px-3 py-2">master_key</th>
                  <th className="border-b border-slate-700 px-3 py-2">値</th>
                  <th className="border-b border-slate-700 px-3 py-2">valid_from</th>
                  <th className="border-b border-slate-700 px-3 py-2">valid_to</th>
                  <th className="border-b border-slate-700 px-3 py-2">根拠</th>
                  <th className="border-b border-slate-700 px-3 py-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-800/40">
                    <td className="border-b border-slate-800 px-3 py-2">{domainLabel(e.domain)}</td>
                    <td className="border-b border-slate-800 px-3 py-2 font-bold text-white">
                      {e.label_ja}
                    </td>
                    <td className="border-b border-slate-800 px-3 py-2 font-mono text-[10px] text-slate-400">
                      {e.master_key}
                    </td>
                    <td className="border-b border-slate-800 px-3 py-2">{formatValue(e)}</td>
                    <td className="border-b border-slate-800 px-3 py-2">{e.valid_from}</td>
                    <td className="border-b border-slate-800 px-3 py-2">{e.valid_to || "—"}</td>
                    <td className="border-b border-slate-800 px-3 py-2 text-slate-500">
                      {e.source_law || "—"}
                    </td>
                    <td className="border-b border-slate-800 px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(e)}
                          className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-white"
                          title="編集"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void onDeleteEntry(e)}
                          className="rounded p-1 text-red-400 hover:bg-red-950/50 hover:text-red-200"
                          title="削除"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {entries.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                      該当するエントリがありません。「追加」または「国税庁取込」から登録できます。
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      {tab === "nta" ? (
        <div className="space-y-3 rounded-xl border border-slate-700 bg-slate-900/80 p-4">
          <p className="text-xs text-slate-400">
            国税庁サイト（例:{" "}
            <a
              href="https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2260.htm"
              target="_blank"
              rel="noreferrer"
              className="text-blue-300 underline"
            >
              No.2260 所得税の速算表
            </a>
            ）の URL を貼り付けるか、表をコピーして下に貼り付けてください。内容を確認してから取り込みます。
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-[10px] text-slate-500">
              テンプレート
              <select
                className="mt-1 block rounded border border-slate-600 bg-slate-950 px-2 py-1 text-xs text-slate-200"
                value={ntaTemplate}
                disabled
              >
                <option value="income_tax_speed_table">所得税の速算表</option>
              </select>
            </label>
            <label className="text-[10px] text-slate-500">
              適用開始日
              <input
                type="date"
                className="mt-1 block rounded border border-slate-600 bg-slate-950 px-2 py-1 text-xs text-slate-200"
                value={ntaValidFrom}
                onChange={(e) => setNtaValidFrom(e.target.value)}
              />
            </label>
            <label className="flex-1 text-[10px] text-slate-500">
              根拠法令
              <input
                className="mt-1 block w-full rounded border border-slate-600 bg-slate-950 px-2 py-1 text-xs text-slate-200"
                value={ntaSourceLaw}
                onChange={(e) => setNtaSourceLaw(e.target.value)}
              />
            </label>
          </div>
          <label className="block text-[10px] text-slate-500">
            国税庁URL（nta.go.jp のみ）
            <input
              className="mt-1 block w-full rounded border border-slate-600 bg-slate-950 px-2 py-1 font-mono text-[11px] text-slate-200"
              placeholder="https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2260.htm"
              value={ntaUrl}
              onChange={(e) => setNtaUrl(e.target.value)}
            />
          </label>
          <label className="block text-[10px] text-slate-500">
            または 表を貼り付け（列は Tab / 全角スペース区切り）
            <textarea
              className="mt-1 min-h-[140px] w-full rounded-lg border border-slate-600 bg-slate-950 p-3 font-mono text-[10px] text-slate-200 focus:border-amber-500 focus:outline-none"
              value={ntaText}
              onChange={(e) => setNtaText(e.target.value)}
              placeholder={"1,000円 から 1,949,000円まで\t5％\t0円\n1,950,000円 から 3,299,000円まで\t10％\t97,500円"}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={ntaBusy || (!ntaUrl.trim() && !ntaText.trim())}
              onClick={() => void onNtaPreview()}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
            >
              {ntaBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              プレビュー
            </button>
            {ntaPreview ? (
              <button
                type="button"
                disabled={ntaBusy}
                onClick={() => void onNtaImport()}
                className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-500 disabled:opacity-50"
              >
                この内容で取り込む（{ntaPreview.entries.length}件）
              </button>
            ) : null}
          </div>

          {ntaPreview ? (
            <div className="space-y-2">
              {ntaPreview.warnings.length > 0 ? (
                <ul className="list-inside list-disc rounded-lg border border-amber-800/40 bg-amber-950/20 px-3 py-2 text-[11px] text-amber-200">
                  {ntaPreview.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              ) : null}
              <div className="overflow-x-auto rounded-lg border border-slate-700">
                <table className="min-w-full border-collapse text-left text-[11px] text-slate-300">
                  <thead className="bg-slate-800/80 text-[10px] font-black uppercase text-slate-500">
                    <tr>
                      <th className="border-b border-slate-700 px-3 py-2">名称</th>
                      <th className="border-b border-slate-700 px-3 py-2">税率</th>
                      <th className="border-b border-slate-700 px-3 py-2">下限</th>
                      <th className="border-b border-slate-700 px-3 py-2">上限</th>
                      <th className="border-b border-slate-700 px-3 py-2">控除額</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ntaPreview.entries.map((e) => {
                      const attrs = (e.attributes || {}) as Record<string, unknown>;
                      const rate = e.value_numeric != null ? `${(e.value_numeric * 100).toFixed(1)}%` : "—";
                      const bmin = attrs.bracket_min as number | null | undefined;
                      const bmax = attrs.bracket_max as number | null | undefined;
                      const ded = attrs.base_deduction as number | null | undefined;
                      return (
                        <tr key={e.master_key}>
                          <td className="border-b border-slate-800 px-3 py-2 font-bold text-white">
                            {e.label_ja}
                          </td>
                          <td className="border-b border-slate-800 px-3 py-2">{rate}</td>
                          <td className="border-b border-slate-800 px-3 py-2">
                            {bmin != null ? bmin.toLocaleString("ja-JP") : "—"}
                          </td>
                          <td className="border-b border-slate-800 px-3 py-2">
                            {bmax != null ? bmax.toLocaleString("ja-JP") : "上限なし"}
                          </td>
                          <td className="border-b border-slate-800 px-3 py-2">
                            {ded != null ? ded.toLocaleString("ja-JP") : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-slate-500">
                取り込みは master_version_id で重複排除（マージ）されます。内容を確認して問題なければ取り込んでください。
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "csv" ? (
        <div className="space-y-3 rounded-xl border border-slate-700 bg-slate-900/80 p-4">
          <textarea
            className="min-h-[280px] w-full rounded-lg border border-slate-600 bg-slate-950 p-3 font-mono text-[10px] text-slate-200 focus:border-amber-500 focus:outline-none"
            value={csvText}
            onChange={(e) => {
              setCsvText(e.target.value);
              setValidateResult(null);
            }}
            placeholder="domain,master_key,label_ja,..."
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={csvBusy || !csvText.trim()}
              onClick={() => void onValidateCsv()}
              className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
            >
              検証
            </button>
            <select
              className="rounded-lg border border-slate-600 bg-slate-950 px-2 py-1.5 text-xs text-slate-200"
              value={importMode}
              onChange={(e) => setImportMode(e.target.value as ImportMode)}
            >
              <option value="merge">マージ</option>
              <option value="replace">置換</option>
            </select>
            <button
              type="button"
              disabled={csvBusy || !csvText.trim()}
              onClick={() => void onImportCsv()}
              className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-500 disabled:opacity-50"
            >
              インポート
            </button>
          </div>
          {validateResult ? (
            <div
              className={`rounded-lg border px-3 py-2 text-xs ${
                validateResult.valid
                  ? "border-emerald-800/50 text-emerald-200"
                  : "border-red-800/50 text-red-200"
              }`}
            >
              {validateResult.valid ? (
                <p>OK — {validateResult.row_count} rows</p>
              ) : (
                <ul className="list-inside list-disc">
                  {validateResult.errors.map((msg) => (
                    <li key={msg}>{msg}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {editing ? (
        <EntryFormModal
          editing={editing}
          setEditing={setEditing}
          onSave={() => void onSaveEntry()}
          busy={saveBusy}
          error={saveError}
          hint={rateOrAmountHint}
        />
      ) : null}
    </div>
  );
}

function EntryFormModal({
  editing,
  setEditing,
  onSave,
  busy,
  error,
  hint,
}: {
  editing: { id: string | null; form: FormState };
  setEditing: (v: { id: string | null; form: FormState } | null) => void;
  onSave: () => void;
  busy: boolean;
  error: string | null;
  hint: string;
}) {
  const { id, form } = editing;
  const update = (patch: Partial<FormState>) => setEditing({ id, form: { ...form, ...patch } });
  const isBracket = form.domain === "income_tax_bracket";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-black text-white">{id ? "基準値を編集" : "基準値を追加"}</h3>
          <button
            type="button"
            onClick={() => setEditing(null)}
            className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-[10px] text-slate-500">
              ドメイン
              <select
                className="mt-1 block w-full rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-xs text-slate-200"
                value={form.domain}
                onChange={(e) => update({ domain: e.target.value })}
              >
                {DOMAIN_OPTIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[10px] text-slate-500">
              値の種類
              <select
                className="mt-1 block w-full rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-xs text-slate-200"
                value={form.valueType}
                onChange={(e) => update({ valueType: e.target.value as ValueType })}
              >
                <option value="rate">率（%）</option>
                <option value="amount">金額・数値</option>
                <option value="text">テキスト</option>
              </select>
            </label>
          </div>

          <label className="block text-[10px] text-slate-500">
            名称
            <input
              className="mt-1 block w-full rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-xs text-slate-200"
              value={form.label_ja}
              onChange={(e) => update({ label_ja: e.target.value })}
              placeholder="例: 消費税標準税率"
            />
          </label>

          <label className="block text-[10px] text-slate-500">
            master_key（プログラムから参照するキー）
            <input
              className="mt-1 block w-full rounded border border-slate-600 bg-slate-950 px-2 py-1.5 font-mono text-[11px] text-slate-200"
              value={form.master_key}
              onChange={(e) => update({ master_key: e.target.value })}
              placeholder="例: consumption_tax.standard_rate"
            />
          </label>

          <label className="block text-[10px] text-slate-500">
            値
            <input
              className="mt-1 block w-full rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-xs text-slate-200"
              value={form.valueInput}
              onChange={(e) => update({ valueInput: e.target.value })}
            />
            <span className="mt-1 block text-[10px] text-slate-600">{hint}</span>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-[10px] text-slate-500">
              適用開始日
              <input
                type="date"
                className="mt-1 block w-full rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-xs text-slate-200"
                value={form.valid_from}
                onChange={(e) => update({ valid_from: e.target.value })}
              />
            </label>
            <label className="text-[10px] text-slate-500">
              適用終了日（任意）
              <input
                type="date"
                className="mt-1 block w-full rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-xs text-slate-200"
                value={form.valid_to}
                onChange={(e) => update({ valid_to: e.target.value })}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-[10px] text-slate-500">
              根拠法令（任意）
              <input
                className="mt-1 block w-full rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-xs text-slate-200"
                value={form.source_law}
                onChange={(e) => update({ source_law: e.target.value })}
              />
            </label>
            <label className="text-[10px] text-slate-500">
              管轄（任意）
              <input
                className="mt-1 block w-full rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-xs text-slate-200"
                value={form.jurisdiction}
                onChange={(e) => update({ jurisdiction: e.target.value })}
              />
            </label>
          </div>

          <label className="block text-[10px] text-slate-500">
            バージョンID（任意・空欄で自動採番）
            <input
              className="mt-1 block w-full rounded border border-slate-600 bg-slate-950 px-2 py-1.5 font-mono text-[11px] text-slate-200"
              value={form.master_version_id}
              onChange={(e) => update({ master_version_id: e.target.value })}
            />
          </label>

          <label className="block text-[10px] text-slate-500">
            属性 JSON（任意{isBracket ? " · 累進区分は bracket_min/bracket_max/base_deduction" : ""}）
            <textarea
              className="mt-1 block min-h-[64px] w-full rounded border border-slate-600 bg-slate-950 px-2 py-1.5 font-mono text-[10px] text-slate-200"
              value={form.attributesJson}
              onChange={(e) => update({ attributesJson: e.target.value })}
              placeholder={isBracket ? '{"bracket_min":0,"bracket_max":1950000,"base_deduction":0}' : ""}
            />
          </label>

          {error ? (
            <p className="rounded border border-red-800/50 bg-red-950/30 px-3 py-2 text-red-200">{error}</p>
          ) : null}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setEditing(null)}
            className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-800"
          >
            キャンセル
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onSave}
            className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-amber-500 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

type GroupDetailProps = {
  group: ViewGroup;
  today: string;
  onEdit: (e: LegalMasterEntry) => void;
  onDelete: (e: LegalMasterEntry) => void;
  onAddVersion: (g: ViewGroup, seed?: LegalMasterEntry) => void;
  onAddBracketVersion: () => void;
  onDeleteBracketPeriod: (g: ViewGroup, period: string) => void;
};

function GroupDetail(props: GroupDetailProps) {
  if (props.group.isBracket) return <BracketGroupDetail {...props} />;
  if (props.group.id === CONSUMPTION_GROUP_ID) return <ConsumptionTaxMatrix {...props} />;
  return <ScalarGroupDetail {...props} />;
}

function ConsumptionTaxMatrix({ group, today, onEdit, onAddVersion }: GroupDetailProps) {
  const periods = useMemo(
    () =>
      Array.from(new Set(group.entries.map((e) => e.valid_from))).sort((a, b) =>
        (b || "").localeCompare(a || ""),
      ),
    [group.entries],
  );
  const standardAll = group.entries.filter((e) => e.master_key === CONSUMPTION_STANDARD_KEY);
  const reducedAll = group.entries.filter((e) => e.master_key === CONSUMPTION_REDUCED_KEY);

  const currentStd = currentEffective(standardAll, today);
  const currentPeriod = currentStd?.valid_from ?? periods[0];
  const [selected, setSelected] = useState(currentPeriod);
  const period = periods.includes(selected) ? selected : currentPeriod;
  // 選択した版の適用開始日を基準に、各列の有効値を解決する。
  const asOf = period || today;

  const std = currentEffective(standardAll, asOf);
  const red = currentEffective(reducedAll, asOf);
  const isCurrent = period === currentPeriod;

  const col = (total: number | null | undefined) => {
    if (total == null) return { national: null as number | null, local: null as number | null, total: null as number | null };
    return { national: total * NATIONAL_RATIO, local: total * LOCAL_RATIO, total };
  };
  const s = col(std?.value_numeric);
  const r = col(red?.value_numeric);

  const [netAmount, setNetAmount] = useState(10000);
  const [rateKind, setRateKind] = useState<"standard" | "reduced">("standard");
  const stdCol = rateKind === "standard";
  const redCol = rateKind === "reduced";
  const totalRate = (rateKind === "reduced" ? red?.value_numeric : std?.value_numeric) ?? 0;
  // 総額（税込）から国税・地方に分ける場合も 22/78 で内訳を出す。ここは税抜→税額。
  const taxTotal = Math.floor(Math.max(0, netAmount) * totalRate);
  const taxLocal = Math.floor(taxTotal * (22 / 78));
  const taxNational = taxTotal - taxLocal;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-4">
        <h4 className="mb-3 text-xs font-black text-amber-200">消費税額の計算（税抜金額から）</h4>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-300">
            税抜金額（円）
            <NumInput
              value={netAmount}
              onValueChange={setNetAmount}
              className="w-40 rounded-lg border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-300">
            税率区分
            <select
              value={rateKind}
              onChange={(e) => setRateKind(e.target.value as "standard" | "reduced")}
              className="rounded-lg border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-white"
            >
              <option value="standard">標準税率（{ratePct(std?.value_numeric)}）</option>
              <option value="reduced">軽減税率（{ratePct(red?.value_numeric)}）</option>
            </select>
          </label>
        </div>
        <ResultCard
          metrics={[
            { label: "消費税額", value: yenStr(taxTotal) },
            { label: "税込", value: yenStr(Math.max(0, netAmount) + taxTotal) },
          ]}
          breakdown={
            <>
              内訳: 国税 {yenStr(taxNational)} ＋ 地方 {yenStr(taxLocal)}（消費税額の22/78）
            </>
          }
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-[10px] text-slate-500">
          適用版
          <select
            className="rounded border border-slate-600 bg-slate-950 px-2 py-1 text-xs text-slate-200"
            value={period}
            onChange={(e) => setSelected(e.target.value)}
          >
            {periods.map((p) => (
              <option key={p} value={p}>
                {p} 〜{p === currentPeriod ? "（現在有効）" : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          {std ? (
            <button
              type="button"
              onClick={() => onEdit(std)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-800"
            >
              <Pencil className="h-3.5 w-3.5" />
              標準税率を編集
            </button>
          ) : null}
          {red ? (
            <button
              type="button"
              onClick={() => onEdit(red)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-800"
            >
              <Pencil className="h-3.5 w-3.5" />
              軽減税率を編集
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onAddVersion(group, std ?? standardAll[0])}
            className="inline-flex items-center gap-1 rounded-lg border border-emerald-700/50 px-3 py-1.5 text-xs font-bold text-emerald-200 hover:bg-emerald-950/40"
          >
            <Plus className="h-3.5 w-3.5" />
            新しい版を追加
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-700">
        <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-800/70 px-3 py-2">
          <span className="flex items-center gap-2 text-xs font-black text-white">
            消費税率
            {isCurrent ? (
              <span className="rounded bg-emerald-700/40 px-1.5 py-0.5 text-[9px] font-black text-emerald-200">
                現在有効
              </span>
            ) : (
              <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[9px] font-black text-slate-400">
                過去/予定版
              </span>
            )}
          </span>
          <span className="text-[10px] text-slate-400">適用: {asOf} 〜</span>
        </div>
        <table className="min-w-full border-collapse text-[11px] text-slate-200">
          <thead>
            <tr className="bg-sky-950/50 text-[10px] font-black text-sky-200">
              <th className="border border-slate-700 px-3 py-2 text-left" />
              <th
                className={`border border-slate-700 px-3 py-2 text-center ${
                  stdCol ? "bg-amber-700/40 text-amber-100" : ""
                }`}
              >
                標準税率
              </th>
              <th
                className={`border border-slate-700 px-3 py-2 text-center ${
                  redCol ? "bg-amber-700/40 text-amber-100" : ""
                }`}
              >
                軽減税率
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="odd:bg-slate-900/40 even:bg-slate-900/70">
              <th className="border border-slate-800 bg-slate-800/40 px-3 py-2 text-left font-bold text-slate-300">
                消費税率
              </th>
              <td className={`border border-slate-800 px-3 py-2 text-right font-bold text-white ${stdCol ? "bg-amber-500/15" : ""}`}>
                {pctFlex(s.national)}
              </td>
              <td className={`border border-slate-800 px-3 py-2 text-right font-bold text-white ${redCol ? "bg-amber-500/15" : ""}`}>
                {pctFlex(r.national)}
              </td>
            </tr>
            <tr className="odd:bg-slate-900/40 even:bg-slate-900/70">
              <th className="border border-slate-800 bg-slate-800/40 px-3 py-2 text-left font-bold text-slate-300">
                地方消費税率
              </th>
              <td className={`border border-slate-800 px-3 py-2 text-right text-white ${stdCol ? "bg-amber-500/15" : ""}`}>
                <div>{pctFlex(s.local)}</div>
                {s.local != null ? (
                  <div className="text-[9px] text-slate-500">（消費税額の22/78）</div>
                ) : null}
              </td>
              <td className={`border border-slate-800 px-3 py-2 text-right text-white ${redCol ? "bg-amber-500/15" : ""}`}>
                <div>{pctFlex(r.local)}</div>
                {r.local != null ? (
                  <div className="text-[9px] text-slate-500">（消費税額の22/78）</div>
                ) : null}
              </td>
            </tr>
            <tr className="bg-slate-800/60">
              <th className="border border-slate-800 px-3 py-2 text-left font-black text-white">合計</th>
              <td
                className={`border border-slate-800 px-3 py-2 text-right font-black ${
                  stdCol ? "bg-amber-400/40 text-white ring-1 ring-inset ring-amber-300" : "text-amber-200"
                }`}
              >
                {ratePct(s.total)}
              </td>
              <td
                className={`border border-slate-800 px-3 py-2 text-right font-black ${
                  redCol ? "bg-amber-400/40 text-white ring-1 ring-inset ring-amber-300" : "text-amber-200"
                }`}
              >
                {ratePct(r.total)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-slate-500">
        消費税率（国税）・地方消費税率は合計税率から法定比率（22/78）で算出しています。合計税率のみを版として管理します。
      </p>
    </div>
  );
}

function BracketGroupDetail({
  group,
  today,
  onAddBracketVersion,
  onDeleteBracketPeriod,
}: GroupDetailProps) {
  const periods = useMemo(
    () =>
      Array.from(new Set(group.entries.map((e) => e.valid_from))).sort((a, b) =>
        (b || "").localeCompare(a || ""),
      ),
    [group.entries],
  );
  const current = currentEffective(group.entries, today);
  const currentPeriod = current?.valid_from ?? periods[0];
  const [selected, setSelected] = useState(currentPeriod);
  const period = periods.includes(selected) ? selected : currentPeriod;

  const rows = group.entries
    .filter((e) => e.valid_from === period)
    .sort((a, b) => (attrNum(a, "bracket_min") ?? 0) - (attrNum(b, "bracket_min") ?? 0));
  const validTo = rows[0]?.valid_to;
  const sourceLaw = rows[0]?.source_law;
  const isCurrent = period === currentPeriod;

  const [income, setIncome] = useState(5000000);
  const taxable = Math.floor(Math.max(0, income) / 1000) * 1000;
  const matched = rows.find((e) => {
    const min = attrNum(e, "bracket_min") ?? 0;
    const max = attrNum(e, "bracket_max");
    return taxable >= min && (max == null || taxable < max);
  });
  const rate = matched?.value_numeric ?? 0;
  const baseDed = attrNum(matched ?? ({} as LegalMasterEntry), "base_deduction") ?? 0;
  const incomeTax = matched ? Math.max(0, Math.floor(taxable * rate - baseDed)) : 0;
  // 復興特別所得税（基準所得税額 × 2.1%）を併記。
  const reconTax = Math.floor(incomeTax * 0.021);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-4">
        <h4 className="mb-3 text-xs font-black text-amber-200">所得税額の計算（速算表）</h4>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-300">
            課税される所得金額（円）
            <NumInput
              value={income}
              onValueChange={setIncome}
              className="w-44 rounded-lg border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-white"
            />
          </label>
        </div>
        <ResultCard
          metrics={[
            { label: "所得税額", value: yenStr(incomeTax) },
            {
              label: "復興特別所得税込み",
              value: yenStr(incomeTax + reconTax),
              sub: `復興特別 ${yenStr(reconTax)}`,
            },
          ]}
          breakdown={
            <>
              課税所得 {yenStr(taxable)}（千円未満切捨）× {ratePct(rate)} − {yenStr(baseDed)}
            </>
          }
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-[10px] text-slate-500">
          適用版
          <select
            className="rounded border border-slate-600 bg-slate-950 px-2 py-1 text-xs text-slate-200"
            value={period}
            onChange={(e) => setSelected(e.target.value)}
          >
            {periods.map((p) => (
              <option key={p} value={p}>
                {p} 〜{" "}
                {group.entries.find((e) => e.valid_from === p)?.valid_to || "現行"}
                {p === currentPeriod ? "（現在有効）" : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onAddBracketVersion}
            className="inline-flex items-center gap-1 rounded-lg border border-emerald-700/50 px-3 py-1.5 text-xs font-bold text-emerald-200 hover:bg-emerald-950/40"
          >
            <Plus className="h-3.5 w-3.5" />
            新しい版を追加
          </button>
          <button
            type="button"
            onClick={() => onDeleteBracketPeriod(group, period)}
            className="inline-flex items-center gap-1 rounded-lg border border-red-800/50 px-3 py-1.5 text-xs font-bold text-red-300 hover:bg-red-950/40"
          >
            <Trash2 className="h-3.5 w-3.5" />
            この版を削除
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-700">
        <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-800/70 px-3 py-2">
          <span className="flex items-center gap-2 text-xs font-black text-white">
            所得税の速算表
            {isCurrent ? (
              <span className="rounded bg-emerald-700/40 px-1.5 py-0.5 text-[9px] font-black text-emerald-200">
                現在有効
              </span>
            ) : (
              <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[9px] font-black text-slate-400">
                過去/予定版
              </span>
            )}
          </span>
          <span className="text-[10px] text-slate-400">
            適用: {period} 〜 {validTo || "現行"}
            {sourceLaw ? ` · ${sourceLaw}` : ""}
          </span>
        </div>
        <table className="min-w-full border-collapse text-[11px] text-slate-200">
          <thead>
            <tr className="bg-sky-950/50 text-[10px] font-black text-sky-200">
              <th className="border border-slate-700 px-3 py-2 text-center">課税される所得金額</th>
              <th
                className={`border border-slate-700 px-3 py-2 text-center ${
                  matched ? "bg-amber-700/40 text-amber-100" : ""
                }`}
              >
                税率
              </th>
              <th
                className={`border border-slate-700 px-3 py-2 text-center ${
                  matched ? "bg-amber-700/40 text-amber-100" : ""
                }`}
              >
                控除額
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const hit = matched?.id === e.id;
              const colOn = matched != null;
              return (
                <tr
                  key={e.id}
                  className={
                    hit
                      ? "bg-amber-500/25 font-bold text-amber-100 ring-1 ring-inset ring-amber-400/60"
                      : "odd:bg-slate-900/40 even:bg-slate-900/70"
                  }
                >
                  <td className="border border-slate-800 px-3 py-2 font-bold text-white">
                    {bracketRangeLabel(attrNum(e, "bracket_min"), attrNum(e, "bracket_max"))}
                  </td>
                  <td
                    className={`border border-slate-800 px-3 py-2 text-center ${
                      hit ? "bg-amber-400/40 text-white ring-1 ring-inset ring-amber-300" : colOn ? "bg-amber-500/15" : ""
                    }`}
                  >
                    {ratePct(e.value_numeric)}
                  </td>
                  <td
                    className={`border border-slate-800 px-3 py-2 text-right ${
                      hit ? "bg-amber-400/40 text-white ring-1 ring-inset ring-amber-300" : colOn ? "bg-amber-500/15" : ""
                    }`}
                  >
                    {yen(attrNum(e, "base_deduction"))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const SCALAR_BASE_LABEL: Record<string, string> = {
  "income_tax.reconstruction_surcharge_rate": "基準所得税額（円）",
  "corporate_tax.defense_special_rate": "基準法人税額（円）",
  "resident_tax.income_levy.prefecture": "課税総所得金額（円）",
  "resident_tax.income_levy.municipal": "課税総所得金額（円）",
  "resident_tax.income_levy.designated_city.prefecture": "課税総所得金額（円）",
  "resident_tax.income_levy.designated_city.municipal": "課税総所得金額（円）",
  "resident_tax.income_levy.other_rate": "配当・利子・譲渡所得等（円）",
  "social_insurance.pension.rate": "標準報酬月額（円）",
};

function ScalarGroupDetail({ group, today, onEdit, onDelete, onAddVersion }: GroupDetailProps) {
  const rows = [...group.entries].sort(byValidFromDesc);
  const current = currentEffective(group.entries, today);
  const [showHistory, setShowHistory] = useState(false);
  const pastCount = rows.filter((e) => e.id !== current?.id).length;

  const rateVal = current?.value_numeric ?? null;
  const isRate = rateVal != null && rateVal > 0 && rateVal < 1;
  const [base, setBase] = useState(1000000);
  const calcAmount = isRate ? Math.floor(Math.max(0, base) * (rateVal ?? 0)) : 0;
  const baseLabel = current ? SCALAR_BASE_LABEL[current.master_key] ?? "ベース金額（円）" : "ベース金額（円）";

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-amber-700/40 bg-amber-950/20 p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="flex items-center gap-2 text-sm font-black text-white">
              {group.label}
              <span className="rounded bg-emerald-700/40 px-1.5 py-0.5 text-[9px] font-black text-emerald-200">
                現在有効
              </span>
            </p>
            <p className="mt-1 font-mono text-[10px] text-slate-500">{current?.master_key}</p>
          </div>
          {current ? (
            <button
              type="button"
              onClick={() => onEdit(current)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-800"
            >
              <Pencil className="h-3.5 w-3.5" />
              編集
            </button>
          ) : null}
        </div>
        {current ? (
          <div className="mt-3 flex flex-wrap items-baseline gap-3">
            <span className="text-2xl font-black text-amber-200">{formatValue(current)}</span>
            <span className="text-xs text-slate-400">
              適用: {current.valid_from} 〜 {current.valid_to || "現行"}
              {current.source_law ? ` · ${current.source_law}` : ""}
            </span>
          </div>
        ) : null}
      </div>

      {isRate ? (
        <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-4">
          <h4 className="mb-3 text-xs font-black text-amber-200">金額の計算（{baseLabel.replace("（円）", "")} × 率）</h4>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-300">
              {baseLabel}
              <NumInput
                value={base}
                onValueChange={setBase}
                className="w-44 rounded-lg border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-white"
              />
            </label>
          </div>
          <ResultCard
            metrics={[{ label: "計算結果", value: yenStr(calcAmount) }]}
            breakdown={
              <>
                {yenStr(Math.max(0, base))} × {ratePct(rateVal)}（円未満切捨）
              </>
            }
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          className="inline-flex items-center gap-1 text-xs font-bold text-slate-300 hover:text-white"
        >
          {showHistory ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          過去・全バージョンを{showHistory ? "隠す" : `表示（${rows.length}件`}
          {showHistory ? "" : "）"}
        </button>
        <button
          type="button"
          onClick={() => onAddVersion(group)}
          className="inline-flex items-center gap-1 rounded-lg border border-emerald-700/50 px-3 py-1.5 text-xs font-bold text-emerald-200 hover:bg-emerald-950/40"
        >
          <Plus className="h-3.5 w-3.5" />
          新しい版を追加
        </button>
      </div>

      {showHistory ? (
        <div className="overflow-hidden rounded-xl border border-slate-700">
          <table className="min-w-full border-collapse text-[11px] text-slate-200">
            <thead>
              <tr className="bg-sky-950/50 text-[10px] font-black text-sky-200">
                <th className="border border-slate-700 px-3 py-2 text-center">状態</th>
                <th className="border border-slate-700 px-3 py-2 text-center">適用開始</th>
                <th className="border border-slate-700 px-3 py-2 text-center">適用終了</th>
                <th className="border border-slate-700 px-3 py-2 text-center">値</th>
                <th className="border border-slate-700 px-3 py-2 text-center">根拠法令</th>
                <th className="border border-slate-700 px-3 py-2 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const isCur = e.id === current?.id;
                return (
                  <tr key={e.id} className={isCur ? "bg-emerald-950/30" : "odd:bg-slate-900/40 even:bg-slate-900/70"}>
                    <td className="border border-slate-800 px-3 py-2 text-center">
                      {isCur ? (
                        <span className="rounded bg-emerald-700/40 px-1.5 py-0.5 text-[9px] font-black text-emerald-200">
                          現在
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500">—</span>
                      )}
                    </td>
                    <td className="border border-slate-800 px-3 py-2">{e.valid_from}</td>
                    <td className="border border-slate-800 px-3 py-2">{e.valid_to || "現行"}</td>
                    <td className="border border-slate-800 px-3 py-2 text-right font-bold text-white">
                      {formatValue(e)}
                    </td>
                    <td className="border border-slate-800 px-3 py-2 text-slate-400">
                      {e.source_law || "—"}
                    </td>
                    <td className="border border-slate-800 px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => onEdit(e)}
                          className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-white"
                          title="編集"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(e)}
                          className="rounded p-1 text-red-400 hover:bg-red-950/50 hover:text-red-200"
                          title="削除"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {pastCount === 0 ? (
            <p className="px-3 py-2 text-[10px] text-slate-500">過去版はまだありません。</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function TabBtn({
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

const floorYen = (v: number) => Math.max(0, Math.floor(v));

// バックエンド withholding_tax_service.lookup_monthly と同じロジック（表示用）。
function calcWithholding(
  t: WithholdingTable,
  salary: number,
  dependents: number,
  kind: "kou" | "otsu",
): number {
  const s = Math.max(0, Math.floor(salary));
  const dep = Math.max(0, Math.floor(dependents));
  const idx = Math.min(dep, 7);
  if (s < t.low_band.max) {
    return kind === "otsu" ? floorYen(s * t.low_band.otsu_rate) : 0;
  }
  const row = t.rows.find((r) => r.min <= s && s < r.max);
  if (row) {
    if (kind === "otsu") return row.otsu;
    let base = row.kou[idx];
    if (dep > 7) base = Math.max(0, base - t.over_7_deduction * (dep - 7));
    return base;
  }
  if (kind === "otsu") {
    const b = [...t.high_income_otsu].filter((x) => x.min <= s).sort((a, z) => z.min - a.min)[0];
    return b ? floorYen(b.base + (s - b.over) * b.rate) : 0;
  }
  const b = [...t.high_income_kou].filter((x) => x.min <= s).sort((a, z) => z.min - a.min)[0];
  if (!b) return 0;
  let tax = floorYen(b.kou[idx] + (s - b.min) * b.rate);
  if (dep > 7) tax = Math.max(0, tax - t.over_7_deduction * (dep - 7));
  return tax;
}

const yenNum = (v: number) => v.toLocaleString("ja-JP");

function WithholdingMonthlyDetail({ table }: { table: WithholdingTable }) {
  const [salary, setSalary] = useState(300000);
  const [dependents, setDependents] = useState(0);

  const kou = calcWithholding(table, salary, dependents, "kou");
  const otsu = calcWithholding(table, salary, dependents, "otsu");
  const matchedMin = table.rows.find((r) => r.min <= salary && salary < r.max)?.min ?? null;
  const kouColIdx = Math.min(Math.max(0, dependents), table.columns.length - 1);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-700 bg-slate-900/80 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-black text-white">
            {table.label_ja}
            <span className="ml-2 text-xs font-bold text-amber-300">{table.year_label}</span>
          </h3>
          {table.source_url ? (
            <a
              href={table.source_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-300 hover:text-blue-200"
            >
              <Globe className="h-3 w-3" />
              国税庁PDF
            </a>
          ) : null}
        </div>
        <p className="mt-1 text-[11px] text-slate-400">
          適用: {table.valid_from || "—"} 〜 {table.valid_to || "現行"}
          {table.source_law ? ` · ${table.source_law}` : ""}
        </p>
      </div>

      {/* 税額計算機 */}
      <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-4">
        <h4 className="mb-3 text-xs font-black text-amber-200">税額計算</h4>
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-300">
            社会保険料等控除後の給与（円）
            <NumInput
              value={salary}
              onValueChange={setSalary}
              className="w-40 rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-300">
            扶養親族等の数
            <NumInput
              value={dependents}
              onValueChange={setDependents}
              className="w-24 rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-white"
            />
          </label>
        </div>
        <ResultCard
          metrics={[
            { label: "甲欄（申告書あり）", value: yenStr(kou) },
            { label: "乙欄（申告書なし）", value: yenStr(otsu) },
          ]}
        />
        <p className="mt-2 text-[10px] text-slate-500">
          {table.low_band.max.toLocaleString("ja-JP")}円未満は甲=0・乙=給与×
          {(table.low_band.otsu_rate * 100).toFixed(3)}%。扶養7人超は7人の額から1人ごとに
          {yenNum(table.over_7_deduction)}円控除。740,000円以上は上位帯の式で計算（円未満切捨）。
        </p>
      </div>

      {/* グリッド */}
      <div className="max-h-[440px] overflow-auto rounded-xl border border-slate-700 bg-slate-900/80">
        <table className="min-w-full border-collapse text-right text-[10px] text-slate-300">
          <thead className="sticky top-0 z-10 bg-slate-800 text-[9px] font-black uppercase text-slate-400">
            <tr>
              <th className="border-b border-slate-700 px-2 py-1.5 text-right">以上</th>
              <th className="border-b border-slate-700 px-2 py-1.5 text-right">未満</th>
              {table.columns.map((c, i) => (
                <th
                  key={c}
                  className={`border-b border-slate-700 px-2 py-1.5 text-right ${
                    i === kouColIdx ? "bg-amber-700/40 text-amber-100" : ""
                  }`}
                >
                  {c}
                </th>
              ))}
              <th className="border-b border-slate-700 px-2 py-1.5 text-right bg-amber-700/40 text-amber-100">乙</th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r) => {
              const hit = r.min === matchedMin;
              return (
                <tr
                  key={r.min}
                  className={hit ? "bg-amber-600/30" : "odd:bg-slate-900/40"}
                >
                  <td className="border-b border-slate-800/60 px-2 py-1 tabular-nums">{yenNum(r.min)}</td>
                  <td className="border-b border-slate-800/60 px-2 py-1 tabular-nums text-slate-500">
                    {yenNum(r.max)}
                  </td>
                  {r.kou.map((k, i) => {
                    const colHit = i === kouColIdx;
                    const cross = hit && colHit;
                    return (
                      <td
                        key={i}
                        className={`border-b border-slate-800/60 px-2 py-1 tabular-nums ${
                          cross
                            ? "bg-amber-400/40 text-white ring-1 ring-inset ring-amber-300"
                            : colHit
                              ? "bg-amber-500/15"
                              : ""
                        }`}
                      >
                        {yenNum(k)}
                      </td>
                    );
                  })}
                  <td
                    className={`border-b border-slate-800/60 px-2 py-1 tabular-nums text-slate-400 ${
                      hit ? "bg-amber-400/40 text-white ring-1 ring-inset ring-amber-300" : "bg-amber-500/15"
                    }`}
                  >
                    {yenNum(r.otsu)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 高額帯（740,000円以上）ブレークポイント */}
      <details className="rounded-xl border border-slate-700 bg-slate-900/60 p-3">
        <summary className="cursor-pointer text-[11px] font-black text-slate-300">
          高額帯（740,000円以上）の基準額と限界税率
        </summary>
        <div className="mt-2 overflow-auto">
          <table className="min-w-full border-collapse text-right text-[10px] text-slate-300">
            <thead className="bg-slate-800/80 text-[9px] font-black uppercase text-slate-500">
              <tr>
                <th className="border-b border-slate-700 px-2 py-1 text-right">以上</th>
                {table.columns.map((c) => (
                  <th key={c} className="border-b border-slate-700 px-2 py-1 text-right">
                    {c}
                  </th>
                ))}
                <th className="border-b border-slate-700 px-2 py-1 text-right">限界税率</th>
              </tr>
            </thead>
            <tbody>
              {table.high_income_kou.map((b) => (
                <tr key={b.min} className="odd:bg-slate-900/40">
                  <td className="border-b border-slate-800/60 px-2 py-1 tabular-nums">{yenNum(b.min)}</td>
                  {b.kou.map((k, i) => (
                    <td key={i} className="border-b border-slate-800/60 px-2 py-1 tabular-nums">
                      {yenNum(k)}
                    </td>
                  ))}
                  <td className="border-b border-slate-800/60 px-2 py-1 tabular-nums text-amber-300">
                    {(b.rate * 100).toFixed(3)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function corpPeriodIndex(t: CorporateTaxTable, fyStart: string): number {
  let idx = 0;
  t.periods.forEach((p, i) => {
    if (p.start && p.start <= fyStart) idx = i;
  });
  return idx;
}

// 選択した法人区分について、軽減（800万円以下）行と標準（800万円超）行を特定する。
function findCorpRows(t: CorporateTaxTable, corpType: string, excluded: boolean) {
  const idxRows = t.rows
    .map((r, idx) => ({ r, idx }))
    .filter((x) => x.r.corp_type === corpType);
  let reduced: { r: CorporateTaxTable["rows"][number]; idx: number } | null = null;
  let standard: { r: CorporateTaxTable["rows"][number]; idx: number } | null = null;
  for (const x of idxRows) {
    const band = x.r.income_band || "";
    const seg = x.r.segment || "";
    const isReduced = band.includes("800万円以下");
    const isStandard = band.includes("800万円超") || band === "—" || seg.startsWith("上記以外");
    if (isReduced) {
      if (corpType === "普通法人") {
        // 普通法人は「適用除外事業者」行と通常行を区別する。
        if (excluded === band.includes("適用除外")) reduced = x;
      } else if (!reduced) {
        reduced = x;
      }
    }
    if (isStandard && !standard) standard = x;
  }
  return { reduced, standard };
}

// バックエンド corporate_tax_service.compute_corporate_tax と同じロジック（表示用）。
function calcCorp(
  t: CorporateTaxTable,
  corpType: string,
  income: number,
  fyStart: string,
  smallBusiness: boolean,
  excludedBusiness: boolean,
) {
  const pidx = corpPeriodIndex(t, fyStart);
  const { reduced, standard } = findCorpRows(t, corpType, excludedBusiness);
  const threshold = t.small_business_threshold;
  const inc = Math.max(0, income);
  // 普通法人のみ「中小法人か」で軽減の可否が変わる。他区分は常に800万円で分割。
  const applyReduced = corpType === "普通法人" ? smallBusiness : true;

  let reducedPortion = 0;
  let standardPortion = inc;
  if (applyReduced && reduced) {
    reducedPortion = Math.min(inc, threshold);
    standardPortion = Math.max(0, inc - threshold);
  }

  const reducedRateBase = reduced ? reduced.r.rates[pidx] ?? 0 : 0;
  const standardRate = standard ? standard.r.rates[pidx] ?? 0 : reducedRateBase;
  let reducedRate = reducedRateBase;
  // 令7.4.1以後・所得10億円超は軽減部分が17%（適用除外事業者を除く）。
  if (
    applyReduced &&
    !excludedBusiness &&
    reduced &&
    t.special_10b_reduced_rate != null &&
    t.special_10b_from &&
    fyStart >= t.special_10b_from &&
    t.special_10b_threshold != null &&
    inc > t.special_10b_threshold
  ) {
    reducedRate = t.special_10b_reduced_rate;
  }

  const tax = floorYen(reducedRate * reducedPortion + standardRate * standardPortion);
  return {
    pidx,
    reducedIdx: reduced?.idx ?? -1,
    standardIdx: standard?.idx ?? -1,
    reducedRate,
    standardRate,
    reducedPortion,
    standardPortion,
    reducedActive: reducedPortion > 0,
    standardActive: standardPortion > 0,
    tax,
  };
}

function CorporateTaxRateDetail({ table }: { table: CorporateTaxTable }) {
  const corpTypes = useMemo(
    () => Array.from(new Set(table.rows.map((row) => row.corp_type))),
    [table.rows],
  );
  const [corpType, setCorpType] = useState(corpTypes[0] ?? "普通法人");
  const [income, setIncome] = useState(10_000_000);
  const [fyStart, setFyStart] = useState("2025-06-01");
  const [smallBusiness, setSmallBusiness] = useState(true);
  const [excludedBusiness, setExcludedBusiness] = useState(false);

  const isFutei = corpType === "普通法人";
  const r = calcCorp(table, corpType, income, fyStart, smallBusiness, excludedBusiness);
  const pidx = r.pidx;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-700 bg-slate-900/80 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-black text-white">
            {table.label_ja}
            <span className="ml-2 text-xs font-bold text-amber-300">{table.law_asof}</span>
          </h3>
          {table.source_url ? (
            <a
              href={table.source_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-300 hover:text-blue-200"
            >
              <Globe className="h-3 w-3" />
              国税庁 No.5759
            </a>
          ) : null}
        </div>
        <p className="mt-1 text-[11px] text-slate-400">
          {table.source_law ? `根拠: ${table.source_law}` : ""}
        </p>
      </div>

      {/* 税額計算機 */}
      <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-4">
        <h4 className="mb-3 text-xs font-black text-amber-200">法人税額の計算</h4>
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-300">
            法人区分
            <select
              value={corpType}
              onChange={(e) => setCorpType(e.target.value)}
              className="max-w-[260px] rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-white"
            >
              {corpTypes.map((ct) => (
                <option key={ct} value={ct}>
                  {ct}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-300">
            課税所得金額（円）
            <NumInput
              value={income}
              onValueChange={setIncome}
              className="w-44 rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-300">
            事業年度開始日
            <input
              type="date"
              value={fyStart}
              onChange={(e) => setFyStart(e.target.value)}
              className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-white"
            />
          </label>
          {isFutei ? (
            <>
              <label className="flex items-center gap-2 text-[11px] font-bold text-slate-300">
                <input
                  type="checkbox"
                  checked={smallBusiness}
                  onChange={(e) => setSmallBusiness(e.target.checked)}
                  className="h-4 w-4"
                />
                中小法人（資本金1億円以下）
              </label>
              <label className="flex items-center gap-2 text-[11px] font-bold text-slate-300">
                <input
                  type="checkbox"
                  checked={excludedBusiness}
                  onChange={(e) => setExcludedBusiness(e.target.checked)}
                  className="h-4 w-4"
                  disabled={!smallBusiness}
                />
                適用除外事業者
              </label>
            </>
          ) : null}
        </div>
        <ResultCard
          metrics={[{ label: "法人税額", value: yenStr(r.tax) }]}
          breakdown={
            <>
              {r.reducedActive ? (
                <>
                  軽減 {ratePct(r.reducedRate)} × {yenNum(r.reducedPortion)}円
                  {r.standardActive ? " ＋ " : ""}
                </>
              ) : null}
              {r.standardActive ? (
                <>
                  標準 {ratePct(r.standardRate)} × {yenNum(r.standardPortion)}円
                </>
              ) : null}
            </>
          }
        />
        <p className="mt-2 text-[10px] text-slate-500">
          課税所得は1,000円未満切捨後の金額を入力。税額の100円未満切捨は最終申告側で行います。
          {isFutei && !smallBusiness
            ? "　大法人は全額を標準税率で計算します。"
            : "　年800万円以下と超の部分で税率が分かれる場合は両方の行が光ります。"}
        </p>
      </div>

      {/* 税率マトリクス */}
      <div className="overflow-auto rounded-xl border border-slate-700 bg-slate-900/80">
        <table className="min-w-full border-collapse text-left text-[10px] text-slate-300">
          <thead className="bg-slate-800/80 text-[9px] font-black uppercase text-slate-500">
            <tr>
              <th className="border-b border-slate-700 px-2 py-1.5">法人区分</th>
              <th className="border-b border-slate-700 px-2 py-1.5">所得区分</th>
              {table.periods.map((p, i) => (
                <th
                  key={p.start}
                  className={`border-b border-slate-700 px-2 py-1.5 text-right ${
                    i === pidx ? "bg-amber-700/40 text-amber-100" : ""
                  }`}
                >
                  {p.label}
                </th>
              ))}
              <th className="border-b border-slate-700 px-2 py-1.5 text-right">連結【】</th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, ri) => {
              const rowHit =
                (ri === r.reducedIdx && r.reducedActive) ||
                (ri === r.standardIdx && r.standardActive);
              return (
                <tr
                  key={ri}
                  className={
                    rowHit
                      ? "bg-amber-500/25 font-bold text-amber-100 ring-1 ring-inset ring-amber-400/60 align-top"
                      : "odd:bg-slate-900/40 align-top"
                  }
                >
                  <td className="border-b border-slate-800/60 px-2 py-1">
                    <div className="font-bold text-slate-200">{row.corp_type}</div>
                    {row.segment ? <div className="text-[9px] text-slate-500">{row.segment}</div> : null}
                  </td>
                  <td className="border-b border-slate-800/60 px-2 py-1">
                    {row.income_band}
                    {row.note ? (
                      <div className="text-[9px] text-slate-500">{row.note}</div>
                    ) : null}
                  </td>
                  {row.rates.map((rate, ci) => {
                    const colHit = ci === pidx;
                    const cross = rowHit && colHit;
                    return (
                      <td
                        key={ci}
                        className={`border-b border-slate-800/60 px-2 py-1 text-right tabular-nums ${
                          cross
                            ? "bg-amber-400/40 text-white ring-1 ring-inset ring-amber-300"
                            : colHit
                              ? "bg-amber-500/15"
                              : ""
                        }`}
                      >
                        {ratePct(rate)}
                      </td>
                    );
                  })}
                  <td className="border-b border-slate-800/60 px-2 py-1 text-right tabular-nums text-slate-400">
                    {row.consolidated_rate != null ? ratePct(row.consolidated_rate) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {table.notes.length > 0 ? (
        <ul className="space-y-1 rounded-xl border border-slate-700 bg-slate-900/60 p-3 text-[10px] text-slate-400">
          {table.notes.map((n, i) => (
            <li key={i}>・{n}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function formatRefCell(value: unknown, colType: string): string {
  if (value == null) return "—";
  if (colType === "percent" || colType === "per_mille") {
    const n = Number(value);
    if (colType === "per_mille") return `${(n * 1000).toFixed(1)}/1000`;
    return ratePct(n);
  }
  if (colType === "yen") return `${Number(value).toLocaleString("ja-JP")}円`;
  return String(value);
}

type ResultMetric = { label: string; value: string; sub?: string };

// 法人税計算機と同じ見せ方に統一した結果カード。
// ラベル付きの大きな数値ボックスを並べ、必要なら右側に内訳テキストを添える。
function ResultCard({
  metrics,
  breakdown,
  tone = "amber",
}: {
  metrics: ResultMetric[] | null;
  breakdown?: ReactNode;
  tone?: "amber" | "emerald" | "red";
}) {
  if (!metrics || metrics.length === 0) {
    return (
      <div className="mt-3 rounded-lg border border-dashed border-slate-600 bg-slate-900/40 px-4 py-2 text-[11px] text-slate-500">
        上の値を入力すると自動で結果が表示されます。
      </div>
    );
  }
  const boxCls =
    tone === "emerald"
      ? "border-emerald-600/50 text-emerald-200"
      : tone === "red"
        ? "border-red-600/50 text-red-200"
        : "border-amber-700/50 text-amber-200";
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      {metrics.map((m, i) => (
        <div key={i} className={`rounded-lg border bg-slate-900/70 px-4 py-2 ${boxCls}`}>
          <div className="text-[10px] font-black text-slate-400">{m.label}</div>
          <div className="text-xl font-black">{m.value}</div>
          {m.sub ? <div className="text-[9px] font-medium text-slate-500">{m.sub}</div> : null}
        </div>
      ))}
      {breakdown ? <div className="text-[11px] text-slate-400">{breakdown}</div> : null}
    </div>
  );
}

// 円表記のヘルパー（結果カード用）。
function yenStr(n: unknown): string {
  return `${Number(n).toLocaleString("ja-JP")}円`;
}

// 数値入力：入力途中の空欄を許容し（バックスペースで全消去できる）、先頭ゼロを自動除去する。
function NumInput({
  value,
  onValueChange,
  min = 0,
  className,
}: {
  value: number;
  onValueChange: (n: number) => void;
  min?: number;
  className?: string;
}) {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText((prev) => (Number(prev) === value ? prev : String(value)));
  }, [value]);

  return (
    <input
      type="number"
      inputMode="numeric"
      min={min}
      value={text}
      onChange={(e) => {
        const cleaned = e.target.value.replace(/^0+(?=\d)/, "");
        setText(cleaned);
        if (cleaned === "") return;
        const n = Number(cleaned);
        if (!Number.isNaN(n)) onValueChange(n);
      }}
      onBlur={() => {
        if (text === "" || Number.isNaN(Number(text))) {
          setText(String(min));
          onValueChange(min);
        } else {
          setText(String(Number(text)));
        }
      }}
      className={className}
    />
  );
}

function RefTableDetail({
  table,
  asOf,
  onTableUpdated,
}: {
  table: RefTable;
  asOf: string;
  onTableUpdated?: (t: RefTable) => void;
}) {
  const versions = table.versions;
  const [versionIdx, setVersionIdx] = useState(0);

  useEffect(() => {
    const idx = versions.findIndex((v) => {
      const vf = v.valid_from || "";
      const vt = v.valid_to;
      if (vf && vf > asOf) return false;
      if (vt && vt < asOf) return false;
      return true;
    });
    setVersionIdx(idx >= 0 ? idx : 0);
  }, [table.id, asOf, versions]);

  const version = versions[versionIdx] ?? versions[0];

  // --- 計算機 state ---
  const [eiWage, setEiWage] = useState(300000);
  const [eiBusiness, setEiBusiness] = useState("一般の事業");
  const [eiResult, setEiResult] = useState<Record<string, unknown> | null>(null);

  const [siAmount, setSiAmount] = useState(800000);
  const [siInsurance, setSiInsurance] = useState("厚生年金");
  const [siBasis, setSiBasis] = useState("標準報酬月額");
  const [siResult, setSiResult] = useState<Record<string, unknown> | null>(null);

  const [basicIncome, setBasicIncome] = useState(5000000);
  const [basicResult, setBasicResult] = useState<Record<string, unknown> | null>(null);

  const [spouseIncome, setSpouseIncome] = useState(800000);
  const [taxpayerIncome, setTaxpayerIncome] = useState(6000000);
  const [spouseElderly, setSpouseElderly] = useState(false);
  const [spouseResult, setSpouseResult] = useState<Record<string, unknown> | null>(null);

  const [corpCapital, setCorpCapital] = useState(10000000);
  const [corpEmployees, setCorpEmployees] = useState(30);
  const [corpPercapResult, setCorpPercapResult] = useState<Record<string, unknown> | null>(null);

  const [simpTax1, setSimpTax1] = useState(100000);
  const [simpType1, setSimpType1] = useState(1);
  const [simpResult, setSimpResult] = useState<Record<string, unknown> | null>(null);

  const [eidRevenue, setEidRevenue] = useState(5000000);
  const [eidResult, setEidResult] = useState<Record<string, unknown> | null>(null);

  const [rtIncome, setRtIncome] = useState(3000000);
  const [rtCode, setRtCode] = useState("");
  const [rtDesignated, setRtDesignated] = useState(false);
  const [rtResult, setRtResult] = useState<Record<string, unknown> | null>(null);

  const [mwSalary, setMwSalary] = useState(160000);
  const [mwHours, setMwHours] = useState(160);
  const [mwPref, setMwPref] = useState("東京都");
  const [mwResult, setMwResult] = useState<Record<string, unknown> | null>(null);

  const [ibIncome, setIbIncome] = useState(5000000);
  const [ibCategory, setIbCategory] = useState("");
  const [ibResult, setIbResult] = useState<{ category: string; taxable: number; tax: number; rate: number } | null>(null);

  const [depCategory, setDepCategory] = useState("");
  const [depCount, setDepCount] = useState(1);
  const [depResult, setDepResult] = useState<{ category: string; amount: number; total: number } | null>(null);

  const [ahRemuneration, setAhRemuneration] = useState(300000);
  const [ahPrefCode, setAhPrefCode] = useState("13");
  const [ahCare, setAhCare] = useState(false);
  const [ahResult, setAhResult] = useState<Record<string, unknown> | null>(null);
  const [ahAmountTable, setAhAmountTable] = useState<{
    prefecture: string;
    health_rate: number;
    health_care_rate: number;
    care_rate: number;
    child_support_rate: number;
    pension_rate: number;
    childcare_contrib_rate?: number;
    rows: Record<string, unknown>[];
  } | null>(null);

  const [addPrefOpen, setAddPrefOpen] = useState(false);
  const [addPrefBusy, setAddPrefBusy] = useState(false);
  const [addPrefError, setAddPrefError] = useState<string | null>(null);
  const [newPref, setNewPref] = useState({
    prefecture_code: "",
    prefecture: "",
    health_rate: "9.85",
    care_rate: "1.62",
    health_care_rate: "11.47",
    child_support_rate: "0.23",
    pension_rate: "18.3",
    childcare_contrib_rate: "0.36",
    source_url: "",
  });

  // ハイライト行を画面内へスクロールする。
  const matchedRowRef = useRef<HTMLTableRowElement | null>(null);
  useEffect(() => {
    matchedRowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [
    eiResult,
    siResult,
    basicResult,
    spouseResult,
    corpPercapResult,
    simpResult,
    eidResult,
    rtResult,
    mwResult,
    ibResult,
    depResult,
    ahResult,
  ]);

  // 入力が変わるたびに自動で計算する（ボタン不要・250msデバウンス）。
  useEffect(() => {
    if (table.id !== "employment_insurance_rate") return;
    const t = setTimeout(() => {
      void calcEmploymentInsurance({ wage: eiWage, business: eiBusiness, asOf })
        .then(setEiResult)
        .catch(() => setEiResult(null));
    }, 250);
    return () => clearTimeout(t);
  }, [table.id, eiWage, eiBusiness, asOf]);

  useEffect(() => {
    if (table.id !== "social_insurance_standard_caps") return;
    const t = setTimeout(() => {
      void clipSocialInsuranceBasis({ amount: siAmount, insurance: siInsurance, basis: siBasis, asOf })
        .then(setSiResult)
        .catch(() => setSiResult(null));
    }, 250);
    return () => clearTimeout(t);
  }, [table.id, siAmount, siInsurance, siBasis, asOf]);

  useEffect(() => {
    if (table.id !== "basic_deduction") return;
    const t = setTimeout(() => {
      void lookupBasicDeduction({ totalIncome: basicIncome, asOf })
        .then(setBasicResult)
        .catch(() => setBasicResult(null));
    }, 250);
    return () => clearTimeout(t);
  }, [table.id, basicIncome, asOf]);

  useEffect(() => {
    if (table.id !== "spouse_deduction") return;
    const t = setTimeout(() => {
      void lookupSpouseDeduction({ spouseIncome, taxpayerIncome, spouseElderly, asOf })
        .then(setSpouseResult)
        .catch(() => setSpouseResult(null));
    }, 250);
    return () => clearTimeout(t);
  }, [table.id, spouseIncome, taxpayerIncome, spouseElderly, asOf]);

  useEffect(() => {
    if (table.id !== "corporate_resident_percapita") return;
    const t = setTimeout(() => {
      void lookupCorporatePercapita({ capital: corpCapital, employees: corpEmployees, asOf })
        .then(setCorpPercapResult)
        .catch(() => setCorpPercapResult(null));
    }, 250);
    return () => clearTimeout(t);
  }, [table.id, corpCapital, corpEmployees, asOf]);

  useEffect(() => {
    if (table.id !== "simplified_tax_deemed_rate") return;
    const t = setTimeout(() => {
      void calcSimplifiedConsumption({ taxByType: { [simpType1]: simpTax1 }, asOf })
        .then(setSimpResult)
        .catch(() => setSimpResult(null));
    }, 250);
    return () => clearTimeout(t);
  }, [table.id, simpType1, simpTax1, asOf]);

  useEffect(() => {
    if (table.id !== "employment_income_deduction") return;
    const t = setTimeout(() => {
      void calcEmploymentIncome({ salaryRevenue: eidRevenue, asOf })
        .then(setEidResult)
        .catch(() => setEidResult(null));
    }, 250);
    return () => clearTimeout(t);
  }, [table.id, eidRevenue, asOf]);

  useEffect(() => {
    if (table.id !== "resident_tax_excess") return;
    const t = setTimeout(() => {
      void calcIndividualResidentTax({
        taxableIncome: rtIncome,
        asOf,
        jurisdictionCode: rtCode || undefined,
        designatedCity: rtDesignated,
      })
        .then(setRtResult)
        .catch(() => setRtResult(null));
    }, 250);
    return () => clearTimeout(t);
  }, [table.id, rtIncome, rtCode, rtDesignated, asOf]);

  useEffect(() => {
    if (table.id !== "minimum_wage") return;
    const t = setTimeout(() => {
      void checkMinimumWage({
        monthlyBaseSalary: mwSalary,
        monthlyScheduledHours: mwHours,
        prefecture: mwPref,
        asOf,
      })
        .then(setMwResult)
        .catch(() => setMwResult(null));
    }, 250);
    return () => clearTimeout(t);
  }, [table.id, mwSalary, mwHours, mwPref, asOf]);

  useEffect(() => {
    if (table.id !== "association_health_rates" && table.id !== "social_insurance_standard_grades") {
      return;
    }
    const t = setTimeout(() => {
      void calcAssociationHealth({
        remunerationMonthly: ahRemuneration,
        prefectureCode: ahPrefCode,
        careApplicable: ahCare,
        asOf,
      })
        .then(setAhResult)
        .catch(() => setAhResult(null));
    }, 250);
    return () => clearTimeout(t);
  }, [table.id, ahRemuneration, ahPrefCode, ahCare, asOf]);

  useEffect(() => {
    if (table.id !== "association_health_rates" && table.id !== "social_insurance_standard_grades") {
      return;
    }
    const t = setTimeout(() => {
      void fetchAssociationHealthAmountTableAuth({ prefectureCode: ahPrefCode, asOf })
        .then((r) =>
          setAhAmountTable({
            prefecture: String(r.prefecture),
            health_rate: Number(r.health_rate),
            health_care_rate: Number(r.health_care_rate),
            care_rate: Number(r.care_rate),
            child_support_rate: Number(r.child_support_rate),
            pension_rate: Number(r.pension_rate),
            childcare_contrib_rate: Number(r.childcare_contrib_rate ?? 0),
            rows: r.rows,
          }),
        )
        .catch(() => setAhAmountTable(null));
    }, 200);
    return () => clearTimeout(t);
  }, [table.id, ahPrefCode, asOf]);

  // クライアント計算（個人事業税・扶養控除）は即時反映。
  useEffect(() => {
    if (table.id !== "individual_business_tax" || !version) return;
    const cat = ibCategory || String(version.rows[0]?.category ?? "");
    const row = version.rows.find((r) => String(r.category) === cat);
    if (!row) {
      setIbResult(null);
      return;
    }
    const rate = Number(row.rate) || 0;
    const taxable = Math.max(0, ibIncome - 2_900_000);
    setIbResult({ category: cat, taxable, tax: Math.floor(taxable * rate), rate });
  }, [table.id, version, ibCategory, ibIncome]);

  useEffect(() => {
    if (table.id !== "dependent_deduction" || !version) return;
    const cat = depCategory || String(version.rows[0]?.category ?? "");
    const row = version.rows.find((r) => String(r.category) === cat);
    if (!row) {
      setDepResult(null);
      return;
    }
    const amount = Number(row.amount) || 0;
    setDepResult({ category: cat, amount, total: amount * Math.max(0, depCount) });
  }, [table.id, version, depCategory, depCount]);

  if (!version) return null;

  // 計算結果に対応する表の行を判定する（ハイライト用）。
  const highlightRow = (row: Record<string, unknown>): boolean => {
    switch (table.id) {
      case "employment_insurance_rate":
        return !!eiResult && row.business === eiResult.business;
      case "social_insurance_standard_caps":
        return (
          !!siResult && row.insurance === siResult.insurance && row.basis === siResult.basis
        );
      case "basic_deduction":
        return !!basicResult && row.income_band === basicResult.income_band;
      case "spouse_deduction":
        return !!spouseResult && row.spouse_income === spouseResult.spouse_income_band;
      case "corporate_resident_percapita":
        return !!corpPercapResult && row.capital_band === corpPercapResult.capital_band;
      case "simplified_tax_deemed_rate":
        return !!simpResult && row.type_no === simpType1;
      case "minimum_wage":
        return !!mwResult && row.prefecture === mwResult.prefecture;
      case "resident_tax_excess":
        return !!rtResult && !!rtCode && row.jurisdiction_code === rtCode;
      case "employment_income_deduction":
        return !!eidResult && row.band === eidResult.band;
      case "individual_business_tax":
        return !!ibResult && row.category === ibResult.category;
      case "dependent_deduction":
        return !!depResult && row.category === depResult.category;
      case "association_health_rates":
        return !!ahResult && String(row.prefecture_code) === String(ahResult.prefecture_code);
      case "social_insurance_standard_grades":
        return !!ahResult && Number(row.grade_health) === Number(ahResult.grade_health);
      default:
        return false;
    }
  };

  // 計算結果に対応する列を判定する（縦ハイライト用）。
  const highlightCol = (colKey: string): boolean => {
    switch (table.id) {
      case "employment_insurance_rate":
        return !!eiResult && (colKey === "worker" || colKey === "employer" || colKey === "total");
      case "social_insurance_standard_caps":
        return !!siResult && colKey === "cap_amount";
      case "basic_deduction":
        return !!basicResult && colKey === "amount";
      case "spouse_deduction": {
        if (!spouseResult) return false;
        const ti = Number(spouseResult.taxpayer_income);
        const c = ti <= 9_000_000 ? "h900" : ti <= 9_500_000 ? "h950" : ti <= 10_000_000 ? "h1000" : "";
        return colKey === c;
      }
      case "corporate_resident_percapita":
        if (!corpPercapResult) return false;
        return (
          colKey === "pref" ||
          colKey === (Number(corpPercapResult.employees) > 50 ? "city_over50" : "city_le50")
        );
      case "simplified_tax_deemed_rate":
        return !!simpResult && colKey === "deemed_rate";
      case "employment_income_deduction":
        return !!eidResult && colKey === "formula";
      case "resident_tax_excess":
        return !!rtResult && (colKey === "percapita_add" || colKey === "income_rate_add");
      case "minimum_wage":
        return !!mwResult && colKey === "amount";
      case "individual_business_tax":
        return !!ibResult && colKey === "rate";
      case "dependent_deduction":
        return !!depResult && colKey === "amount";
      case "association_health_rates":
        return (
          !!ahResult &&
          (colKey === "health_rate" ||
            colKey === "health_care_rate" ||
            colKey === "child_support_rate" ||
            colKey === "pension_rate")
        );
      case "social_insurance_standard_grades":
        return !!ahResult && (colKey === "standard_monthly" || colKey === "grade_health");
      default:
        return false;
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-700 bg-slate-900/80 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-black text-white">{table.label_ja}</h3>
          {table.source_url ? (
            <a
              href={table.source_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-300 hover:text-blue-200"
            >
              <Globe className="h-3 w-3" />
              出典
            </a>
          ) : null}
        </div>
        <p className="mt-1 text-[11px] text-slate-400">
          {table.category ? `${table.category} · ` : ""}
          {table.source_law || ""}
        </p>
        {versions.length > 1 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {versions.map((v, i) => (
              <button
                key={v.valid_from}
                type="button"
                onClick={() => setVersionIdx(i)}
                className={`rounded-lg px-2 py-1 text-[10px] font-bold ${
                  i === versionIdx
                    ? "bg-amber-700/50 text-amber-100"
                    : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                }`}
              >
                {v.label || v.valid_from}
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-[10px] text-amber-300/80">
            適用: {version.valid_from} 〜 {version.valid_to || "現行"}
          </p>
        )}
      </div>

      {/* 計算機（テーブル種別ごと） */}
      {table.id === "employment_insurance_rate" ? (
        <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-4">
          <h4 className="mb-3 text-xs font-black text-amber-200">雇用保険料の計算</h4>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-300">
              賃金（円）
              <NumInput value={eiWage} onValueChange={setEiWage} className="w-36 rounded-lg border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-white" />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-300">
              事業区分
              <select value={eiBusiness} onChange={(e) => setEiBusiness(e.target.value)} className="rounded-lg border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-white">
                {version.rows.map((r) => (
                  <option key={String(r.business)} value={String(r.business)}>{String(r.business)}</option>
                ))}
              </select>
            </label>
          </div>
          <ResultCard
            metrics={
              eiResult
                ? [
                    { label: "労働者負担", value: yenStr(eiResult.worker_amount) },
                    { label: "事業主負担", value: yenStr(eiResult.employer_amount) },
                    { label: "合計", value: yenStr(eiResult.total_amount) },
                  ]
                : null
            }
          />
        </div>
      ) : null}

      {table.id === "social_insurance_standard_caps" ? (
        <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-4">
          <h4 className="mb-3 text-xs font-black text-amber-200">社会保険 上限クリップ</h4>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-300">
              実額（円）
              <NumInput value={siAmount} onValueChange={setSiAmount} className="w-36 rounded-lg border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-white" />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-300">
              制度
              <select value={siInsurance} onChange={(e) => setSiInsurance(e.target.value)} className="rounded-lg border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-white">
                {Array.from(new Set(version.rows.map((r) => String(r.insurance)))).map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-300">
              対象
              <select value={siBasis} onChange={(e) => setSiBasis(e.target.value)} className="rounded-lg border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-white">
                {Array.from(new Set(version.rows.map((r) => String(r.basis)))).map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </label>
          </div>
          <ResultCard
            metrics={
              siResult ? [{ label: "計算基礎額", value: yenStr(siResult.clipped_amount) }] : null
            }
            breakdown={
              siResult ? (
                <>
                  上限 {yenStr(siResult.cap_amount)}
                  {siResult.was_clipped ? "（上限適用）" : "（上限未満）"}
                </>
              ) : null
            }
          />
        </div>
      ) : null}

      {table.id === "association_health_rates" || table.id === "social_insurance_standard_grades" ? (
        <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-4">
          <h4 className="mb-3 text-xs font-black text-amber-200">協会けんぽ 保険料額の計算</h4>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-300">
              報酬月額（円）
              <NumInput
                value={ahRemuneration}
                onValueChange={setAhRemuneration}
                className="w-36 rounded-lg border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-white"
              />
            </label>
            {table.id === "association_health_rates" ? (
              <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-300">
                都道府県
                <select
                  value={ahPrefCode}
                  onChange={(e) => setAhPrefCode(e.target.value)}
                  className="rounded-lg border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-white"
                >
                  {version.rows.map((r) => (
                    <option key={String(r.prefecture_code)} value={String(r.prefecture_code)}>
                      {String(r.prefecture)}（{String(r.prefecture_code)}）
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="flex items-center gap-2 text-[11px] font-bold text-slate-300">
              <input type="checkbox" checked={ahCare} onChange={(e) => setAhCare(e.target.checked)} className="h-4 w-4" />
              介護保険第2号（40〜64歳）
            </label>
          </div>
          <ResultCard
            metrics={
              ahResult
                ? [
                    { label: "被保険者負担（月）", value: yenStr(ahResult.employee_total) },
                    { label: "事業主負担（月）", value: yenStr(ahResult.employer_total) },
                    { label: "合計", value: yenStr(ahResult.total) },
                  ]
                : null
            }
            breakdown={
              ahResult ? (
                <>
                  等級 {String(ahResult.grade_health)}
                  {ahResult.grade_pension != null ? `（厚年${String(ahResult.grade_pension)}）` : ""}
                  ／標準報酬 {yenStr(ahResult.standard_monthly_health)}
                  ／健保 {(Number(ahResult.health_rate) * 100).toFixed(2)}%
                </>
              ) : null
            }
          />
          {ahAmountTable ? (
            <div className="mt-4 overflow-auto rounded-lg border border-slate-600">
              <div className="border-b border-slate-600 bg-slate-900 px-3 py-2 text-[11px] font-black text-amber-200">
                保険料額表（{ahAmountTable.prefecture}）— PDF様式 · 全{ahAmountTable.rows.length}等級
              </div>
              <table className="min-w-[980px] w-full border-collapse text-[9px] text-slate-200">
                <thead>
                  <tr className="bg-slate-800 text-center font-black text-slate-300">
                    <th rowSpan={2} className="border border-slate-600 px-1 py-1.5">等級</th>
                    <th rowSpan={2} className="border border-slate-600 px-1 py-1.5">標準報酬月額</th>
                    <th rowSpan={2} className="border border-slate-600 px-1 py-1.5">報酬月額</th>
                    <th colSpan={2} className="border border-slate-600 px-1 py-1">
                      健保 {(ahAmountTable.health_rate * 100).toFixed(2)}%
                    </th>
                    <th colSpan={2} className="border border-slate-600 px-1 py-1">
                      健保＋介護 {(ahAmountTable.health_care_rate * 100).toFixed(2)}%
                    </th>
                    <th colSpan={2} className="border border-slate-600 px-1 py-1">
                      支援金 {(ahAmountTable.child_support_rate * 100).toFixed(2)}%
                    </th>
                    <th colSpan={2} className="border border-slate-600 px-1 py-1">
                      厚年 {(ahAmountTable.pension_rate * 100).toFixed(2)}%
                    </th>
                  </tr>
                  <tr className="bg-slate-850 text-center font-bold text-slate-400">
                    {["全額", "折半", "全額", "折半", "全額", "折半", "全額", "折半"].map((h, i) => (
                      <th key={i} className="border border-slate-600 px-1 py-1">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ahAmountTable.rows.map((row) => {
                    const hit = !!ahResult && Number(row.grade_health) === Number(ahResult.grade_health);
                    const lo = row.remuneration_min == null ? "" : Number(row.remuneration_min).toLocaleString("ja-JP");
                    const hi = row.remuneration_max == null ? "" : Number(row.remuneration_max).toLocaleString("ja-JP");
                    const band = !lo && hi ? `〜${hi}` : lo && !hi ? `${lo}〜` : `${lo}〜${hi}`;
                    const g =
                      row.grade_pension == null
                        ? String(row.grade_health)
                        : `${row.grade_health}(${row.grade_pension})`;
                    const cell = (n: unknown) => {
                      const v = Number(n);
                      if (!v) return "—";
                      return v.toLocaleString("ja-JP", {
                        minimumFractionDigits: Number.isInteger(v) ? 0 : 1,
                        maximumFractionDigits: 1,
                      });
                    };
                    return (
                      <tr
                        key={String(row.grade_health)}
                        ref={hit ? matchedRowRef : undefined}
                        className={hit ? "bg-amber-900/50 font-bold text-amber-50" : "odd:bg-slate-900/40"}
                      >
                        <td className="border border-slate-700 px-1 py-0.5 text-center tabular-nums">{g}</td>
                        <td className="border border-slate-700 px-1 py-0.5 text-right tabular-nums">
                          {Number(row.standard_monthly).toLocaleString("ja-JP")}
                        </td>
                        <td className="border border-slate-700 px-1 py-0.5 text-center tabular-nums text-[8px]">{band}</td>
                        <td className={`border border-slate-700 px-1 py-0.5 text-right tabular-nums ${hit && !ahCare ? "bg-blue-900/50" : ""}`}>{cell(row.health_full)}</td>
                        <td className={`border border-slate-700 px-1 py-0.5 text-right tabular-nums ${hit && !ahCare ? "bg-blue-900/50" : ""}`}>{cell(row.health_half)}</td>
                        <td className={`border border-slate-700 px-1 py-0.5 text-right tabular-nums ${hit && ahCare ? "bg-blue-900/50" : ""}`}>{cell(row.health_care_full)}</td>
                        <td className={`border border-slate-700 px-1 py-0.5 text-right tabular-nums ${hit && ahCare ? "bg-blue-900/50" : ""}`}>{cell(row.health_care_half)}</td>
                        <td className={`border border-slate-700 px-1 py-0.5 text-right tabular-nums ${hit ? "bg-blue-900/50" : ""}`}>{cell(row.child_support_full)}</td>
                        <td className={`border border-slate-700 px-1 py-0.5 text-right tabular-nums ${hit ? "bg-blue-900/50" : ""}`}>{cell(row.child_support_half)}</td>
                        <td className={`border border-slate-700 px-1 py-0.5 text-right tabular-nums ${hit ? "bg-blue-900/50" : ""}`}>{cell(row.pension_full)}</td>
                        <td className={`border border-slate-700 px-1 py-0.5 text-right tabular-nums ${hit ? "bg-blue-900/50" : ""}`}>{cell(row.pension_half)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      {table.id === "association_health_rates" ? (
        <div className="rounded-xl border border-emerald-800/40 bg-emerald-950/20 p-4">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-black text-emerald-200">都道府県を追加（ノーコード）</h4>
            <button
              type="button"
              onClick={() => setAddPrefOpen((v) => !v)}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-800/60 px-2 py-1 text-[10px] font-bold text-emerald-100 hover:bg-emerald-700/60"
            >
              <Plus className="h-3 w-3" />
              {addPrefOpen ? "閉じる" : "行を追加"}
            </button>
          </div>
          <p className="mt-1 text-[10px] text-slate-400">
            他都道府県・他年度は、同じバージョン（{version.valid_from}）に行を追加するか、新しいバージョンを JSON
            で追加します。料率は % で入力してください。
          </p>
          {addPrefOpen ? (
            <div className="mt-3 space-y-3">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {(
                  [
                    ["prefecture_code", "支部コード（例: 27）"],
                    ["prefecture", "都道府県名"],
                    ["health_rate", "健康保険料率（%）"],
                    ["care_rate", "介護保険料率（%）"],
                    ["health_care_rate", "健保＋介護（%）"],
                    ["child_support_rate", "支援金率（%）"],
                    ["pension_rate", "厚生年金料率（%）"],
                    ["childcare_contrib_rate", "拠出金率（%）"],
                    ["source_url", "出典PDF URL"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex flex-col gap-1 text-[10px] font-bold text-slate-300">
                    {label}
                    <input
                      value={newPref[key]}
                      onChange={(e) => setNewPref((p) => ({ ...p, [key]: e.target.value }))}
                      className="rounded-lg border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-white"
                    />
                  </label>
                ))}
              </div>
              {addPrefError ? <p className="text-[11px] text-red-300">{addPrefError}</p> : null}
              <button
                type="button"
                disabled={addPrefBusy}
                onClick={() => {
                  setAddPrefBusy(true);
                  setAddPrefError(null);
                  const pct = (s: string) => Number(s) / 100;
                  void upsertRefTableRow(table.id, {
                    valid_from: version.valid_from,
                    match_key: "prefecture_code",
                    row: {
                      prefecture_code: newPref.prefecture_code.trim(),
                      prefecture: newPref.prefecture.trim(),
                      health_rate: pct(newPref.health_rate),
                      care_rate: pct(newPref.care_rate),
                      health_care_rate: pct(newPref.health_care_rate),
                      child_support_rate: pct(newPref.child_support_rate),
                      pension_rate: pct(newPref.pension_rate),
                      childcare_contrib_rate: pct(newPref.childcare_contrib_rate),
                      source_url: newPref.source_url.trim() || null,
                    },
                  })
                    .then(({ table: updated }) => {
                      onTableUpdated?.(updated);
                      setAddPrefOpen(false);
                      setAhPrefCode(newPref.prefecture_code.trim());
                    })
                    .catch((e) => setAddPrefError(e instanceof Error ? e.message : "保存に失敗しました"))
                    .finally(() => setAddPrefBusy(false));
                }}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {addPrefBusy ? "保存中…" : "保存する"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {table.id === "basic_deduction" ? (
        <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-4">
          <h4 className="mb-3 text-xs font-black text-amber-200">基礎控除の判定</h4>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-300">
              本人の合計所得（円）
              <NumInput value={basicIncome} onValueChange={setBasicIncome} className="w-44 rounded-lg border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-white" />
            </label>
          </div>
          <ResultCard
            metrics={basicResult ? [{ label: "基礎控除", value: yenStr(basicResult.amount) }] : null}
            breakdown={basicResult ? <>{String(basicResult.income_band)}</> : null}
          />
        </div>
      ) : null}

      {table.id === "spouse_deduction" ? (
        <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-4">
          <h4 className="mb-3 text-xs font-black text-amber-200">配偶者控除・配偶者特別控除</h4>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-300">
              配偶者の合計所得
              <NumInput value={spouseIncome} onValueChange={setSpouseIncome} className="w-36 rounded-lg border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-white" />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-300">
              本人の合計所得
              <NumInput value={taxpayerIncome} onValueChange={setTaxpayerIncome} className="w-36 rounded-lg border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-white" />
            </label>
            <label className="flex items-center gap-2 text-[11px] font-bold text-slate-300">
              <input type="checkbox" checked={spouseElderly} onChange={(e) => setSpouseElderly(e.target.checked)} className="h-4 w-4" />
              配偶者70歳以上
            </label>
          </div>
          <ResultCard
            metrics={
              spouseResult
                ? [{ label: String(spouseResult.kind) || "控除額", value: yenStr(spouseResult.amount) }]
                : null
            }
          />
        </div>
      ) : null}

      {table.id === "corporate_resident_percapita" ? (
        <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-4">
          <h4 className="mb-3 text-xs font-black text-amber-200">法人住民税 均等割</h4>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-300">
              資本金等の額
              <NumInput value={corpCapital} onValueChange={setCorpCapital} className="w-40 rounded-lg border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-white" />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-300">
              従業者数
              <NumInput value={corpEmployees} onValueChange={setCorpEmployees} className="w-24 rounded-lg border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-white" />
            </label>
          </div>
          <ResultCard
            metrics={
              corpPercapResult
                ? [
                    { label: "都道府県分", value: yenStr(corpPercapResult.prefecture_amount) },
                    { label: "市町村分", value: yenStr(corpPercapResult.municipal_amount) },
                    { label: "合計", value: yenStr(corpPercapResult.total) },
                  ]
                : null
            }
          />
        </div>
      ) : null}

      {table.id === "simplified_tax_deemed_rate" ? (
        <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-4">
          <h4 className="mb-3 text-xs font-black text-amber-200">簡易課税 みなし仕入控除</h4>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-300">
              事業区分
              <select value={simpType1} onChange={(e) => setSimpType1(Number(e.target.value))} className="rounded-lg border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-white">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>第{n}種</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-300">
              消費税額（円）
              <NumInput value={simpTax1} onValueChange={setSimpTax1} className="w-36 rounded-lg border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-white" />
            </label>
          </div>
          <ResultCard
            metrics={simpResult ? [{ label: "仕入控除税額", value: yenStr(simpResult.deduction) }] : null}
          />
        </div>
      ) : null}

      {table.id === "employment_income_deduction" ? (
        <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-4">
          <h4 className="mb-3 text-xs font-black text-amber-200">給与所得の計算</h4>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-300">
              給与収入（円）
              <NumInput value={eidRevenue} onValueChange={setEidRevenue} className="w-44 rounded-lg border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-white" />
            </label>
          </div>
          <ResultCard
            metrics={
              eidResult
                ? [
                    { label: "給与所得控除", value: yenStr(eidResult.deduction) },
                    { label: "給与所得", value: yenStr(eidResult.employment_income) },
                  ]
                : null
            }
          />
        </div>
      ) : null}

      {table.id === "resident_tax_excess" ? (
        <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-4">
          <h4 className="mb-3 text-xs font-black text-amber-200">個人住民税（所得割＋均等割＋超過課税）</h4>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-300">
              課税総所得（円）
              <NumInput value={rtIncome} onValueChange={setRtIncome} className="w-40 rounded-lg border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-white" />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-300">
              団体コード
              <select value={rtCode} onChange={(e) => setRtCode(e.target.value)} className="rounded-lg border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-white">
                <option value="">（超過課税なし）</option>
                {version.rows.map((r) => (
                  <option key={String(r.jurisdiction_code)} value={String(r.jurisdiction_code)}>
                    {String(r.jurisdiction)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-[11px] font-bold text-slate-300">
              <input type="checkbox" checked={rtDesignated} onChange={(e) => setRtDesignated(e.target.checked)} className="h-4 w-4" />
              政令指定都市
            </label>
          </div>
          <ResultCard
            metrics={
              rtResult
                ? [
                    { label: "所得割", value: yenStr(rtResult.income_levy) },
                    { label: "均等割", value: yenStr(rtResult.percapita_total) },
                    { label: "合計", value: yenStr(rtResult.total) },
                  ]
                : null
            }
            breakdown={rtResult && rtResult.excess_applied ? <>超過課税適用</> : null}
          />
        </div>
      ) : null}

      {table.id === "minimum_wage" ? (
        <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-4">
          <h4 className="mb-3 text-xs font-black text-amber-200">最低賃金コンプライアンス判定</h4>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-300">
              月額基本給（円）
              <NumInput value={mwSalary} onValueChange={setMwSalary} className="w-36 rounded-lg border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-white" />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-300">
              月平均所定労働時間
              <NumInput value={mwHours} onValueChange={setMwHours} min={1} className="w-28 rounded-lg border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-white" />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-300">
              都道府県
              <select value={mwPref} onChange={(e) => setMwPref(e.target.value)} className="rounded-lg border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-white">
                {version.rows.map((r) => (
                  <option key={String(r.prefecture)} value={String(r.prefecture)}>{String(r.prefecture)}</option>
                ))}
              </select>
            </label>
          </div>
          <ResultCard
            tone={mwResult ? (mwResult.compliant ? "emerald" : "red") : "amber"}
            metrics={
              mwResult
                ? [
                    { label: "換算時給", value: yenStr(mwResult.converted_hourly) },
                    {
                      label: mwResult.compliant ? "判定" : "不足額",
                      value: mwResult.compliant ? "適合" : yenStr(mwResult.shortfall),
                    },
                  ]
                : null
            }
            breakdown={mwResult ? <>最低賃金 {yenStr(mwResult.minimum_wage)}</> : null}
          />
        </div>
      ) : null}

      {table.id === "individual_business_tax" ? (
        <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-4">
          <h4 className="mb-3 text-xs font-black text-amber-200">個人事業税の計算</h4>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-300">
              事業所得（円）
              <NumInput value={ibIncome} onValueChange={setIbIncome} className="w-40 rounded-lg border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-white" />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-300">
              事業区分
              <select
                value={ibCategory || String(version.rows[0]?.category ?? "")}
                onChange={(e) => setIbCategory(e.target.value)}
                className="rounded-lg border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-white"
              >
                {version.rows.map((r) => (
                  <option key={String(r.category)} value={String(r.category)}>{String(r.category)}</option>
                ))}
              </select>
            </label>
          </div>
          <ResultCard
            metrics={ibResult ? [{ label: "事業税額", value: yenStr(ibResult.tax) }] : null}
            breakdown={
              ibResult ? (
                <>
                  課税標準 {yenStr(ibResult.taxable)}（所得 − 事業主控除290万円）× {ratePct(ibResult.rate)}
                </>
              ) : null
            }
          />
        </div>
      ) : null}

      {table.id === "dependent_deduction" ? (
        <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-4">
          <h4 className="mb-3 text-xs font-black text-amber-200">扶養控除の計算</h4>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-300">
              区分
              <select
                value={depCategory || String(version.rows[0]?.category ?? "")}
                onChange={(e) => setDepCategory(e.target.value)}
                className="rounded-lg border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-white"
              >
                {version.rows.map((r) => (
                  <option key={String(r.category)} value={String(r.category)}>{String(r.category)}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-300">
              人数
              <NumInput value={depCount} onValueChange={setDepCount} min={1} className="w-24 rounded-lg border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-white" />
            </label>
          </div>
          <ResultCard
            metrics={depResult ? [{ label: "控除額合計", value: yenStr(depResult.total) }] : null}
            breakdown={
              depResult ? (
                <>
                  1人 {yenStr(depResult.amount)} × {Math.max(0, depCount)}人
                </>
              ) : null
            }
          />
        </div>
      ) : null}

      {/* 表本体 */}
      <div className="max-h-[480px] overflow-auto rounded-xl border border-slate-700 bg-slate-900/80">
        <table className="min-w-full border-collapse text-left text-[10px] text-slate-300">
          <thead className="sticky top-0 z-10 bg-slate-800 text-[9px] font-black uppercase text-slate-400">
            <tr>
              {version.columns.map((col) => (
                <th
                  key={col.key}
                  className={`border-b border-slate-700 px-2 py-1.5 ${
                    highlightCol(col.key) ? "bg-amber-700/40 text-amber-100" : ""
                  }`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {version.rows.map((row, ri) => {
              const hit = highlightRow(row);
              return (
                <tr
                  key={ri}
                  ref={hit ? matchedRowRef : undefined}
                  className={
                    hit
                      ? "bg-amber-500/25 font-bold text-amber-100 ring-1 ring-inset ring-amber-400/60"
                      : "odd:bg-slate-900/40"
                  }
                >
                  {version.columns.map((col) => {
                    const colHit = highlightCol(col.key);
                    const cross = hit && colHit;
                    return (
                      <td
                        key={col.key}
                        className={`border-b border-slate-800/60 px-2 py-1 tabular-nums ${
                          cross
                            ? "bg-amber-400/40 text-white ring-1 ring-inset ring-amber-300"
                            : colHit
                              ? "bg-amber-500/15"
                              : ""
                        }`}
                      >
                        {formatRefCell(row[col.key], col.type)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {table.notes.length > 0 ? (
        <ul className="space-y-1 rounded-xl border border-slate-700 bg-slate-900/60 p-3 text-[10px] text-slate-400">
          {table.notes.map((n, i) => (
            <li key={i}>・{n}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
