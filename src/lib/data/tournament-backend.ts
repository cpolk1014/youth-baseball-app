// Tournaments (phase 1) in Supabase: a team's tournaments and their teams. RLS: the team
// sees them; coaches and managers change them. Loaded on the Tournaments pages only.
import { getBrowserSupabase } from "@/lib/supabase/client";
import type { EventDetails, EventTeam } from "@/lib/tournaments/event";
import type { SavedGame, ScheduleGame } from "@/lib/tournaments/schedule";
import type { Seed } from "@/lib/tournaments/standings";
import { rulesFromJson, type Criterion, type RuleSet } from "@/lib/tournaments/tiebreak";

export interface Tournament {
  id: string;
  teamId: string;
  name: string;
  organization: string | null;
  infoUrl: string | null;
  scheduleUrl: string | null;
  bracketUrl: string | null;
  startDate: string | null;
  endDate: string | null;
  city: string | null;
  venues: string[];
  division: string | null;
  teamCount: number;
  tiebreakSetId: string | null;
  seeding: "overall" | "pool";
  /** Locked seeds, in order (null until the coach locks them). */
  seeds: Seed[] | null;
  seedsLockedAt: string | null;
}

export interface TournamentTeam {
  id: string;
  name: string;
  hometown: string | null;
  classLabel: string | null;
  isUs: boolean;
  source: string;
}

interface Row {
  id: string;
  team_id: string;
  name: string;
  organization: string | null;
  info_url: string | null;
  schedule_url: string | null;
  bracket_url: string | null;
  start_date: string | null;
  end_date: string | null;
  city: string | null;
  venues: string[] | null;
  division: string | null;
  tournament_team?: { count: number }[];
  tiebreak_set_id: string | null;
  seeding: "overall" | "pool";
  seeds: Seed[] | null;
  seeds_locked_at: string | null;
}

const COLS =
  "id,team_id,name,organization,info_url,schedule_url,bracket_url,start_date,end_date,city,venues,division,tiebreak_set_id,seeding,seeds,seeds_locked_at,tournament_team(count)";

const fromRow = (r: Row): Tournament => ({
  id: r.id,
  teamId: r.team_id,
  name: r.name,
  organization: r.organization,
  infoUrl: r.info_url,
  scheduleUrl: r.schedule_url,
  bracketUrl: r.bracket_url,
  startDate: r.start_date,
  endDate: r.end_date,
  city: r.city,
  venues: r.venues ?? [],
  division: r.division,
  teamCount: r.tournament_team?.[0]?.count ?? 0,
  tiebreakSetId: r.tiebreak_set_id,
  seeding: r.seeding,
  seeds: r.seeds,
  seedsLockedAt: r.seeds_locked_at,
});

