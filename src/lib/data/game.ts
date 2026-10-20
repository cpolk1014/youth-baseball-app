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
