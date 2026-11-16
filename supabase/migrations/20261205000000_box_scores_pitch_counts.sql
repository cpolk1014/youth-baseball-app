-- Box scores move to coaches, pitch counts for parents, and every stats import is kept.
--
-- 1. Coaches and managers upload a game's GameChanger box score (or type pitch counts): one
--    line per kid per game in player_game_stat, marked source 'coach'. Coaches see and change
--    only their own team's coach lines (never a family's own imports, source 'parent', which
--    the app no longer offers but which stay with the family). A kid's linked parents see the
--    coach lines too, with a player pass.
-- 2. Parents keep a pitch count log per kid (pitch_session, on the kid's athlete record so it
--    follows them from team to team): team games, bullpens, lessons and games subbing for
--    another team. A coach's count for a game is offered to approve (a session) or deny.
-- 3. Every GameChanger stats import is kept (team_stats_import), for hot and cold streaks in
--    competitive lineups. team_stats stays the latest one, as the Stats page shows.

-- ── 1. coach box scores ──
alter table public.player_game_stat
  add column source text not null default 'parent' check (source in ('parent', 'coach')),
  -- Typed pitch counts only: no batting line, so they don't count as games batted.
  add column pitch_only boolean not null default false;

-- Parents change only their own imports; coach lines are the team's.
drop policy "parents fix their kid's game stats" on public.player_game_stat;
drop policy "parents remove their kid's game stats" on public.player_game_stat;
drop policy "parents see their kid's game stats" on public.player_game_stat;
create policy "parents see their kid's game stats" on public.player_game_stat
  for select to authenticated
  using (
    (public.is_athlete_guardian(athlete_id) or public.is_guardian_of(player_id))
    and (source = 'parent' or public.family_access(athlete_id))
  );
create policy "parents fix their kid's game stats" on public.player_game_stat
  for update to authenticated
  using (source = 'parent' and (public.is_athlete_guardian(athlete_id) or public.is_guardian_of(player_id)))
  with check (source = 'parent' and (public.is_athlete_guardian(athlete_id) or public.is_guardian_of(player_id)));
create policy "parents remove their kid's game stats" on public.player_game_stat
  for delete to authenticated
  using (source = 'parent' and (public.is_athlete_guardian(athlete_id) or public.is_guardian_of(player_id)));
-- (Their insert rule stays, for parent lines only.)
drop policy "parents with a pass add their kid's game stats" on public.player_game_stat;
create policy "parents with a pass add their kid's game stats" on public.player_game_stat
  for insert to authenticated
  with check (source = 'parent' and not pitch_only and public.is_guardian_of(player_id) and public.family_access(athlete_id));

create policy "coaches and managers see their team's box scores" on public.player_game_stat
  for select to authenticated
  using (source = 'coach' and public.has_team_role(public.player_team_id(player_id), '{coach,manager}'));
create policy "clubs see their teams' box scores" on public.player_game_stat
  for select to authenticated
  using (source = 'coach' and public.club_sees_team(public.player_team_id(player_id)));

-- A kid's lines follow their record when a parent links them (new athlete, or joined).
create function public.player_athlete_follow()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.player_game_stat set athlete_id = new.athlete_id
    where player_id = new.id and athlete_id is distinct from new.athlete_id;
  return new;
end;
$$;
create trigger player_athlete_follow
  after update of athlete_id on public.player
  for each row when (new.athlete_id is not null)
  execute function public.player_athlete_follow();

/*
 * A coach or manager saves a game's box score: p_lines is an array of
 *   { player_id, box_name, batting, pitching, errors, positions }.
 * It replaces the game's box score (typed pitch counts for a kid not in it are dropped too).
 * A family's own import of the same game is replaced by the team's line.
 * With p_pitch_only, p_lines is every pitcher's count ({ player_id, pitches, strikes }): it
 * sets those counts on the game's lines, adding pitch-count-only lines where there's no box
 * score line, and drops counts for kids no longer listed.
 */
create function public.save_game_box_score(p_game uuid, p_lines jsonb, p_pitch_only boolean default false)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team uuid;
  v_game record;
  v_line jsonb;
  v_player uuid;
  v_ids uuid[] := '{}';
  v_count integer := 0;
  v_pitching jsonb;
