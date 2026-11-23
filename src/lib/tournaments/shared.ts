// A shared tournament (fungo.team/t/<token>): what `shared_tournament` returns, read into the
// same shapes the team's own tournament page uses, so standings, the bracket and "What time do
// we play tomorrow?" work the same. Pure: no I/O.
import type { Tournament, TournamentGame, TournamentTeam } from "@/lib/data/tournament-backend";
import type { Seed } from "./standings";
import { rulesFromJson, type RuleSet } from "./tiebreak";
import { cleanPlaces } from "./venues";

export interface SharedTournament {
  tournament: Tournament;
  teams: TournamentTeam[];
  games: TournamentGame[];
  ruleSet: RuleSet | null;
  /** The team that shared it. */
  team: { name: string; colors: string[]; logoPath: string | null; timezone: string };
}

/** Share links are letters and digits, 12 to 40 long (the database makes 20). */
export const isShareToken = (token: string) => /^[A-Za-z0-9]{12,40}$/.test(token);

/** The page's address for a share token. */
export const shareUrl = (token: string, origin = "https://www.fungo.team") =>
  `${origin}/t/${token}`;

type Json = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
const list = (v: unknown): Json[] =>
  Array.isArray(v) ? v.filter((x): x is Json => !!x && typeof x === "object") : [];

/** The database's answer as a shared tournament, or null when the link doesn't work. */
export function fromShared(raw: unknown): SharedTournament | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Json;
  const t = (r.tournament ?? null) as Json | null;
  if (!t || typeof t.id !== "string" || typeof t.name !== "string") return null;
  const team = (r.team ?? {}) as Json;
  const rules = (r.rules ?? null) as Json | null;
  const teams: TournamentTeam[] = list(r.teams).map((x) => ({
    id: String(x.id),
    name: String(x.name ?? ""),
    hometown: str(x.hometown),
    classLabel: str(x.class_label),
    isUs: x.is_us === true,
    source: "shared",
  }));
  const ruleSet: RuleSet | null = rules
    ? {
        id: "shared",
        name: str(rules.name) ?? "Tie-breakers",
        organization: null,
        rules: rulesFromJson(rules.rules),
        restart: rules.restart !== false,
        notes: null,
      }
    : null;
  return {
    tournament: {
      id: t.id,
      teamId: "",
      name: t.name,
      organization: str(t.organization),
      infoUrl: str(t.info_url),
      scheduleUrl: str(t.schedule_url),
      bracketUrl: str(t.bracket_url),
      startDate: str(t.start_date),
      endDate: str(t.end_date),
      city: str(t.city),
      venues: Array.isArray(t.venues) ? t.venues.filter((v) => typeof v === "string") : [],
      places: cleanPlaces(t.places),
      division: str(t.division),
      teamCount: teams.length,
      tiebreakSetId: ruleSet ? ruleSet.id : null,
      seeding: t.seeding === "pool" ? "pool" : "overall",
      seeds: Array.isArray(t.seeds) ? (t.seeds as Seed[]) : null,
      seedsLockedAt: str(t.seeds_locked_at),
    },
    teams,
    games: list(r.games).map((g) => ({
      id: String(g.id),
      gameNo: str(g.game_no),
      stage: g.stage === "bracket" ? "bracket" : "pool",
      pool: str(g.pool),
      round: str(g.round),
      date: str(g.game_date),
      startTime: str(g.start_time)?.slice(0, 5) ?? null,
      venue: str(g.venue),
      field: str(g.field),
      home: String(g.home ?? ""),
      away: String(g.away ?? ""),
      homeTeamId: str(g.home_team_id),
      awayTeamId: str(g.away_team_id),
      // The team's own games stay private: nothing links anywhere.
      gameId: null,
      scoreHome: num(g.score_home),
      scoreAway: num(g.score_away),
      reportedBy: null,
      reportedAt: null,
      locked: g.locked === true,
    })),
    ruleSet,
    team: {
      name: str(team.name) ?? "A Fungo team",
      colors: Array.isArray(team.colors) ? team.colors.filter((c) => typeof c === "string") : [],
      logoPath: str(team.logo_path),
      timezone: str(team.timezone) ?? "America/Chicago",
    },
  };
}

/**
 * Teams as a visitor sees them: nobody is "us" until they pick their own team, and then
 * that one is (so "we" in the what-ifs means the team they picked).
 */
export function asVisitor(teams: TournamentTeam[], mineId: string | null): TournamentTeam[] {
  return teams.map((x) => ({ ...x, isUs: x.id === mineId }));
}
