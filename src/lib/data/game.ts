import { emptyLineup, normalizeLineup } from "@/lib/lineup/edit";
import { resolveRuleConfig } from "@/lib/rules/config";
import type { Lineup, RuleConfig } from "@/lib/rules/types";
import type { AppData, Game } from "./types";

export interface GameContext {
  game: Game;
  config: RuleConfig;
  lineup: Lineup;
  /** Saved lineups of this season's other final games. */
  history: Lineup[];
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
  return {
    game,
    config: resolveRuleConfig(data.season.fairPlayRules),
    lineup: normalizeLineup(
      saved ?? emptyLineup(data.players, game.innings),
      data.players,
      game.innings,
    ),
    history,
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
        slots: lineup.slots.filter((s) => s.inning <= g.innings),
      };
    });
}
