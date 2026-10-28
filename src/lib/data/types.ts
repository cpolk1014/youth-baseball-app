import type { RuleConfigInput } from "@/lib/rules/config";
import type { Lineup, Player } from "@/lib/rules/types";
import type { FinanceEntry, FinanceShare } from "@/lib/finance/types";
import type { MoneySummary } from "@/lib/finance/ledger";
import type { PlanItem } from "@/lib/practice/schedule";
import type { MemberRole } from "./permissions";

export type GameStatus = "scheduled" | "final";

export interface Team {
  id: string;
  name: string;
  ageGroup: string;
  /** Coach's pitch: P is a fielding spot and new games default to 10 fielders. */
  coachPitch: boolean;
  /** When the team was optioned (archived); null while active. */
  optionedAt: string | null;
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

export interface Practice {
  id: string;
  seasonId: string;
  date: string; // YYYY-MM-DD
  startTime: string | null; // HH:MM
  endTime: string | null; // HH:MM
  location: string | null;
  focus: string | null;
  notes: string | null;
  plan: PlanItem[];
  canceled: boolean;
  /** Ids of library plays ("situations") to work on at this practice. */
  plays: string[];
}

/** A parent (team member) linked to one of the team's kids. */
export interface Guardian {
  id: string;
  playerId: string;
  userId: string;
}

/** Plays a coach assigns to the team's families to watch and quiz on. */
export interface PlayAssignment {
  id: string;
  title: string;
  playIds: string[];
  dueDate: string | null; // YYYY-MM-DD
  createdAt: string;
}

/** A finished quiz on an assignment. */
export interface QuizResult {
  id: string;
  assignmentId: string;
  /** The family member who took it. */
  userId: string;
  /** Which kid it was for, if they picked one. */
  playerId: string | null;
  correct: number;
  total: number;
  completedAt: string;
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

/** A team the signed-in user belongs to, for the team switcher. */
export interface TeamSummary {
  id: string;
  name: string;
  ageGroup: string;
  role: MemberRole;
  optioned: boolean;
}

/** Everything the screens need. Mirrors the Supabase schema, camelCased. */
export interface AppData {
  /** The signed-in user (null in local mode) and their role on this team. */
  me: { userId: string | null; role: MemberRole };
  members: Member[];
  /** Active invite links (coaches only). */
  invites: Invite[];
  /** Every team the user is on, with their role on each. */
  myTeams: TeamSummary[];
  team: Team;
  season: Season;
  players: Player[];
  games: Game[];
  lineups: Record<string, GameLineup>;
  practices: Practice[];
  assignments: PlayAssignment[];
  /** Coaches and managers see everyone's; families see their own. */
  quizResults: QuizResult[];
  /** Parent ↔ kid links. Coaches and managers see all; families see their own. */
  guardians: Guardian[];
  /** Team money this season. Coaches and treasurers see every entry; others see Walkoffs
   * and entries tagged to their own kids (with only their kids' shares). */
  financeEntries: FinanceEntry[];
  financeShares: FinanceShare[];
  /** Team totals from the server, for people who can't see every entry. */
  financeSummary: MoneySummary | null;
  /** The team's GroupMe bot; only loaded for coaches and managers (null otherwise). */
  groupme: { botId: string; groupName: string | null } | null;
}
