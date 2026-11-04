// Tournaments (phase 1) in Supabase: a team's tournaments and their teams. RLS: the team
// sees them; coaches and managers change them. Loaded on the Tournaments pages only.
import { getBrowserSupabase } from "@/lib/supabase/client";
import type { EventDetails, EventTeam } from "@/lib/tournaments/event";

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
}

const COLS =
  "id,team_id,name,organization,info_url,schedule_url,bracket_url,start_date,end_date,city,venues,division,tournament_team(count)";

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
