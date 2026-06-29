import { useEffect, useRef } from "react";
import { matchesShortcut, shouldIgnoreShortcutTarget, type ShortcutMatch } from "@/lib/keyboard";

export type KeyboardShortcutBinding = ShortcutMatch & {
  id: string;
  handler: () => void;
  when?: () => boolean;
  allowInInput?: boolean;
};

export function useKeyboardShortcuts(
  bindings: KeyboardShortcutBinding[],
  enabled = true,
): void {
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      for (const binding of bindingsRef.current) {
        if (binding.when && !binding.when()) continue;
        if (!binding.allowInInput && shouldIgnoreShortcutTarget(event)) continue;
        if (!matchesShortcut(event, binding)) continue;
        event.preventDefault();
        event.stopPropagation();
        binding.handler();
        return;
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [enabled]);
}
