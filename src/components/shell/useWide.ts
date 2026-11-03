"use client";

import { useSyncExternalStore } from "react";

/** Whether the screen is at least `px` wide (false while rendering on the server). */
export function useMinWidth(px: number): boolean {
  const query = `(min-width: ${px}px)`;
  return useSyncExternalStore(
    (onChange) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", onChange);
      return () => m.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
