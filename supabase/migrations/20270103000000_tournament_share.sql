-- Share a tournament: a coach or manager makes a public, read-only link (fungo.team/t/<token>)
-- for the other teams at the tournament. Anyone with the link, signed in or not, sees the
-- standings, schedule and scores, bracket and tie-breakers, and works out "What time do we
-- play tomorrow?" for any team. Only what the tournament's own site shows: team names, games,
-- places and scores. No players, no people, nothing else of the team's. Nobody with the link
-- can change anything (scores are still reported only by the team). Stop sharing ends the link;
-- sharing again makes a new one.

alter table public.tournament
  add column share_token text unique check (share_token is null or share_token ~ '^[A-Za-z0-9]{12,40}$');

/* Make (or keep) the tournament's share link. Coaches and managers. Returns the token. */
create function public.share_tournament(p_tournament uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team uuid;
  v_token text;
begin
  select team_id, share_token into v_team, v_token from public.tournament where id = p_tournament;
  if v_team is null or not public.has_team_role(v_team, '{coach,manager}') then
    raise exception 'Only the team''s coaches and managers can share this tournament.'
      using errcode = '42501';
  end if;
  if v_token is null then
    -- 20 hex characters from two random UUIDs (80 random bits): not guessable.
    v_token := substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 20);
    update public.tournament set share_token = v_token where id = p_tournament;
  end if;
  return v_token;
end;
$$;
revoke execute on function public.share_tournament(uuid) from public, anon;
grant execute on function public.share_tournament(uuid) to authenticated;

/* Stop sharing: the old link stops working. */
create function public.stop_sharing_tournament(p_tournament uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team uuid;
begin
  select team_id into v_team from public.tournament where id = p_tournament;
  if v_team is null or not public.has_team_role(v_team, '{coach,manager}') then
    raise exception 'Only the team''s coaches and managers can stop sharing this tournament.'
      using errcode = '42501';
  end if;
  update public.tournament set share_token = null where id = p_tournament;
end;
$$;
revoke execute on function public.stop_sharing_tournament(uuid) from public, anon;
grant execute on function public.stop_sharing_tournament(uuid) to authenticated;

/*
 * A shared tournament, read-only, for anyone with the link (null when the link is wrong or
 * sharing stopped). Leaves out who reported scores, links to the team's own games, and the
 * team's other tie-break sets. The sharing team shows by name, colors and logo.
 */
create function public.shared_tournament(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'tournament', jsonb_build_object(
      'id', t.id, 'name', t.name, 'organization', t.organization,
      'info_url', t.info_url, 'schedule_url', t.schedule_url, 'bracket_url', t.bracket_url,
      'start_date', t.start_date, 'end_date', t.end_date, 'city', t.city,
      'venues', t.venues, 'places', t.places, 'division', t.division,
      'seeding', t.seeding, 'seeds', t.seeds, 'seeds_locked_at', t.seeds_locked_at),
    'team', jsonb_build_object(
      'name', tm.name, 'colors', tm.colors, 'logo_path', tm.logo_path, 'timezone', tm.timezone),
    'rules', (select jsonb_build_object('name', r.name, 'rules', r.rules, 'restart', r.restart)
      from public.tiebreak_rule_set r where r.id = t.tiebreak_set_id and r.team_id = t.team_id),
    'teams', coalesce((select jsonb_agg(jsonb_build_object(
        'id', x.id, 'name', x.name, 'hometown', x.hometown, 'class_label', x.class_label,
        'is_us', x.is_us) order by x.name)
      from public.tournament_team x where x.tournament_id = t.id), '[]'::jsonb),
    'games', coalesce((select jsonb_agg(jsonb_build_object(
        'id', g.id, 'game_no', g.game_no, 'stage', g.stage, 'pool', g.pool, 'round', g.round,
        'game_date', g.game_date, 'start_time', g.start_time, 'venue', g.venue, 'field', g.field,
        'home', g.home, 'away', g.away, 'home_team_id', g.home_team_id,
        'away_team_id', g.away_team_id, 'score_home', g.score_home, 'score_away', g.score_away,
        'locked', g.locked))
      from public.tournament_game g where g.tournament_id = t.id), '[]'::jsonb))
  from public.tournament t
  join public.team tm on tm.id = t.team_id
  where p_token ~ '^[A-Za-z0-9]{12,40}$' and t.share_token = p_token;
$$;
revoke execute on function public.shared_tournament(text) from public;
grant execute on function public.shared_tournament(text) to anon, authenticated;
