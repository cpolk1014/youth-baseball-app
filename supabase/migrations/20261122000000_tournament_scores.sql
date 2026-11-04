-- Tournaments, phase 3: scores. Anyone on the team (parents included) reports the score of
-- any game we're not in; a coach or manager can correct it and lock it. Our own games are
-- scored the usual way, by marking the team game final, and that score copies over here.

alter table public.tournament_game
  add column score_home smallint check (score_home is null or score_home between 0 and 99),
  add column score_away smallint check (score_away is null or score_away between 0 and 99),
  add column reported_by uuid references auth.users (id) on delete set null,
  add column reported_at timestamptz,
  add column locked boolean not null default false,
  add constraint tournament_game_score_pair check ((score_home is null) = (score_away is null));

-- Report (or clear, with both null) the score of a game we're not in.
create function public.report_tournament_score(p_id uuid, p_home integer, p_away integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team uuid;
  v_game uuid;
  v_locked boolean;
  v_coach boolean;
begin
  select t.team_id, g.game_id, g.locked into v_team, v_game, v_locked
  from public.tournament_game g join public.tournament t on t.id = g.tournament_id
  where g.id = p_id;
  if v_team is null or not public.is_team_member(v_team) then
    raise exception 'That game wasn''t found.' using errcode = '42501';
  end if;
  if exists (select 1 from public.team where id = v_team and optioned_at is not null) then
    raise exception 'This team is optioned.' using errcode = '42501';
  end if;
  if v_game is not null then
    raise exception 'Our games are scored by marking the game final.' using errcode = '22023';
  end if;
  v_coach := public.has_team_role(v_team, '{coach,manager}');
  if v_locked and not v_coach then
    raise exception 'The coach locked this score.' using errcode = '42501';
  end if;
  if (p_home is null) <> (p_away is null)
    or p_home not between 0 and 99 or p_away not between 0 and 99 then
    raise exception 'Enter both scores (0 to 99).' using errcode = '22023';
  end if;
  update public.tournament_game
  set score_home = p_home,
      score_away = p_away,
      reported_by = case when p_home is null then null else auth.uid() end,
      reported_at = case when p_home is null then null else now() end,
      updated_at = now()
  where id = p_id;
end;
$$;

revoke execute on function public.report_tournament_score(uuid, integer, integer) from public, anon;
grant execute on function public.report_tournament_score(uuid, integer, integer) to authenticated;

-- Our team game's final score, copied to its tournament game (cleared when it's reopened).
create function public.sync_tournament_score()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_us_home boolean;
begin
  for r in
    select g.id, g.home, g.away, g.home_team_id, g.away_team_id, us.id as us_id, us.name as us_name
    from public.tournament_game g
    left join public.tournament_team us on us.tournament_id = g.tournament_id and us.is_us
    where g.game_id = new.id
  loop
    v_us_home := case
      when r.us_id is not null and r.home_team_id = r.us_id then true
      when r.us_id is not null and r.away_team_id = r.us_id then false
      when lower(trim(r.home)) = lower(trim(r.us_name)) then true
      when lower(trim(r.away)) = lower(trim(r.us_name)) then false
    end;
    if v_us_home is null then
      continue;
    end if;
    if new.status = 'final' and new.score_us is not null and new.score_them is not null then
      update public.tournament_game
      set score_home = case when v_us_home then new.score_us else new.score_them end,
          score_away = case when v_us_home then new.score_them else new.score_us end,
          reported_by = auth.uid(),
          reported_at = now(),
          updated_at = now()
      where id = r.id;
    else
      update public.tournament_game
      set score_home = null, score_away = null, reported_by = null, reported_at = null,
          updated_at = now()
      where id = r.id and score_home is not null;
    end if;
  end loop;
  return null;
end;
$$;

create trigger game_tournament_score
  after update of status, score_us, score_them on public.game
  for each row
  when (old.status is distinct from new.status
    or old.score_us is distinct from new.score_us
    or old.score_them is distinct from new.score_them)
  execute function public.sync_tournament_score();
