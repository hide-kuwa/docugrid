"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";

import { useGridDnd } from "../../hooks/useGridDnd";
import { useDocugridStore } from "../../state/docugrid-store";

import { SortablePage } from "./SortablePage";

export function PageGrid() {
  const pageOrder = useDocugridStore((s) => s.pageOrder);
  const { handleDragEnd } = useGridDnd();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  if (pageOrder.length === 0) {
    return null;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={pageOrder} strategy={rectSortingStrategy}>
        <section className="border-t border-slate-200 bg-slate-50/95 px-4 py-3">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            ページ順（ドラッグで並べ替え）
          </div>
          <div className="flex flex-wrap gap-3">
            {pageOrder.map((pageId) => (
              <SortablePage key={pageId} id={pageId} />
            ))}
          </div>
        </section>
      </SortableContext>
    </DndContext>
  );
}
