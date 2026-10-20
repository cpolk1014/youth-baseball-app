import type { RuleConfigInput } from "@/lib/rules/config";
import type { Lineup, Player } from "@/lib/rules/types";

export type GameStatus = "scheduled" | "final";

export interface Team {
  id: string;
  name: string;
  ageGroup: string;
}

export interface Season {
  id: string;
  teamId: string;
  name: string;
  fairPlayRules: RuleConfigInput;
}

export interface Game {
  id: string;
  seasonId: string;
  date: string; // YYYY-MM-DD
  startTime: string | null; // HH:MM
  opponent: string;
  location: string | null;
  innings: number;
  status: GameStatus;
}

export interface GameLineup extends Lineup {
  /** Bumped on every auto-fill so each tap gives a new (but reproducible) lineup. */
  autoFillSeed: number;
}

/** Everything the screens need. Mirrors the Supabase schema, camelCased. */
export interface AppData {
  team: Team;
  season: Season;
  players: Player[];
  games: Game[];
  lineups: Record<string, GameLineup>;
}