function check<T>(r: { data: unknown; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

export async function listTournaments(teamId: string): Promise<Tournament[]> {
  const rows = check<Row[]>(
    await getBrowserSupabase()
      .from("tournament")
      .select(COLS)
      .eq("team_id", teamId)
      .order("start_date", { ascending: true, nullsFirst: false }),
  );
  return rows.map(fromRow);
}

export async function getTournament(
  id: string,
): Promise<{ tournament: Tournament; teams: TournamentTeam[] } | null> {
  const sb = getBrowserSupabase();
  const [t, teams] = await Promise.all([
    sb.from("tournament").select(COLS).eq("id", id).maybeSingle(),
    sb
      .from("tournament_team")
      .select("id,name,hometown,class_label,is_us,source")
      .eq("tournament_id", id)
      .order("name"),
  ]);
  const row = check<Row | null>(t);
  if (!row) return null;
  return {
    tournament: fromRow(row),
    teams: check<
      {
        id: string;
        name: string;
        hometown: string | null;
        class_label: string | null;
        is_us: boolean;
        source: string;
      }[]
    >(teams).map((x) => ({
      id: x.id,
      name: x.name,
      hometown: x.hometown,
      classLabel: x.class_label,
      isUs: x.is_us,
      source: x.source,
    })),
  };
}

export interface TournamentLinks {
  infoUrl: string | null;
  scheduleUrl: string | null;
  bracketUrl: string | null;
}

/** Save a tournament read from a screenshot, with the division's teams and any links. */
export async function createTournament(input: {
  teamId: string;
  seasonId: string | null;
  event: EventDetails;
  name: string;
  division: string | null;
  teams: EventTeam[];
  ourTeam: string | null;
  links: TournamentLinks;
}): Promise<string> {
  const sb = getBrowserSupabase();
  const id = crypto.randomUUID();
  check(
    await sb.from("tournament").insert({
      id,
      team_id: input.teamId,
      season_id: input.seasonId,
      name: input.name.trim().slice(0, 120),
      organization: input.event.organization,
      info_url: input.links.infoUrl,
      schedule_url: input.links.scheduleUrl,
      bracket_url: input.links.bracketUrl,
      start_date: input.event.startDate,
      end_date: input.event.endDate,
      city: input.event.city,
      venues: input.event.venues,
      division: input.division,
    }),
  );
  await addTeams(id, input.teams, "screenshot", input.ourTeam);
  return id;
}

/** Coaches set or clear the info, schedule and bracket links. */
export async function setLinks(id: string, links: TournamentLinks): Promise<void> {
  check(
    await getBrowserSupabase()
      .from("tournament")
      .update({
        info_url: links.infoUrl,
        schedule_url: links.scheduleUrl,
        bracket_url: links.bracketUrl,
      })
      .eq("id", id),
  );
}

/** Add teams to a tournament's list; returns the new rows. */
export async function addTeams(
  tournamentId: string,
  teams: EventTeam[],
  source: "link" | "screenshot" | "manual",
  ourTeam: string | null = null,
): Promise<{ id: string; name: string }[]> {
  if (teams.length === 0) return [];
  return check<{ id: string; name: string }[]>(
    await getBrowserSupabase()
      .from("tournament_team")
      .insert(
        teams.map((t) => ({
          tournament_id: tournamentId,
          name: t.name,
          hometown: t.hometown,
          class_label: t.classLabel,
          is_us: t.name === ourTeam,
          source,
        })),
      )
      .select("id,name"),
  );
}

export async function removeTeam(teamId: string): Promise<void> {
  check(await getBrowserSupabase().from("tournament_team").delete().eq("id", teamId));
}

/** Mark which listed team is ours (only one). */
export async function setOurTeam(tournamentId: string, teamId: string | null): Promise<void> {
  const sb = getBrowserSupabase();
  check(
    await sb
      .from("tournament_team")
      .update({ is_us: false })
      .eq("tournament_id", tournamentId)
      .eq("is_us", true),
  );
  if (teamId) check(await sb.from("tournament_team").update({ is_us: true }).eq("id", teamId));
}

export async function deleteTournament(id: string): Promise<void> {
  check(await getBrowserSupabase().from("tournament").delete().eq("id", id));
}

// ── Phase 2: the schedule ──

const GAME_COLS =
  "id,game_no,stage,pool,round,game_date,start_time,venue,field,home,away,home_team_id,away_team_id,game_id,score_home,score_away,reported_by,reported_at,locked";

interface GameRow {
  id: string;
  game_no: string | null;
  stage: "pool" | "bracket";
  pool: string | null;
  round: string | null;
  game_date: string | null;
  start_time: string | null;
  venue: string | null;
  field: string | null;
  home: string;
  away: string;
  home_team_id: string | null;
  away_team_id: string | null;
  game_id: string | null;
  score_home: number | null;
  score_away: number | null;
  reported_by: string | null;
  reported_at: string | null;
  locked: boolean;
}

export interface TournamentGame extends SavedGame {
  homeTeamId: string | null;
  awayTeamId: string | null;
  scoreHome: number | null;
  scoreAway: number | null;
  reportedBy: string | null;
  reportedAt: string | null;
  locked: boolean;
}

export async function listGames(tournamentId: string): Promise<TournamentGame[]> {
  const rows = check<GameRow[]>(
    await getBrowserSupabase()
      .from("tournament_game")
      .select(GAME_COLS)
      .eq("tournament_id", tournamentId),
  );
  return rows.map((r) => ({
    id: r.id,
    gameNo: r.game_no,
    stage: r.stage,
    pool: r.pool,
    round: r.round,
    date: r.game_date,
    startTime: r.start_time ? r.start_time.slice(0, 5) : null,
    venue: r.venue,
    field: r.field,
    home: r.home,
    away: r.away,
    homeTeamId: r.home_team_id,
    awayTeamId: r.away_team_id,
    gameId: r.game_id,
    scoreHome: r.score_home,
    scoreAway: r.score_away,
    reportedBy: r.reported_by,
    reportedAt: r.reported_at,
    locked: r.locked,
  }));
}

export interface GameWrite {
  /** Set to update a saved game; left out to add one. */
  id?: string;
  game: ScheduleGame;
  homeTeamId: string | null;
  awayTeamId: string | null;
  gameId: string | null;
}

/** Add and update tournament games (team games must already be saved). */
export async function saveGames(tournamentId: string, writes: GameWrite[]): Promise<void> {
  const sb = getBrowserSupabase();
  const row = (w: GameWrite) => ({
    tournament_id: tournamentId,
    game_no: w.game.gameNo,
    stage: w.game.stage,
    pool: w.game.pool,
    round: w.game.round,
    game_date: w.game.date,
    start_time: w.game.startTime,
    venue: w.game.venue,
    field: w.game.field,
    home: w.game.home,
    away: w.game.away,
    home_team_id: w.homeTeamId,
    away_team_id: w.awayTeamId,
    game_id: w.gameId,
    updated_at: new Date().toISOString(),
  });
  const adds = writes.filter((w) => !w.id);
  if (adds.length) check(await sb.from("tournament_game").insert(adds.map(row)));
  for (const w of writes.filter((x) => x.id)) {
    check(await sb.from("tournament_game").update(row(w)).eq("id", w.id!));
  }
}

/** Anyone on the team reports (or clears, with nulls) the score of a game we're not in. */
export async function reportScore(
  id: string,
  home: number | null,
  away: number | null,
): Promise<void> {
  check(
    await getBrowserSupabase().rpc("report_tournament_score", {
      p_id: id,
      p_home: home,
      p_away: away,
    }),
  );
}

/** Coaches and managers lock a score so only they can change it. */
export async function setScoreLocked(id: string, locked: boolean): Promise<void> {
  check(await getBrowserSupabase().from("tournament_game").update({ locked }).eq("id", id));
}

export async function removeGame(id: string): Promise<void> {
  check(await getBrowserSupabase().from("tournament_game").delete().eq("id", id));
}

/** The tournament a team game belongs to, for the game page. */
export async function tournamentForGame(gameId: string): Promise<{
  tournamentId: string;
  name: string;
  game: Pick<ScheduleGame, "gameNo" | "stage" | "pool" | "round">;
} | null> {
  const r = check<{
    game_no: string | null;
    stage: "pool" | "bracket";
    pool: string | null;
    round: string | null;
    tournament: { id: string; name: string } | null;
  } | null>(
    await getBrowserSupabase()
      .from("tournament_game")
      .select("game_no,stage,pool,round,tournament(id,name)")
      .eq("game_id", gameId)
      .maybeSingle(),
  );
  if (!r?.tournament) return null;
  return {
    tournamentId: r.tournament.id,
    name: r.tournament.name,
    game: { gameNo: r.game_no, stage: r.stage, pool: r.pool, round: r.round },
  };
}

// ── Phase 4: tie-breakers and seeding ──

export async function listRuleSets(teamId: string): Promise<RuleSet[]> {
  const rows = check<
    {
      id: string;
      name: string;
      organization: string | null;
      rules: unknown;
      restart: boolean;
      notes: string | null;
    }[]
  >(
    await getBrowserSupabase()
      .from("tiebreak_rule_set")
      .select("id,name,organization,rules,restart,notes")
      .eq("team_id", teamId)
      .order("name"),
  );
  return rows.map((r) => ({ ...r, rules: rulesFromJson(r.rules) }));
}

/** Save a named rule set (new, or changes to one) and return its id. */
export async function saveRuleSet(
  teamId: string,
  set: Omit<RuleSet, "id"> & { id?: string },
): Promise<string> {
  const id = set.id ?? crypto.randomUUID();
  const row = {
    id,
    team_id: teamId,
    name: set.name.trim().slice(0, 60),
    organization: set.organization?.trim().slice(0, 80) || null,
    rules: set.rules.map((c: Criterion) => ({ type: c.type, cap: c.cap, text: c.text })),
    restart: set.restart,
    notes: set.notes?.trim().slice(0, 1000) || null,
  };
  check(await getBrowserSupabase().from("tiebreak_rule_set").upsert(row));
  return id;
}

export async function deleteRuleSet(id: string): Promise<void> {
  check(await getBrowserSupabase().from("tiebreak_rule_set").delete().eq("id", id));
}

/** Which rules a tournament uses, and whether it seeds overall or within each pool. */
export async function setTournamentRules(
  id: string,
  input: { tiebreakSetId: string | null; seeding: "overall" | "pool" },
): Promise<void> {
  check(
    await getBrowserSupabase()
      .from("tournament")
      .update({ tiebreak_set_id: input.tiebreakSetId, seeding: input.seeding })
      .eq("id", id),
  );
}

/** Lock the seeds (or unlock, with null). */
export async function lockSeeds(id: string, seeds: Seed[] | null): Promise<void> {
  check(
    await getBrowserSupabase()
      .from("tournament")
      .update({ seeds, seeds_locked_at: seeds ? new Date().toISOString() : null })
      .eq("id", id),
  );
}
