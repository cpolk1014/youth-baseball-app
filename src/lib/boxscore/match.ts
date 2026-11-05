// Which of the team's games a box score is from: the same day, an opponent named about the
// same, and (for two games that day) the same score. A box score that matches no game on the
// schedule isn't imported (pure).
import type { Game } from "@/lib/data/types";

export interface BoxFacts {
  gameDate: string | null;
  opponent: string | null;
  ourRuns: number | null;
  theirRuns: number | null;
}

export type GameMatch =
  | { kind: "one"; game: Game }
  /** More than one game fits (or only the day does): the parent picks. */
  | { kind: "pick"; games: Game[] }
  | { kind: "none"; reason: string };

const key = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

/** "LBC Rudy 13U" and "LBC Rudy" are the same opponent; "TBD" isn't anyone. */
export function sameOpponent(a: string, b: string): boolean {
  const x = key(a);
  const y = key(b);
  if (!x || !y || x === "tbd" || y === "tbd") return false;
  return x === y || x.includes(y) || y.includes(x);
}

const describe = (b: BoxFacts) =>
  [
    b.opponent ? `vs ${b.opponent}` : null,
    b.gameDate
      ? new Date(`${b.gameDate}T12:00`).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : null,
  ]
    .filter(Boolean)
    .join(", ");

/** Find the game a box score is from among the team's games (or check the one given). */
export function matchBoxScore(box: BoxFacts, games: Game[], forGame?: Game | null): GameMatch {
  const fits = (g: Game) =>
    (!box.gameDate || g.date === box.gameDate) &&
    (!box.opponent || sameOpponent(g.opponent, box.opponent));

  if (forGame) {
    return fits(forGame)
      ? { kind: "one", game: forGame }
      : {
          kind: "none",
          reason: `This box score is from a different game (${describe(box) || "no date or opponent shown"}).`,
        };
  }
  if (!box.gameDate && !box.opponent) {
    return { kind: "none", reason: "The box score doesn't show the date or the opponent." };
  }

  const candidates = games.filter(fits);
  if (candidates.length === 1) return { kind: "one", game: candidates[0]! };
  if (candidates.length > 1) {
    // Two games that day against the same team: the final score tells them apart.
    const byScore =
      box.ourRuns !== null && box.theirRuns !== null
        ? candidates.filter((g) => g.scoreUs === box.ourRuns && g.scoreThem === box.theirRuns)
        : [];
    return byScore.length === 1
      ? { kind: "one", game: byScore[0]! }
      : { kind: "pick", games: sortByTime(candidates) };
  }
  // The opponent's name may be written very differently: offer that day's games to pick from.
  const sameDay = box.gameDate ? games.filter((g) => g.date === box.gameDate) : [];
  if (sameDay.length > 0) return { kind: "pick", games: sortByTime(sameDay) };
  return {
    kind: "none",
    reason: `No game on the team's schedule matches this box score (${describe(box)}).`,
  };
}

const sortByTime = (games: Game[]) =>
  [...games].sort(
    (a, b) => a.date.localeCompare(b.date) || (a.startTime ?? "").localeCompare(b.startTime ?? ""),
  );
