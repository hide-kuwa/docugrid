"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE } from "@/config/api";
import { authFetch } from "@/lib/api-auth";

export type MigrationPendingItem = {
  id: string;
  jobId: string;
  sourcePath: string;
  fileName: string;
  byteSize: number;
  suggestedClientId?: string | null;
  clientMatchConfidence: number;
  suggestedPeriodKey?: string | null;
  periodMatchConfidence: number;
  suggestedSlotId?: string | null;
  suggestedType?: string | null;
  slotLabel?: string | null;
  confidence: number;
  engine: string;
  createdAt?: string;
};

export type MigrationWallet = {
  tokenBalance: number;
  tokensUsed: number;
  defaultIncluded: number;
  balanceYenEstimate?: number;
  usedYenEstimate?: number;
  yenPerPack?: number;
  tokensPerPack?: number;
  tokensPer100Yen?: number;
  estimateTokensPerPdf?: number;
  label?: string;
  hint?: string;
};

export type MigrationEstimate = {
  pdfCount: number;
  visionCapable?: boolean;
  estimatedTokens: number;
  estimatedTokensLow: number;
  estimatedTokensHigh: number;
  estimatedYen: number;
  estimatedYenLow: number;
  estimatedYenHigh: number;
  estimateTokensPerPdf?: number;
};

export type MigrationJob = {
  id: string;
  status: string;
  sourceName?: string;
  totalFiles: number;
  processed: number;
  autoPlaced: number;
  pendingCount: number;
  failed: number;
  estimatedTokens: number;
  estimatedTokensLow: number;
  estimatedTokensHigh: number;
  estimatedYen: number;
  tokensUsed: number;
  actualYen: number;
  error?: string;
  createdAt?: string;
  finishedAt?: string;
};

export type MigrationStatus = {
  wallet: MigrationWallet;
  pendingCount: number;
  aliasCount: number;
  autoPlaceThreshold: number;
  learningScope?: {
    scope: string;
    firmLocal: boolean;
    globalDocTypePool: boolean;
    globalContributorFirmIds: string[];
    isGlobalContributor: boolean;
    globalAliasCount: number;
    note: string;
  };
  privacy?: {
    stored: string[];
    notStored: string[];
    learningScope: string;
    learningScopeNote: string;
  };
};

