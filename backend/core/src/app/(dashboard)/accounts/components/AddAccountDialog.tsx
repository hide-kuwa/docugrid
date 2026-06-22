"use client";

import { FormEvent, useEffect, useState } from "react";

import { Button } from "../../../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../../components/ui/dialog";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";

export type NewAccountPayload = {
  code: string;
  name: string;
  category: string;
};

interface AddAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: NewAccountPayload) => Promise<void>;
}

export function AddAccountDialog({
  open,
  onOpenChange,
  onSubmit,
}: AddAccountDialogProps) {
  const [form, setForm] = useState<NewAccountPayload>({
    code: "",
    name: "",
    category: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setForm({ code: "", name: "", category: "" });
      setIsSubmitting(false);
      setError(null);
    }
  }, [open]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.code || !form.name || !form.category) {
      setError("すべての項目を入力してください。");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onSubmit(form);
      onOpenChange(false);
    } catch (submissionError) {
      console.error(submissionError);
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "登録処理でエラーが発生しました。"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-md">
        <DialogHeader>
          <DialogTitle>勘定科目の新規登録</DialogTitle>
        </DialogHeader>
        <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="account-code">科目コード</Label>
            <Input
              id="account-code"
              value={form.code}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, code: event.target.value }))
              }
              placeholder="例: 1000"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="account-name">科目名</Label>
            <Input
              id="account-name"
              value={form.name}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, name: event.target.value }))
              }
              placeholder="例: 現金"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="account-category">区分</Label>
            <Input
              id="account-category"
              value={form.category}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, category: event.target.value }))
              }
              placeholder="例: 資産"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              キャンセル
            </button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "保存中…" : "保存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
