-- A kid's own record across teams (an "athlete"): coaches make new teams every year, and kids
-- switch teams, so a kid's box score stats belong to the family, not to one team's player.
-- Every kid a parent links to gets an athlete; on a new team the parent says "same kid as
-- Jake on the Knights" once, and the stats carry forward, like a big leaguer traded. Deleting
-- an old team (or leaving it) keeps them. Only the kid's parents ever see an athlete.

create table public.athlete (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now()
);

create table public.athlete_guardian (
  athlete_id uuid not null references public.athlete (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (athlete_id, user_id)
);
create index on public.athlete_guardian (user_id);

alter table public.player add column athlete_id uuid references public.athlete (id) on delete set null;
create index on public.player (athlete_id);

create function public.is_athlete_guardian(p_athlete_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.athlete_guardian
    where athlete_id = p_athlete_id and user_id = (select auth.uid())
  )
$$;
revoke execute on function public.is_athlete_guardian(uuid) from public, anon;
grant execute on function public.is_athlete_guardian(uuid) to authenticated;

alter table public.athlete enable row level security;
alter table public.athlete_guardian enable row level security;
-- Created and linked only through the functions below.
create policy "parents see their kids" on public.athlete
  for select to authenticated using (public.is_athlete_guardian(id));
create policy "parents see who else is their kid's parent" on public.athlete_guardian
  for select to authenticated using (public.is_athlete_guardian(athlete_id));

-- ── every linked kid has an athlete, and their parents are its parents ──
create function public.ensure_athlete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_athlete uuid;
begin
  select athlete_id into v_athlete from public.player where id = new.player_id;
  if v_athlete is null then
    insert into public.athlete (name)
      select left(trim(name), 80) from public.player where id = new.player_id
      returning id into v_athlete;
    update public.player set athlete_id = v_athlete where id = new.player_id;
  end if;
  insert into public.athlete_guardian (athlete_id, user_id)
    values (v_athlete, new.user_id) on conflict do nothing;
  return new;
end;
$$;

create trigger player_guardian_athlete
  after insert on public.player_guardian
  for each row execute function public.ensure_athlete();

-- Unlinking a kid (a wrong pick, or a coach fixing links) ends that parent's access to the
-- kid's record, unless they're still linked to the kid on another team. Leaving a team or
-- an old team being deleted doesn't: the family keeps the kid's history.
create function public.drop_athlete_guardian()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_athlete uuid;
begin
  if coalesce(current_setting('rallycap.keep_athletes', true), '') = 'on' then
    return old;
  end if;
  -- The player itself is being deleted (its team went away): keep the history.
  select athlete_id into v_athlete from public.player where id = old.player_id;
  if not found or v_athlete is null then
    return old;
  end if;
  if not exists (
    select 1 from public.player_guardian g join public.player p on p.id = g.player_id
    where g.user_id = old.user_id and p.athlete_id = v_athlete and g.id <> old.id
  ) then
    delete from public.athlete_guardian where athlete_id = v_athlete and user_id = old.user_id;
  end if;
  return old;
end;
$$;

create trigger player_guardian_unlink_athlete
  after delete on public.player_guardian
  for each row execute function public.drop_athlete_guardian();

-- Leaving a team drops that person's links to its kids (as before), but not their kids'
-- history.
create or replace function public.drop_guardian_links()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('rallycap.keep_athletes', 'on', true);
  delete from public.player_guardian g
  using public.player p
  where g.player_id = p.id and p.team_id = old.team_id and g.user_id = old.user_id
    and not exists (
      select 1 from public.member m
      where m.team_id = old.team_id and m.user_id = old.user_id and m.id <> old.id
    );
  perform set_config('rallycap.keep_athletes', 'off', true);
  return old;
end;
$$;

-- ── box score stats follow the athlete ──
alter table public.player_game_stat
  add column athlete_id uuid references public.athlete (id) on delete cascade;
create index on public.player_game_stat (athlete_id);
-- An old team being deleted keeps its box scores (on the athlete).
alter table public.player_game_stat alter column player_id drop not null;
alter table public.player_game_stat drop constraint player_game_stat_player_id_fkey;
alter table public.player_game_stat
  add constraint player_game_stat_player_id_fkey
  foreign key (player_id) references public.player (id) on delete set null;

drop policy "parents see their kid's game stats" on public.player_game_stat;
drop policy "parents fix their kid's game stats" on public.player_game_stat;
drop policy "parents remove their kid's game stats" on public.player_game_stat;
create policy "parents see their kid's game stats" on public.player_game_stat
  for select to authenticated
  using (public.is_athlete_guardian(athlete_id) or public.is_guardian_of(player_id));
create policy "parents fix their kid's game stats" on public.player_game_stat
  for update to authenticated
  using (public.is_athlete_guardian(athlete_id) or public.is_guardian_of(player_id))
  with check (public.is_athlete_guardian(athlete_id) or public.is_guardian_of(player_id));
create policy "parents remove their kid's game stats" on public.player_game_stat
  for delete to authenticated
  using (public.is_athlete_guardian(athlete_id) or public.is_guardian_of(player_id));
-- (Adding still needs the kid on a team: "parents add their kid's game stats" stays.)

-- New box scores take the player's athlete (and still the game's date and opponent).
create or replace function public.check_box_score_game()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game record;
begin
  -- The player's team was deleted: the box score stays with the athlete, as it is.
  if new.player_id is null then
    if tg_op = 'INSERT' then
      raise exception 'A box score needs the kid on a team.' using errcode = '23514';
    end if;
    return new;
  end if;
  if new.player_id is not null then
    new.athlete_id := coalesce(
      (select athlete_id from public.player where id = new.player_id),
      new.athlete_id
    );
  end if;
  if new.game_id is null then
    if tg_op = 'INSERT' then
      raise exception 'Pick the game this box score is from.' using errcode = '23514';
    end if;
    return new;
  end if;
  select g.game_date, g.opponent, g.season_id, s.team_id into v_game
  from public.game g join public.season s on s.id = g.season_id
  where g.id = new.game_id;
  if v_game is null or v_game.team_id is distinct from public.player_team_id(new.player_id) then
    raise exception 'That game isn''t on this player''s team.' using errcode = '23514';
  end if;
  new.game_date := v_game.game_date;
  new.opponent := left(v_game.opponent, 80);
  new.season_id := v_game.season_id;
  return new;
