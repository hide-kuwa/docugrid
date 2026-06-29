"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckSquare, Loader2 } from "lucide-react";
import { fetchReviewChecklistCatalog } from "@/features/review-checklist/review-checklist-api";
import { ReviewChecklistTemplateEditor } from "@/features/review-checklist/ReviewChecklistTemplateEditor";
import type { ReviewChecklistCatalog } from "@/features/review-checklist/review-checklist-api";
import { hasPermission } from "@/lib/authorization";
import type { DocugridUser } from "@/lib/auth";

type Props = {
  currentUser: DocugridUser | null;
};

export function ReviewChecklistSettingsPanel({ currentUser }: Props) {
  const canEdit = hasPermission(currentUser, "settings.manage");
  const [catalog, setCatalog] = useState<ReviewChecklistCatalog | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchReviewChecklistCatalog();
      setCatalog(data);
      setSelectedId((prev) => prev ?? data.defaultTemplateId);
    } catch {
      setMessage("チェックリスト一覧の読み込みに失敗しました。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        読み込み中…
      </div>
    );
  }

  if (!catalog) {
    return <p className="text-sm text-red-600">一覧を取得できませんでした。</p>;
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-violet-700">
          <CheckSquare className="h-5 w-5" />
          <h2 className="text-lg font-bold text-slate-800">監査チェックリスト管理</h2>
        </div>
        <p className="text-sm text-slate-600">
          複数種類のチェックリストを登録できます。公式（HRE標準）は複製してから項目の追加・削除が可能です。
          {canEdit ? " 編集権限: settings.manage（事務所長相当）" : ""}
        </p>
      </header>

      <ReviewChecklistTemplateEditor
        catalog={catalog}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onCatalogChange={() => void reload()}
        currentUser={currentUser}
      />

      <p className="text-xs text-slate-500">
        実行時は <strong>/checklist</strong> でチェックリスト種類を選んで使用します。
      </p>
      {message && <p className="text-sm text-slate-600">{message}</p>}
    </div>
  );
}
