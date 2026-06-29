"use client";

import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { ReviewChecklistRunner } from "@/features/review-checklist/ReviewChecklistRunner";
import type { DocugridUser } from "@/lib/auth";

type Props = {
  clientId: string;
  periodKey: string;
  periodLabel: string;
  templateId?: string;
  clientName?: string;
  user: DocugridUser | null;
};

export function ReviewChecklistWidget({
  clientId,
  periodKey,
  periodLabel,
  templateId,
  clientName,
  user,
}: Props) {
  const qs = new URLSearchParams({
    client: clientId,
    period: periodKey,
  });
  if (templateId) qs.set("template", templateId);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">{periodLabel}</p>
        <Link
          href={`/checklist?${qs.toString()}`}
          className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-bold text-violet-800 hover:bg-violet-100"
        >
          <ClipboardCheck className="h-3.5 w-3.5" />
          全画面で開く
        </Link>
      </div>
      <ReviewChecklistRunner
        clientId={clientId}
        periodKey={periodKey}
        templateId={templateId}
        clientName={clientName}
        user={user}
        compact
      />
    </div>
  );
}