begin
  select s.team_id, g.score_us, g.score_them, t.name as team_name into v_game
    from public.game g join public.season s on s.id = g.season_id join public.team t on t.id = s.team_id
    where g.id = p_game;
  v_team := v_game.team_id;
  if v_team is null or not public.has_team_role(v_team, '{coach,manager}') then
    raise exception 'Only coaches and managers can add box scores.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) > 40 then
    raise exception 'That box score doesn''t look right.' using errcode = '22023';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_player := (v_line ->> 'player_id')::uuid;
    if v_player is null or public.player_team_id(v_player) is distinct from v_team then
      raise exception 'Every line needs a player on this team.' using errcode = '23514';
    end if;
    if v_player = any (v_ids) then
      raise exception 'A player is in the box score twice.' using errcode = '23505';
    end if;
    v_ids := v_ids || v_player;

    if p_pitch_only then
      v_pitching := jsonb_build_object(
        'pitches', least(200, greatest(0, coalesce((v_line ->> 'pitches')::integer, 0))),
        'strikes', least(200, greatest(0, coalesce((v_line ->> 'strikes')::integer, 0))));
      if exists (select 1 from public.player_game_stat where player_id = v_player and game_id = p_game and source = 'coach') then
        update public.player_game_stat
          set pitching = coalesce(pitching, '{}'::jsonb) || v_pitching, imported_at = now()
          where player_id = v_player and game_id = p_game;
      else
        insert into public.player_game_stat
          (player_id, game_id, game_date, opponent, our_runs, their_runs, team_name, batting, pitching, source, pitch_only)
        values (v_player, p_game, current_date, 'x', v_game.score_us, v_game.score_them, left(v_game.team_name, 80),
          '{}'::jsonb, v_pitching, 'coach', true)
        on conflict (player_id, game_id) do update
          set batting = '{}'::jsonb, pitching = excluded.pitching, source = 'coach', pitch_only = true,
              errors = 0, positions = '{}', box_name = null, imported_at = now(), imported_by = (select auth.uid());
      end if;
    else
      insert into public.player_game_stat
        (player_id, game_id, game_date, opponent, our_runs, their_runs, team_name, box_name,
         batting, pitching, errors, positions, source, pitch_only)
      values (
        v_player, p_game, current_date, 'x', v_game.score_us, v_game.score_them, left(v_game.team_name, 80),
        left(v_line ->> 'box_name', 60),
        coalesce(v_line -> 'batting', '{}'::jsonb),
        case when jsonb_typeof(v_line -> 'pitching') = 'object' then v_line -> 'pitching' end,
        least(30, greatest(0, coalesce((v_line ->> 'errors')::integer, 0))),
        coalesce((select array_agg(left(p, 4)) from jsonb_array_elements_text(coalesce(v_line -> 'positions', '[]'::jsonb)) p), '{}'),
        'coach', false)
      on conflict (player_id, game_id) do update
        set box_name = excluded.box_name, batting = excluded.batting, pitching = excluded.pitching,
            errors = excluded.errors, positions = excluded.positions, our_runs = excluded.our_runs,
            their_runs = excluded.their_runs, team_name = excluded.team_name, source = 'coach',
            pitch_only = false, imported_at = now(), imported_by = (select auth.uid());
    end if;
    v_count := v_count + 1;
  end loop;

  if p_pitch_only then
    -- Pitchers taken off the list: drop their count (and a count-only line altogether).
    delete from public.player_game_stat
      where game_id = p_game and source = 'coach' and pitch_only and not (player_id = any (v_ids));
    update public.player_game_stat set pitching = null
      where game_id = p_game and source = 'coach' and not pitch_only and not (player_id = any (v_ids))
        and pitching is not null and coalesce((pitching ->> 'outs')::integer, 0) = 0;
    update public.player_game_stat set pitching = pitching - 'pitches' - 'strikes'
      where game_id = p_game and source = 'coach' and not pitch_only and not (player_id = any (v_ids))
        and pitching is not null;
  else
    delete from public.player_game_stat
      where game_id = p_game and source = 'coach' and not (player_id = any (v_ids));
  end if;
  return v_count;
