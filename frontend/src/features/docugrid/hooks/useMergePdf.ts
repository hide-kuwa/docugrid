import { useCallback, useRef, useState } from "react";

import { API_ENDPOINTS } from "@/config/api";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";

import { buildOrderPayloadFromDocugridState } from "../lib/build-order-payload";
import { useDocugridStore } from "../state/docugrid-store";

export type MergePdfResult =
  | { ok: true; blob: Blob }
  | { ok: false; error: string };

export type UseMergePdfOptions = {
  /** 既定: `API_ENDPOINTS.MERGE_ORDERED` */
  mergeUrl?: string;
  downloadFilename?: string;
  /** FormData 送信時は Content-Type を付けないこと（boundary 任せ） */
  buildHeaders?: () => HeadersInit;
  /** ダウンロード成功後のコールバック（監査イベント等） */
  onExportSuccess?: () => void;
};

function triggerBrowserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * OrderPayload + 同一順の PDF ファイル群を multipart で送り、結合 PDF Blob を返す。
 * 現行バックエンドは `order`（JSON 文字列）・`file_ids`（JSON 配列）・`files`（複数パート）を受け取る。
 */
export function useMergePdf(options: UseMergePdfOptions = {}) {
  const mergeUrl = options.mergeUrl ?? API_ENDPOINTS.MERGE_ORDERED;
  const downloadFilename = options.downloadFilename ?? "merged-ordered.pdf";
  const [isMerging, setIsMerging] = useState(false);
  const mergeLockRef = useRef(false);

  const mergeFromStore = useCallback(
    async (download: boolean = true): Promise<MergePdfResult> => {
      if (mergeLockRef.current) {
        return { ok: false, error: "結合処理中です" };
      }
      mergeLockRef.current = true;
      setIsMerging(true);
      try {
        const state = useDocugridStore.getState();
        if (state.pageOrder.length === 0) {
          return { ok: false, error: "pageOrder が空です" };
        }

        const payload = buildOrderPayloadFromDocugridState(state);
        const fileIds = state.fileOrder.slice();

        if (fileIds.length === 0) {
          return { ok: false, error: "fileOrder が空です" };
        }

        const files: File[] = [];
        for (const id of fileIds) {
          const f = state.localFilesById[id];
          if (!f) {
            return { ok: false, error: `ローカルファイルが見つかりません: ${id}` };
          }
          files.push(f);
        }

        const formData = new FormData();
        formData.append("order", JSON.stringify(payload));
        formData.append("file_ids", JSON.stringify(fileIds));
        for (const f of files) {
          formData.append("files", f);
        }

        const headers = options.buildHeaders?.() ?? buildAuthHeaders();

        const res = await authFetch(mergeUrl, {
          method: "POST",
          body: formData,
          headers,
        });

        if (!res.ok) {
          let detail = res.statusText;
          try {
            const j = (await res.json()) as { message?: string; detail?: unknown };
            detail = j.message ?? (typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail));
          } catch {
            detail = await res.text();
          }
          return { ok: false, error: detail || `HTTP ${res.status}` };
        }

        const blob = await res.blob();
        if (download) {
          triggerBrowserDownload(blob, downloadFilename);
          options.onExportSuccess?.();
        }
        return { ok: true, blob };
      } finally {
        mergeLockRef.current = false;
        setIsMerging(false);
      }
    },
    [mergeUrl, downloadFilename, options.buildHeaders, options.onExportSuccess],
  );

  return { mergeFromStore, isMerging };
}
