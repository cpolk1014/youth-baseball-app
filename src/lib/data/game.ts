import { emptyLineup, normalizeLineup } from "@/lib/lineup/edit";
import { gameRuleConfig } from "@/lib/rules/config";
import type { Lineup, RuleConfig } from "@/lib/rules/types";
import type { AppData, Game } from "./types";

export interface GameContext {
  game: Game;
  config: RuleConfig;
  lineup: Lineup;
  /** Saved lineups of this season's other final games. */
  history: Lineup[];
  /** The lineup of this season's latest final game before this one (rules across games). */
  previous: Lineup | null;
  autoFillSeed: number;
  hasSavedLineup: boolean;
}

export function gameContext(data: AppData, gameId: string): GameContext | null {
  const game = data.games.find((g) => g.id === gameId);
  if (!game) return null;
  const saved = data.lineups[gameId];
  const history = data.games
    .filter((g) => g.id !== gameId && g.seasonId === game.seasonId && g.status === "final")
    .flatMap((g) => (data.lineups[g.id] ? [data.lineups[g.id]!] : []));
  const when = (g: Game) => `${g.date} ${g.startTime ?? "00:00"}`;
  const before = data.games
    .filter(
      (g) =>
        g.id !== gameId &&
        g.seasonId === game.seasonId &&
        g.status === "final" &&
        data.lineups[g.id] &&
        when(g) < when(game),
    )
    .sort((a, b) => when(b).localeCompare(when(a)))[0];
  return {
    game,
    config: gameRuleConfig(data.season.fairPlayRules, {
      coachPitch: data.team.coachPitch,
      fieldPlayers: game.fieldPlayers,
    }),
    lineup: normalizeLineup(
      saved ?? emptyLineup(data.players, game.innings),
      data.players,
      game.innings,
    ),
    history,
    previous: before ? data.lineups[before.id]! : null,
    autoFillSeed: saved?.autoFillSeed ?? 0,
    hasSavedLineup: saved !== undefined && saved.slots.length > 0,
  };
}

export function formatGameDate(game: Game): string {
  const date = new Date(`${game.date}T${game.startTime ?? "12:00"}`);
  const day = date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  if (!game.startTime) return day;
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${day} · ${time}`;
}

export interface GameInput {
  opponent: string;
  date: string;
  startTime: string;
  location: string;
  innings: number;
  fieldPlayers: number;
}

export type GameInputErrors = Partial<Record<keyof GameInput, string>>;

/** Field errors for the add/edit game form (empty object = valid). */
export function validateGameInput(input: GameInput): GameInputErrors {
  const errors: GameInputErrors = {};
  if (!input.opponent.trim()) errors.opponent = "Enter the opponent.";
  const [y, m, d] = input.date.split("-").map(Number);
  const parsed = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 0));
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.date) ||
    parsed.getUTCFullYear() !== y ||
    parsed.getUTCMonth() + 1 !== m ||
    parsed.getUTCDate() !== d
  ) {
    errors.date = "Pick a date.";
  }
  if (input.startTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.startTime)) {
    errors.startTime = "Use a time like 9:00 AM.";
  }
  if (!Number.isInteger(input.innings) || input.innings < 1 || input.innings > 9) {
    errors.innings = "Innings must be 1 to 9.";
  }
  if (input.fieldPlayers !== 9 && input.fieldPlayers !== 10) {
    errors.fieldPlayers = "Choose 9 or 10 field players.";
  }
  return errors;
}

/** Last inning that has any saved slot (0 if none). */
export function lastFilledInning(lineup: Lineup | undefined): number {
  return lineup ? Math.max(0, ...lineup.slots.map((s) => s.inning)) : 0;
}

/** Upcoming games soonest first; final games most recent first. */
export function splitGames(games: Game[]): { upcoming: Game[]; final: Game[] } {
  const key = (g: Game) => `${g.date}T${g.startTime ?? "99:99"}`;
  return {
    upcoming: games
      .filter((g) => g.status !== "final")
      .sort((a, b) => key(a).localeCompare(key(b))),
    final: games.filter((g) => g.status === "final").sort((a, b) => key(b).localeCompare(key(a))),
  };
}

/** YYYY-MM-DD in the device's local time zone. */
export function localDateString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Saved lineups of the season's final games, trimmed to each game's length. */
export function finalLineups(data: AppData, seasonId: string): Lineup[] {
  return data.games
    .filter((g) => g.seasonId === seasonId && g.status === "final" && data.lineups[g.id])
    .map((g) => {
      const lineup = data.lineups[g.id]!;
      return {
        innings: g.innings,
        battingOrder: lineup.battingOrder,
        notBatting: lineup.notBatting ?? [],
        absent: lineup.absent ?? [],
        slots: lineup.slots.filter((s) => s.inning <= g.innings),
      };
    });
}

/** New games default to 10 fielders for coach's pitch teams, otherwise 9. */
export function defaultFieldPlayers(coachPitch: boolean): 9 | 10 {
  return coachPitch ? 10 : 9;
}

export type GameResult = "W" | "L" | "T";

/** W, L or T for a final game with both scores entered; otherwise null. */
export function gameResult(game: Game): GameResult | null {
  if (game.status !== "final" || game.scoreUs == null || game.scoreThem == null) return null;
  return game.scoreUs > game.scoreThem ? "W" : game.scoreUs < game.scoreThem ? "L" : "T";
}

/** The season's record from final games with scores: "8–3", or "8–3–1" with ties. Null if none. */
export function recordText(games: Game[]): string | null {
  const results = games.map(gameResult).filter((r): r is GameResult => r !== null);
  if (results.length === 0) return null;
  const n = (r: GameResult) => results.filter((x) => x === r).length;
  const ties = n("T");
  return `${n("W")}–${n("L")}${ties ? `–${ties}` : ""}`;
}

/** "Today", "Tomorrow", "Saturday" (within a week), or "Sat, Nov 2". Dates are YYYY-MM-DD. */
export function whenText(date: string, today: string): string {
  const day = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  const days = Math.round((day(date) - day(today)) / 86400000);
  const d = new Date(day(date));
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days > 1 && days < 7)
    return d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