end;
$$;
revoke execute on function public.save_game_box_score(uuid, jsonb, boolean) from public, anon;
grant execute on function public.save_game_box_score(uuid, jsonb, boolean) to authenticated;

-- Take a game's box score off (coaches and managers).
create function public.clear_game_box_score(p_game uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_team uuid;
begin
  select s.team_id into v_team from public.game g join public.season s on s.id = g.season_id where g.id = p_game;
  if v_team is null or not public.has_team_role(v_team, '{coach,manager}') then
    raise exception 'Only coaches and managers can remove box scores.' using errcode = '42501';
  end if;
  delete from public.player_game_stat where game_id = p_game and source = 'coach';
end;
$$;
revoke execute on function public.clear_game_box_score(uuid) from public, anon;
grant execute on function public.clear_game_box_score(uuid) to authenticated;

-- A game marked final (or its score fixed) updates its box score's result.
create function public.box_score_result()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.player_game_stat set our_runs = new.score_us, their_runs = new.score_them
    where game_id = new.id and source = 'coach';
  return new;
end;
$$;
create trigger game_box_score_result
  after update of score_us, score_them on public.game
  for each row execute function public.box_score_result();

-- ── 2. pitch counts ──
-- Which Pitch Smart ages a kid's limits use (null: from their team's age group).
alter table public.athlete
  add column pitch_ages text check (pitch_ages in ('7-8', '9-10', '11-12', '13-14'));

