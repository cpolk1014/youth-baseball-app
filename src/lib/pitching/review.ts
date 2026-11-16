// Coaches' pitch counts waiting for a parent's OK (pure). A coach's box score (or typed
// count) for a game the kid pitched shows up once; the parent approves it (it becomes a
// session) or says no. If the coach changes the count later, it comes back.
import type { PitchSession } from "./rest";

/** One coach line where the kid pitched. */
export interface CoachCount {
  /** The box score line's id. */
  statId: string;
  gameId: string | null;
  date: string;
  opponent: string;
  teamName: string | null;
  pitches: number;
  strikes: number | null;
}

export interface Dismissal {
  statId: string;
  pitches: number;
}

export interface PendingCount {
  count: CoachCount;
  /**
   * "new": nothing for this game yet. "yours": the parent already logged this game (or a game
   * that day) themselves. "changed": they approved it before and the coach changed the count.
   */
  reason: "new" | "yours" | "changed";
  /** The parent's session it would replace, for "yours" and "changed". */
  existing: PitchSession | null;
}

export function pendingCounts(
  counts: CoachCount[],
  sessions: PitchSession[],
  dismissals: Dismissal[],
): PendingCount[] {
  const out: PendingCount[] = [];
  for (const c of counts) {
    if (c.pitches <= 0) continue;
    if (dismissals.some((d) => d.statId === c.statId && d.pitches === c.pitches)) continue;
    const approved = sessions.find((s) => s.statId === c.statId);
    if (approved) {
      if (approved.pitches !== c.pitches)
        out.push({ count: c, reason: "changed", existing: approved });
      continue;
    }
    // The parent logged this game (or, without a game picked, a game that day) themselves.
    const yours =
      sessions.find((s) => !s.statId && c.gameId !== null && s.gameId === c.gameId) ??
      sessions.find((s) => !s.statId && s.kind === "game" && !s.gameId && s.date === c.date) ??
      null;
    out.push({ count: c, reason: yours ? "yours" : "new", existing: yours });
  }
  return out.sort((a, b) => b.count.date.localeCompare(a.count.date));
}
