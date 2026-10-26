import type { RuleConfigInput } from "@/lib/rules/config";
import type { Lineup, Player } from "@/lib/rules/types";
import type { MemberRole } from "./permissions";

export type GameStatus = "scheduled" | "final";

export interface Team {
  id: string;
  name: string;
  ageGroup: string;
  /** Coach's pitch: P is a fielding spot and new games default to 10 fielders. */
  coachPitch: boolean;
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
  /** 9 fielders (LF CF RF) or 10 (LF LCF RCF RF). */
  fieldPlayers: 9 | 10;
  status: GameStatus;
}

export interface GameLineup extends Lineup {
  /** Bumped on every auto-fill so each tap gives a new (but reproducible) lineup. */
  autoFillSeed: number;
}

export interface Member {
  id: string;
  userId: string;
  role: MemberRole;
  /** Name they gave when joining; null for the team's creator until set. */
  displayName: string | null;
}

export interface Invite {
  id: string;
  role: MemberRole;
  token: string;
  createdAt: string;
  expiresAt: string;
  /** null = any number of people can use it. */
  maxUses: number | null;
  uses: number;
}

/** Everything the screens need. Mirrors the Supabase schema, camelCased. */
export interface AppData {
  /** The signed-in user (null in local mode) and their role on this team. */
  me: { userId: string | null; role: MemberRole };
  members: Member[];
  /** Active invite links (coaches only). */
  invites: Invite[];
  team: Team;
  season: Season;
  players: Player[];
  games: Game[];
  lineups: Record<string, GameLineup>;
}