create function public.set_pitch_ages(p_athlete uuid, p_ages text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_athlete_guardian(p_athlete) then
    raise exception 'You can only change your own kids.' using errcode = '42501';
  end if;
  update public.athlete set pitch_ages = p_ages where id = p_athlete;
end;
$$;
revoke execute on function public.set_pitch_ages(uuid, text) from public, anon;
grant execute on function public.set_pitch_ages(uuid, text) to authenticated;

create table public.pitch_session (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athlete (id) on delete cascade,
  kind text not null check (kind in ('game', 'bullpen', 'lesson', 'other_team')),
  session_date date not null,
  pitches smallint not null check (pitches between 1 and 200),
  strikes smallint check (strikes is null or strikes between 0 and pitches),
  -- One of the kid's team's games (a team game the parent logged, or the coach's count).
  game_id uuid references public.game (id) on delete set null,
  -- The coach's count this came from (approved by the parent).
  stat_id uuid unique references public.player_game_stat (id) on delete set null,
  -- The opponent, the other team's name, or who ran the lesson.
  label text check (label is null or length(label) <= 80),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.pitch_session (athlete_id, session_date);

-- A coach's count the parent said no to (shown again if the coach changes it).
create table public.pitch_dismissal (
  stat_id uuid primary key references public.player_game_stat (id) on delete cascade,
  athlete_id uuid not null references public.athlete (id) on delete cascade,
  pitches smallint not null,
  dismissed_by uuid default auth.uid() references auth.users (id) on delete set null,
  dismissed_at timestamptz not null default now()
);

-- A session's game must be one of the kid's teams' games, and a coach's count must be theirs.
create function public.check_pitch_session()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.game_id is not null and not exists (
    select 1 from public.game g join public.season s on s.id = g.season_id
      join public.player p on p.team_id = s.team_id and p.athlete_id = new.athlete_id
    where g.id = new.game_id
  ) then
    raise exception 'That game isn''t on this player''s team.' using errcode = '23514';
  end if;
  if new.stat_id is not null and not exists (
    select 1 from public.player_game_stat where id = new.stat_id and athlete_id = new.athlete_id and source = 'coach'
  ) then
    raise exception 'That count isn''t for this player.' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger pitch_session_check
  before insert or update on public.pitch_session
  for each row execute function public.check_pitch_session();

create function public.check_pitch_dismissal()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.player_game_stat where id = new.stat_id and athlete_id = new.athlete_id and source = 'coach'
  ) then
    raise exception 'That count isn''t for this player.' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger pitch_dismissal_check
  before insert or update on public.pitch_dismissal
  for each row execute function public.check_pitch_dismissal();

alter table public.pitch_session enable row level security;
alter table public.pitch_dismissal enable row level security;

-- The kid's parents only. Adding or changing needs a player pass; looking back doesn't.
create policy "parents see their kid's pitch counts" on public.pitch_session
  for select to authenticated using (public.is_athlete_guardian(athlete_id));
create policy "parents with a pass log pitches" on public.pitch_session
  for insert to authenticated
  with check (public.is_athlete_guardian(athlete_id) and public.family_access(athlete_id));
create policy "parents with a pass fix pitch counts" on public.pitch_session
  for update to authenticated
  using (public.is_athlete_guardian(athlete_id))
  with check (public.is_athlete_guardian(athlete_id) and public.family_access(athlete_id));
create policy "parents remove pitch counts" on public.pitch_session
  for delete to authenticated using (public.is_athlete_guardian(athlete_id));

create policy "parents see what they said no to" on public.pitch_dismissal
  for select to authenticated using (public.is_athlete_guardian(athlete_id));
create policy "parents with a pass say no to a count" on public.pitch_dismissal
  for insert to authenticated
  with check (public.is_athlete_guardian(athlete_id) and public.family_access(athlete_id));
create policy "parents change their mind" on public.pitch_dismissal
  for update to authenticated
  using (public.is_athlete_guardian(athlete_id))
  with check (public.is_athlete_guardian(athlete_id));
create policy "parents undo a no" on public.pitch_dismissal
  for delete to authenticated using (public.is_athlete_guardian(athlete_id));

-- Joining a kid's records ("same player as on the Knights") brings their pitch log along.
create or replace function public.link_player_athlete(p_player_id uuid, p_athlete_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old uuid;
begin
  if not public.is_guardian_of(p_player_id) or not public.is_athlete_guardian(p_athlete_id) then
    raise exception 'You can only join your own kids.' using errcode = '42501';
  end if;
  select athlete_id into v_old from public.player where id = p_player_id;
  if v_old = p_athlete_id then
    return;
  end if;
  update public.player set athlete_id = p_athlete_id where id = p_player_id;
  if v_old is not null then
    update public.player_game_stat set athlete_id = p_athlete_id where athlete_id = v_old;
    update public.pitch_session set athlete_id = p_athlete_id where athlete_id = v_old;
    update public.pitch_dismissal set athlete_id = p_athlete_id where athlete_id = v_old;
    update public.athlete set pitch_ages = coalesce(pitch_ages, (select pitch_ages from public.athlete where id = v_old))
      where id = p_athlete_id;
    insert into public.athlete_guardian (athlete_id, user_id)
      select p_athlete_id, user_id from public.athlete_guardian where athlete_id = v_old
      on conflict do nothing;
    insert into public.family_pass_athlete (pass_id, athlete_id)
      select pass_id, p_athlete_id from public.family_pass_athlete where athlete_id = v_old
      on conflict do nothing;
    if not exists (select 1 from public.player where athlete_id = v_old) then
      delete from public.athlete where id = v_old;
    end if;
  end if;
end;
$$;

-- ── 3. every stats import, kept ──
create table public.team_stats_import (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.season (id) on delete cascade,
  data jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) < 500000),
  imported_at timestamptz not null default now()
);
create index on public.team_stats_import (season_id, imported_at);
alter table public.team_stats_import enable row level security;
create policy "coaches and managers see past imports" on public.team_stats_import
  for select to authenticated
  using (public.has_team_role(public.season_team_id(season_id), '{coach,manager}'));
create policy "clubs see their teams' past imports" on public.team_stats_import
  for select to authenticated using (public.club_sees_team(public.season_team_id(season_id)));
-- Written only by the trigger below.

create function public.keep_team_stats_import()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.team_stats_import (season_id, data, imported_at)
    values (new.season_id, new.data, new.imported_at);
  return new;
end;
$$;
create trigger team_stats_keep_import
  after insert or update on public.team_stats
  for each row execute function public.keep_team_stats_import();

-- The import already there is the first one kept.
insert into public.team_stats_import (season_id, data, imported_at)
  select season_id, data, imported_at from public.team_stats;
