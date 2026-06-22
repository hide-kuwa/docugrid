import type { DragEndEvent } from "@dnd-kit/core";

import { asPageId } from "../schema/ids";
import { useDocugridStore } from "../state/docugrid-store";

export function useGridDnd() {
  const reorderPages = useDocugridStore((state) => state.reorderPages);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      reorderPages(asPageId(String(active.id)), asPageId(String(over.id)));
    }
  };

  return { handleDragEnd };
}