export function useMigrationIngest(enabled: boolean) {
  const [status, setStatus] = useState<MigrationStatus | null>(null);
  const [pending, setPending] = useState<MigrationPendingItem[]>([]);
  const [recentJobs, setRecentJobs] = useState<MigrationJob[]>([]);
  const [estimate, setEstimate] = useState<MigrationEstimate | null>(null);
  const [activeJob, setActiveJob] = useState<MigrationJob | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isEstimating, setIsEstimating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchClientId, setBatchClientId] = useState("");
  const [batchPeriodKey, setBatchPeriodKey] = useState("year:1");
  const [batchSlotId, setBatchSlotId] = useState("");
  const [freePassNoVision, setFreePassNoVision] = useState(true);
  const [folderPrefix, setFolderPrefix] = useState("");
  const [isReclassifying, setIsReclassifying] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearPoll = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const loadJobs = useCallback(async () => {
    const res = await authFetch(`${API_BASE}/migration/jobs?limit=8`);
    if (res.ok) {
      const data = await res.json();
      setRecentJobs(data.jobs ?? []);
    }
  }, []);

  const load = useCallback(async () => {
    if (!enabled) return;
    setIsLoading(true);
    try {
      const statusRes = await authFetch(`${API_BASE}/migration/status`);
      if (statusRes.ok) {
        setStatus(await statusRes.json());
      }
      const pendingRes = await authFetch(`${API_BASE}/migration/pending`);
      if (pendingRes.ok) {
        const data = await pendingRes.json();
        setPending(data.items ?? []);
      }
      await loadJobs();
    } finally {
      setIsLoading(false);
    }
  }, [enabled, loadJobs]);

  useEffect(() => {
    void load();
    return () => clearPoll();
  }, [load]);

  const pollJob = (jobId: string) => {
    clearPoll();
    pollRef.current = setInterval(async () => {
      const res = await authFetch(`${API_BASE}/migration/jobs/${jobId}`);
      if (!res.ok) return;
      const job = (await res.json()) as MigrationJob;
      setActiveJob(job);
      if (job.status === "completed" || job.status === "failed") {
        clearPoll();
        await load();
        setMessage(
          job.status === "completed"
            ? `完了: 見積 ${job.estimatedTokens.toLocaleString()} トークン → 実消費 ${job.tokensUsed.toLocaleString()} トークン`
            : `失敗: ${job.error ?? "unknown"}`,
        );
      }
    }, 2000);
  };

  const estimateZip = async (file: File | null) => {
    if (!file) return;
    setIsEstimating(true);
    setEstimate(null);
    setMessage("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await authFetch(`${API_BASE}/migration/estimate`, {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.detail ?? "見積の取得に失敗しました。");
        return;
      }
      setEstimate({
        pdfCount: data.pdfCount ?? 0,
        visionCapable: data.visionCapable,
        estimatedTokens: data.estimatedTokens ?? 0,
        estimatedTokensLow: data.estimatedTokensLow ?? 0,
        estimatedTokensHigh: data.estimatedTokensHigh ?? 0,
        estimatedYen: data.estimatedYen ?? 0,
        estimatedYenLow: data.estimatedYenLow ?? 0,
        estimatedYenHigh: data.estimatedYenHigh ?? 0,
        estimateTokensPerPdf: data.estimateTokensPerPdf,
      });
    } catch {
      setMessage("見積の取得に失敗しました。");
    } finally {
      setIsEstimating(false);
    }
  };

  const uploadZip = async (file: File | null, visionMode: string = "auto") => {
    if (!file) return;
    setMessage("");
    setIsUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("vision_mode", visionMode);
      const res = await authFetch(`${API_BASE}/migration/ingest`, {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.detail ?? "ZIP の送信に失敗しました。");
        return;
      }
      if (data.estimate) {
        setEstimate({
          pdfCount: data.estimate.pdfCount ?? 0,
          estimatedTokens: data.estimate.estimatedTokens ?? 0,
          estimatedTokensLow: data.estimate.estimatedTokensLow ?? 0,
          estimatedTokensHigh: data.estimate.estimatedTokensHigh ?? 0,
          estimatedYen: data.estimate.estimatedYen ?? 0,
          estimatedYenLow: data.estimate.estimatedYenLow ?? 0,
          estimatedYenHigh: data.estimate.estimatedYenHigh ?? 0,
        });
      }
      if (data.jobId) {
        pollJob(data.jobId);
      }
      setMessage(data.message ?? "取り込みを開始しました。");
    } catch {
      setMessage("ZIP の送信に失敗しました。");
    } finally {
      setIsUploading(false);
    }
  };

  const handleZipSelected = async (file: File | null) => {
    if (!file) return;
    const mode = freePassNoVision ? "off" : "auto";
    await estimateZip(file);
    await uploadZip(file, mode);
  };

  const reclassifySelected = async () => {
    if (!selectedIds.length && !folderPrefix.trim()) {
      setMessage("再分類するファイルを選ぶか、フォルダ接頭辞を入力してください。");
      return;
    }
    setIsReclassifying(true);
    setMessage("");
    try {
      const res = await authFetch(`${API_BASE}/migration/pending/reclassify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_ids: selectedIds,
          source_path_prefix: folderPrefix.trim() || undefined,
          vision_mode: "on",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(typeof data.detail === "string" ? data.detail : "再分類に失敗しました。");
        return;
      }
      setMessage(
        `Vision 再分類: ${data.updated ?? 0} 件 · 消費 ${(data.tokensUsed ?? 0).toLocaleString()} トークン`,
      );
      await load();
    } catch {
      setMessage("再分類に失敗しました。");
    } finally {
      setIsReclassifying(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const batchConfirm = async () => {
    if (!batchClientId || !batchPeriodKey || !batchSlotId || selectedIds.length === 0) {
      setMessage("顧問先・期間・スロットとファイルを選んでください。");
      return;
    }
    setIsConfirming(true);
    setMessage("");
    try {
      const res = await authFetch(`${API_BASE}/migration/pending/batch-confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_ids: selectedIds,
          client_id: batchClientId,
          period_key: batchPeriodKey,
          slot_id: batchSlotId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(typeof data.detail === "string" ? data.detail : "一括確定に失敗しました。");
        return;
      }
      setMessage(`確定 ${data.confirmed ?? 0} 件`);
      setSelectedIds([]);
      await load();
    } catch {
      setMessage("一括確定に失敗しました。");
    } finally {
      setIsConfirming(false);
    }
  };

  return {
    status,
    pending,
    recentJobs,
    estimate,
    activeJob,
    isLoading,
    isEstimating,
    isUploading,
    isConfirming,
    message,
    selectedIds,
    setSelectedIds,
    batchClientId,
    setBatchClientId,
    batchPeriodKey,
    setBatchPeriodKey,
    batchSlotId,
    setBatchSlotId,
    freePassNoVision,
    setFreePassNoVision,
    folderPrefix,
    setFolderPrefix,
    isReclassifying,
    handleZipSelected,
    estimateZip,
    uploadZip,
    toggleSelect,
    batchConfirm,
    reclassifySelected,
    reload: load,
  };
}
