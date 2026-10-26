import type { FieldPosition, Position } from "@/lib/rules/types";

// Row shapes of the tables the app reads and writes (see supabase/migrations).

export interface TeamRow {
  id: string;
  name: string;
  age_group: string;
  coach_pitch: boolean;
  optioned_at: string | null;
}

export interface MemberRow {
  id: string;
  team_id: string;
  user_id: string;
  role: "coach" | "manager" | "treasurer" | "parent";
  display_name: string | null;
}

export interface InviteRow {
  id: string;
  team_id: string;
  role: "coach" | "manager" | "treasurer" | "parent";
  token: string;
  created_at: string;
  expires_at: string;
  max_uses: number | null;
  uses: number;
  revoked_at: string | null;
}

export interface PracticeRow {
  id: string;
  season_id: string;
  practice_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  focus: string | null;
  notes: string | null;
  plan: { id: string; title: string; minutes: number; notes?: string }[];
  canceled: boolean;
}

export interface SeasonRow {
  id: string;
  team_id: string;
  name: string;
  fair_play_rules: Record<string, unknown>;
}

export interface PlayerRow {
  id: string;
  team_id: string;
  name: string;
  jersey_number: number | null;
  preferred_positions: FieldPosition[];
  can_pitch: boolean;
  can_catch: boolean;
  active: boolean;
}

export interface GameRow {
  id: string;
  season_id: string;
  game_date: string;
  /** Postgres time, e.g. "09:00:00". */
  start_time: string | null;
  opponent: string;
  location: string | null;
  innings: number;
  field_players: 9 | 10;
  status: "scheduled" | "final";
}

export interface LineupRow {
  id: string;
  game_id: string;
  batting_order: string[];
  not_batting: string[];
  absent: string[];
  version: number;
}

export interface LineupSlotRow {
  lineup_id: string;
  inning: number;
  player_id: string;
  position: Position;
}
