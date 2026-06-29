/** ショートカットを奪わない入力要素かどうか */
export function shouldIgnoreShortcutTarget(event: KeyboardEvent): boolean {
  const el = event.target;
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return Boolean(el.closest("[data-shortcut-ignore='true']"));
}

export function isModKey(event: KeyboardEvent): boolean {
  return event.metaKey || event.ctrlKey;
}

export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform);
}

export function modLabel(): string {
  return isMacPlatform() ? "⌘" : "Ctrl";
}

export function formatShortcutParts(parts: string[]): string {
  const mod = modLabel();
  return parts
    .map((p) => {
      if (p === "Mod") return mod;
      if (p === "Shift") return "Shift";
      if (p === "Alt") return isMacPlatform() ? "⌥" : "Alt";
      return p;
    })
    .join(" + ");
}

export type ShortcutMatch = {
  key: string;
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
};

export function matchesShortcut(event: KeyboardEvent, spec: ShortcutMatch): boolean {
  const key = event.key.toLowerCase();
  const want = spec.key.toLowerCase();
  if (key !== want) return false;
  if (spec.mod && !isModKey(event)) return false;
  if (!spec.mod && isModKey(event)) return false;
  if (Boolean(spec.shift) !== event.shiftKey) return false;
  if (Boolean(spec.alt) !== event.altKey) return false;
  return true;
}