end;
$$;

-- ── "Same kid as Jake on the Knights": join a team's player to the family's athlete ──
create function public.link_player_athlete(p_player_id uuid, p_athlete_id uuid)
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
    insert into public.athlete_guardian (athlete_id, user_id)
      select p_athlete_id, user_id from public.athlete_guardian where athlete_id = v_old
      on conflict do nothing;
    if not exists (select 1 from public.player where athlete_id = v_old) then
      delete from public.athlete where id = v_old;
    end if;
  end if;
end;
$$;
revoke execute on function public.link_player_athlete(uuid, uuid) from public, anon;
grant execute on function public.link_player_athlete(uuid, uuid) to authenticated;

-- Undo a wrong join: this team's player gets its own record again, with this team's stats.
create function public.split_player_athlete(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old uuid;
  v_new uuid;
begin
  if not public.is_guardian_of(p_player_id) then
    raise exception 'You can only change your own kids.' using errcode = '42501';
  end if;
  select athlete_id into v_old from public.player where id = p_player_id;
  if v_old is null or not exists (
    select 1 from public.player where athlete_id = v_old and id <> p_player_id
  ) then
    return;
  end if;
  insert into public.athlete (name)
    select left(trim(name), 80) from public.player where id = p_player_id
    returning id into v_new;
  update public.player set athlete_id = v_new where id = p_player_id;
  update public.player_game_stat set athlete_id = v_new where player_id = p_player_id;
  insert into public.athlete_guardian (athlete_id, user_id)
    select v_new, user_id from public.player_guardian where player_id = p_player_id
    on conflict do nothing;
end;
$$;
revoke execute on function public.split_player_athlete(uuid) from public, anon;
grant execute on function public.split_player_athlete(uuid) to authenticated;

-- The caller's kids and the teams each has played for (team names only), for My player.
create function public.my_athletes()
returns table (athlete_id uuid, name text, player_id uuid, team_id uuid, team_name text, season_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.name, p.id, t.id, t.name,
    (select s.name from public.season s where s.team_id = t.id order by s.start_date desc nulls last limit 1)
  from public.athlete_guardian ag
  join public.athlete a on a.id = ag.athlete_id
  left join public.player p on p.athlete_id = a.id
  left join public.team t on t.id = p.team_id
  where ag.user_id = (select auth.uid())
  order by a.name, t.name
$$;
revoke execute on function public.my_athletes() from public, anon;
grant execute on function public.my_athletes() to authenticated;

-- ── everyone already linked gets an athlete, with their box scores on it ──
do $$
declare
  r record;
  v_athlete uuid;
begin
  for r in select distinct p.id, p.name from public.player p
    join public.player_guardian g on g.player_id = p.id
    where p.athlete_id is null
  loop
    insert into public.athlete (name) values (left(trim(r.name), 80)) returning id into v_athlete;
    update public.player set athlete_id = v_athlete where id = r.id;
    insert into public.athlete_guardian (athlete_id, user_id)
      select v_athlete, user_id from public.player_guardian where player_id = r.id
      on conflict do nothing;
  end loop;
end $$;
update public.player_game_stat s set athlete_id = p.athlete_id
  from public.player p where p.id = s.player_id and s.athlete_id is null;
