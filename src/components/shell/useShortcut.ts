"use client";

import { useEffect, useEffectEvent } from "react";

/**
 * A one-key shortcut (e.g. "n" for a new game) for keyboards. Ignored while typing in a
 * box, with Ctrl/⌘/Alt held, or while a dialog or sheet is open.
 */
export function useShortcut(key: string, run: () => void, enabled = true) {
  const fire = useEffectEvent(run);
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== key || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)))
        return;
      if (document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      fire();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [key, enabled]);
}

/** The same, as a component, for screens that render before their data loads. */
export function Shortcut({
  keyName,
  run,
  enabled = true,
}: {
  keyName: string;
  run: () => void;
  enabled?: boolean;
}) {
  useShortcut(keyName, run, enabled);
  return null;
}
