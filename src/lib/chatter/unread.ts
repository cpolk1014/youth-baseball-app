// How many new posts wait in Chatter and Coach Chatter, for the menu badges and the app icon.
// One small store the whole app reads; refreshed by UnreadWatcher and after reading a feed.
import { useSyncExternalStore } from "react";

export interface UnreadCounts {
  /** The open team's Team channel. */
  chatter: number;
  /** The open team's Parents channel. */
  parents: number;
  coach: number;
}

let counts: UnreadCounts = { chatter: 0, parents: 0, coach: 0 };
const listeners = new Set<() => void>();
const ZERO: UnreadCounts = { chatter: 0, parents: 0, coach: 0 };

export function setUnread(next: Partial<UnreadCounts>): void {
  const merged = { ...counts, ...next };
  if (
    merged.chatter === counts.chatter &&
    merged.parents === counts.parents &&
    merged.coach === counts.coach
  ) {
    return;
  }
  counts = merged;
  for (const l of listeners) l();
}

/**
 * The number on the home-screen icon, where the phone supports it: everything unread across
 * all the person's teams and clubs (notifications set it too while the app is closed).
 */
export function setIconCount(total: number): void {
  const nav = typeof navigator !== "undefined" ? navigator : null;
  try {
    if (nav && "setAppBadge" in nav) {
      void (total > 0 ? nav.setAppBadge(total) : nav.clearAppBadge()).catch(() => undefined);
    }
  } catch {
    // Not supported here.
  }
}

export function useUnread(): UnreadCounts {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => counts,
    () => ZERO,
  );
}

/** "9+" past nine, so the badge stays small. */
export const badgeText = (n: number): string => (n > 9 ? "9+" : String(n));

let refresher: (() => void) | null = null;
/** UnreadWatcher registers how to load the counts; screens call refreshUnread after reading. */
export function setUnreadRefresher(fn: (() => void) | null): void {
  refresher = fn;
}
export function refreshUnread(): void {
  refresher?.();
}
