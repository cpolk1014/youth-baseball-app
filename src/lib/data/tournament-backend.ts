// Tournaments (phase 1) in Supabase: a team's tournaments and their teams. RLS: the team
// sees them; coaches and managers change them. Loaded on the Tournaments pages only.
import { getBrowserSupabase } from "@/lib/supabase/client";
import type { EventDetails, EventTeam } from "@/lib/tournaments/event";

export interface Tournament {
  id: string;
  teamId: string;
  name: string;
  organization: string | null;
  url: string | null;
  startDate: string | null;
  endDate: string | null;
  city: string | null;
  venues: string[];
  division: string | null;
  checkedAt: string | null;
  checkNote: string | null;
  teamCount: number;
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
  url: string | null;
  start_date: string | null;
  end_date: string | null;
  city: string | null;
  venues: string[] | null;
  division: string | null;
  checked_at: string | null;
  check_note: string | null;
  tournament_team?: { count: number }[];
}

const COLS =
  "id,team_id,name,organization,url,start_date,end_date,city,venues,division,checked_at,check_note,tournament_team(count)";

const fromRow = (r: Row): Tournament => ({
  id: r.id,
  teamId: r.team_id,
  name: r.name,
  organization: r.organization,
  url: r.url,
  startDate: r.start_date,
  endDate: r.end_date,
  city: r.city,
  venues: r.venues ?? [],
  division: r.division,
  checkedAt: r.checked_at,
  checkNote: r.check_note,
  teamCount: r.tournament_team?.[0]?.count ?? 0,
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

/** Save a tournament read from its link or a screenshot, with the division's teams. */
export async function createTournament(input: {
  teamId: string;
  seasonId: string | null;
  event: EventDetails;
  name: string;
  division: string | null;
  teams: EventTeam[];
  ourTeam: string | null;
  url: string | null;
  pageHash: string | null;
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
      url: input.url,
      start_date: input.event.startDate,
      end_date: input.event.endDate,
      city: input.event.city,
      venues: input.event.venues,
      division: input.division,
      // The first read counts as this week's check.
      checked_at: input.url ? new Date().toISOString() : null,
      page_hash: input.pageHash,
      check_note: input.url ? `${input.teams.length} teams found.` : null,
    }),
  );
  await addTeams(id, input.teams, input.url ? "link" : "screenshot", input.ourTeam);
  return id;
}

export async function addTeams(
  tournamentId: string,
  teams: EventTeam[],
  source: "link" | "screenshot" | "manual",
  ourTeam: string | null = null,
): Promise<void> {
  if (teams.length === 0) return;
  check(
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
      ),
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
