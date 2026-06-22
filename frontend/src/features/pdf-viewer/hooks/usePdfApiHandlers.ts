/** PDF ビューア API ハンドラ（カタログ等の軽量プレビュー用）。 */

import { useCallback } from "react";
import { API_ENDPOINTS } from "@/config/api";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";
import type { NormPoint, NormRect, ToolType } from "@/features/pdf-viewer/types";

export function usePdfApiHandlers(file: File | null, clientId?: string) {
  const headers = useCallback(() => buildAuthHeaders(clientId), [clientId]);

  const handleRenderPage = useCallback(
    async (pageIdx: number, fileOverride?: File) => {
      const target = fileOverride ?? file;
      if (!target) return null;
      try {
        const form = new FormData();
        form.append("file", target);
        form.append("page", String(pageIdx));
        const res = await authFetch(API_ENDPOINTS.RENDER_PAGE, {
          method: "POST",
          body: form,
          headers: headers(),
        });
        if (!res.ok) return null;
        const blob = await res.blob();
        return URL.createObjectURL(blob);
      } catch {
        return null;
      }
    },
    [file, headers],
  );

  const handleGetThumbnails = useCallback(async () => {
    if (!file) return [];
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await authFetch(API_ENDPOINTS.THUMBNAILS, {
        method: "POST",
        body: form,
        headers: headers(),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { thumbnails?: string[] };
      return data.thumbnails ?? [];
    } catch {
      return [];
    }
  }, [file, headers]);

  const noopHighlight = useCallback(
    async (
      _type: ToolType,
      _page: number,
      _rect: NormRect,
      _opts?: { file?: File; updatePrimary?: boolean; path?: NormPoint[] },
    ) => undefined,
    [],
  );

  const noopReorder = useCallback(async () => undefined, []);
  const noopMerge = useCallback(async () => undefined, []);

  return {
    handleRenderPage,
    handleGetThumbnails,
    handleHighlight: noopHighlight,
    handleReorder: noopReorder,
    handleMerge: noopMerge,
  };
}
