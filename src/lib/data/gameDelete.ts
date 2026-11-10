// The rules for deleting a team game. A final game has to be reopened first; a game that's
// part of a tournament is removed from the tournament's page. Pure, so it can be tested.
import { formatGameDate } from "./game";
import type { Lineup } from "@/lib/rules/types";
import type { Game } from "./types";

/** How far ahead a deleted game is worth telling the team about. */
const POST_WINDOW_DAYS = 7;

/** Whether anyone has started this game's lineup or batting order. */
export function hasLineup(lineup: Lineup | undefined): boolean {
  return !!lineup && (lineup.slots.length > 0 || lineup.battingOrder.length > 0);
}

/** A game can be deleted unless it's final (reopen it first, since it counts in the season). */
export function canDeleteGame(game: Pick<Game, "status">): boolean {
  return game.status !== "final";
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Whether to offer a GroupMe post: any of these games is in the next week. (The automatic
 * game day post goes out at most two days ahead, so a game it announced is always in here.)
 */
export function offerGamePost(games: Pick<Game, "date">[], today: string): boolean {
  if (!today) return false;
  const last = addDays(today, POST_WINDOW_DAYS);
  return games.some((g) => g.date >= today && g.date <= last);
}

const whenLine = (game: Game) => formatGameDate(game).replace(" · ", " at ");

/** The message offered to the team when games come off the schedule. */
export function gamesOffMessage(games: Game[], tournamentName?: string): string {
  const [only] = games;
  if (games.length === 1 && only) {
    const event = tournamentName ? ` in ${tournamentName}` : "";
    return `Heads up: the game against ${only.opponent}${event} on ${whenLine(only)} is off.`;
  }
  const lead = tournamentName
    ? `Heads up: we're not playing in ${tournamentName}. These games are off:`
    : "Heads up: these games are off:";
  return [lead, ...games.map((g) => `${whenLine(g)} vs ${g.opponent}`)].join("\n");
}

/** Our team games from a tournament's schedule that haven't been played, with their rows. */
export function unplayedTournamentGames<R extends { id: string; gameId: string | null }>(
  rows: R[],
  teamGames: Game[],
): { rowIds: string[]; games: Game[] } {
  const byId = new Map(teamGames.map((g) => [g.id, g]));
  const rowIds: string[] = [];
  const games: Game[] = [];
  for (const row of rows) {
    const game = row.gameId ? byId.get(row.gameId) : undefined;
    if (game && canDeleteGame(game)) {
      rowIds.push(row.id);
      games.push(game);
    }
  }
  games.sort((a, b) => a.date.localeCompare(b.date));
  return { rowIds, games };
}
