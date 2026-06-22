"use client";

import { CaptureCard } from "@/features/capture/components/CaptureCard";
import type { CaptureItem } from "@/features/capture/types";

type Props = {
  items: CaptureItem[];
  clientId: string;
  onConfirm?: (item: CaptureItem) => void;
  onRouted?: (item: CaptureItem) => void;
};

export function MasonryGallery({ items, clientId, onConfirm, onRouted }: Props) {
  if (items.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-16 text-sm text-slate-500">
        まだ資料がありません。上のエリアから撮影してください。
      </div>
    );
  }

  const pinned = items.filter((i) => i.pinned || i.status === "needs_review");
  const rest = items.filter((i) => !i.pinned && i.status !== "needs_review");

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      {pinned.length > 0 ? (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-rose-600">
            要確認・ピン留め ({pinned.length})
          </h3>
          <div className="capture-masonry columns-2 gap-4 sm:columns-3 lg:columns-4">
            {pinned.map((item) => (
              <CaptureCard
                key={item.id}
                item={item}
                clientId={clientId}
                onConfirm={onConfirm}
                onRouted={onRouted}
              />
            ))}
          </div>
        </section>
      ) : null}
      <section className="flex-1">
        {pinned.length > 0 ? (
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            すべての資料
          </h3>
        ) : null}
        <div className="capture-masonry columns-2 gap-4 sm:columns-3 lg:columns-4">
          {rest.map((item) => (
            <CaptureCard
              key={item.id}
              item={item}
              clientId={clientId}
              onConfirm={onConfirm}
              onRouted={onRouted}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
