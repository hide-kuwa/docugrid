"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

import { SyncStatusBadge } from "../SyncStatusBadge";
import type { PageId } from "../../schema/ids";
import { useDocugridStore } from "../../state/docugrid-store";

type Props = { id: PageId };

export function SortablePage({ id }: Props) {
  const page = useDocugridStore((s) => s.pagesById[id]);
  const fileMeta = useDocugridStore((s) => (page ? s.filesById[page.fileId] : undefined));

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  if (!page) {
    return null;
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative flex min-w-[7rem] max-w-[10rem] flex-col rounded-lg border border-slate-200 bg-white p-2 shadow-sm ${
        isDragging ? "z-10 opacity-90 ring-2 ring-blue-400" : ""
      }`}
    >
      {fileMeta && <SyncStatusBadge status={fileMeta.syncStatus ?? "idle"} />}
      <div className="flex items-start gap-1">
        <button
          type="button"
          className="-m-1 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="ドラッグして並べ替え"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4 shrink-0" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[10px] font-medium text-slate-500" title={fileMeta?.name}>
            {fileMeta?.name ?? "—"}
          </div>
          <div className="text-sm font-bold text-slate-800">ページ {page.originalIndex + 1}</div>
        </div>
      </div>
    </div>
  );
}
