// The Home dashboard's numbers, worked out from the team's data (pure: no I/O, no React).
import { awardsToPick, pickText } from "@/lib/club/awards";
import { isCoach } from "@/lib/data/permissions";
import { gameContext, gameResult, splitGames, whenText, type GameResult } from "@/lib/data/game";
import type { AppData, Game, Practice } from "@/lib/data/types";
import { homeworkStatus } from "@/lib/plays/homework";
import { validateLineup } from "@/lib/rules/validate";

export type StatusTone = "win" | "loss" | "tie" | "final" | "none" | "block" | "warn" | "ready";

/** A game's badge: its result once final, otherwise how its lineup stands. */
export function lineupStatus(data: AppData, game: Game): { text: string; tone: StatusTone } {
  if (game.status === "final") {
    const result = gameResult(game);
    if (!result) return { text: "Final", tone: "final" };
    const tone = result === "W" ? "win" : result === "L" ? "loss" : "tie";
    return { text: `${result} ${game.scoreUs}–${game.scoreThem}`, tone };
  }
  const ctx = gameContext(data, game.id);
  if (!ctx?.hasSavedLineup) return { text: "No lineup yet", tone: "none" };
  const violations = validateLineup(
    data.players,
    ctx.lineup,
    ctx.config,
    ctx.history,
    ctx.previous,
  );
  const blocks = violations.filter((v) => v.severity === "block").length;
  if (blocks > 0) return { text: `${blocks} to fix`, tone: "block" };
  if (violations.length > 0) {
    const n = violations.length;
    return { text: `Ready · ${n} warning${n === 1 ? "" : "s"}`, tone: "warn" };
  }
  return { text: "Lineup ready", tone: "ready" };
}

export interface SeasonRecord {
  wins: number;
  losses: number;
  ties: number;
  runsFor: number;
  runsAgainst: number;
  /** The current run of the same result ("Won 3"), from the latest game back. */
  streak: { result: GameResult; length: number } | null;
  /** Up to the last five results, oldest first. */
  lastFive: GameResult[];
}

/** Record, runs and streak from final games with both scores entered. */
export function seasonRecord(games: Game[]): SeasonRecord {
  const scored = splitGames(games).final.filter((g) => gameResult(g) !== null); // newest first
  const results = scored.map((g) => gameResult(g)!);
  let streak: SeasonRecord["streak"] = null;
  if (results.length > 0) {
    const first = results[0]!;
    let length = 0;
    while (length < results.length && results[length] === first) length++;
    streak = { result: first, length };
  }
  return {
    wins: results.filter((r) => r === "W").length,
    losses: results.filter((r) => r === "L").length,
    ties: results.filter((r) => r === "T").length,
    runsFor: scored.reduce((n, g) => n + (g.scoreUs ?? 0), 0),
    runsAgainst: scored.reduce((n, g) => n + (g.scoreThem ?? 0), 0),
    streak,
    lastFive: results.slice(0, 5).reverse(),
  };
}

export type Upcoming =
  | { kind: "game"; date: string; time: string | null; game: Game }
  | { kind: "practice"; date: string; time: string | null; practice: Practice };

/** Games still to play and practices from today on, soonest first. */
export function comingUp(
  games: Game[],
  practices: Practice[],
  today: string,
  limit = 6,
): Upcoming[] {
  const items: Upcoming[] = [
    ...games
      .filter((g) => g.status !== "final" && g.date >= today)
      .map((g) => ({ kind: "game" as const, date: g.date, time: g.startTime, game: g })),
    ...practices
      .filter((p) => !p.canceled && p.date >= today)
      .map((p) => ({ kind: "practice" as const, date: p.date, time: p.startTime, practice: p })),
  ];
  const key = (x: Upcoming) => `${x.date}T${x.time ?? "99:99"}`;
  return items.sort((a, b) => key(a).localeCompare(key(b))).slice(0, limit);
}

export interface Todo {
  key: string;
  text: string;
  href: string;
  /** "urgent" (red), "soon" (amber) or "info". */
  level: "urgent" | "soon" | "info";
}

const DAY = 86400000;
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY);

/**
 * What the coaches should do next: lineups to set or fix for the next two weeks, past
 * games to mark final, uniforms for this week's games, homework families haven't done.
 */
export function coachTodos(data: AppData, today: string, limit = 6): Todo[] {
  const todos: Todo[] = [];
  const { upcoming } = splitGames(data.games);
  for (const g of upcoming) {
    if (g.date < today) {
      todos.push({
        key: `final-${g.id}`,
        text: `Mark vs ${g.opponent} final (${whenText(g.date, today)})`,
        href: `/games/${g.id}`,
        level: "soon",
      });
      continue;
    }
    const days = daysBetween(today, g.date);
    if (days > 14) continue;
    const status = lineupStatus(data, g);
    const when = whenText(g.date, today);
    if (status.tone === "none") {
      todos.push({
        key: `lineup-${g.id}`,
        text: `Set the lineup for vs ${g.opponent} (${when})`,
        href: `/games/${g.id}`,
        level: days <= 2 ? "urgent" : "soon",
      });
    } else if (status.tone === "block") {
      todos.push({
        key: `fix-${g.id}`,
        text: `Fix the vs ${g.opponent} lineup: ${status.text} (${when})`,
        href: `/games/${g.id}`,
        level: "urgent",
      });
    }
    if (days <= 7 && !g.uniform && data.uniforms.length > 0) {
      todos.push({
        key: `uniform-${g.id}`,
        text: `Pick a uniform for vs ${g.opponent} (${when})`,
        href: `/games/${g.id}`,
        level: "info",
      });
    }
  }
  for (const a of data.assignments) {
    if (a.dueDate && a.dueDate < today) continue;
    const s = homeworkStatus(a, data.quizResults, data.members, data.me.userId);
    if (s.families > 0 && s.familiesDone < s.families) {
      todos.push({
        key: `homework-${a.id}`,
        text: `Homework “${a.title}”: ${s.familiesDone} of ${s.families} families done`,
        href: `/plays/homework/${a.id}`,
        level: "info",
      });
    }
  }
  // Club awards the coach still has to pick (coaches only; managers can't pick).
  const toPick = isCoach(data.me.role) ? awardsToPick(data.clubAwards) : [];
  if (toPick.length > 0) {
    const due = toPick.reduce((d, a) => (a.dueOn < d ? a.dueOn : d), toPick[0]!.dueOn);
    todos.push({
      key: "club-awards",
      text: pickText(toPick),
      href: "/awards",
      level: daysBetween(today, due) <= 2 ? "urgent" : "soon",
    });
  }
  const order = { urgent: 0, soon: 1, info: 2 };
  return todos.sort((a, b) => order[a.level] - order[b.level]).slice(0, limit);
}
