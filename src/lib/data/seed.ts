import { DEFAULT_RULE_CONFIG } from "@/lib/rules/config";
import type { FieldPosition, Player } from "@/lib/rules/types";
import type { AppData } from "./types";

// Mirrors supabase/seed.sql (same ids) so local data lines up with the database later.
const TEAM_ID = "00000000-0000-4000-8000-000000000001";
const SEASON_ID = "00000000-0000-4000-8000-000000000101";

const player = (
  n: number,
  name: string,
  jerseyNumber: number,
  preferredPositions: FieldPosition[],
  canPitch: boolean,
  canCatch: boolean,
): Player => ({
  id: `00000000-0000-4000-8000-00000000${String(1000 + n).padStart(4, "0")}`,
  name,
  jerseyNumber,
  preferredPositions,
  canPitch,
  canCatch,
  active: true,
});

export const SEED_DATA: AppData = {
  me: { userId: null, role: "coach" },
  members: [],
  invites: [],
  team: { id: TEAM_ID, name: "Riverside Rattlers", ageGroup: "10U", coachPitch: false },
  season: { id: SEASON_ID, teamId: TEAM_ID, name: "Fall 2026", fairPlayRules: DEFAULT_RULE_CONFIG },
  players: [
    player(1, "Mason R.", 2, ["SS", "P"], true, false),
    player(2, "Leo T.", 5, ["P", "3B"], true, false),
    player(3, "Eli M.", 7, ["C"], false, true),
    player(4, "Owen K.", 9, ["P", "1B"], true, false),
    player(5, "Jack D.", 11, ["C", "3B"], false, true),
    player(6, "Theo B.", 12, ["2B", "SS"], false, false),
    player(7, "Lucas W.", 14, ["CF", "LF"], false, false),
    player(8, "Sam P.", 17, [], false, false),
    player(9, "Noah G.", 21, ["1B", "RF"], true, true),
    player(10, "Ezra L.", 23, ["LF"], false, false),
    player(11, "Miles H.", 27, [], false, false),
    player(12, "Caleb S.", 33, ["2B", "RF"], false, false),
  ],
  games: [
    {
      id: "00000000-0000-4000-8000-000000010001",
      seasonId: SEASON_ID,
      date: "2026-10-24",
      startTime: "09:00",
      opponent: "Lakeside Lightning",
      location: "Memorial Park Field 2",
      innings: 6,
      fieldPlayers: 9,
      status: "scheduled",
    },
    {
      id: "00000000-0000-4000-8000-000000010002",
      seasonId: SEASON_ID,
      date: "2026-10-25",
      startTime: "13:30",
      opponent: "Northside Nationals",
      location: "Northside Complex Field 4",
      innings: 4,
      fieldPlayers: 9,
      status: "scheduled",
    },
  ],
  lineups: {},
};
