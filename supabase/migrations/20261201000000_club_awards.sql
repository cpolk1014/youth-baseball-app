-- Club awards (Team MVP and the like). A club's admins make the season's awards, then
-- make them live with a due date. Each club team's coaches pick one player per award.
-- Picks are private: the club collects them for its awards show (no parents, no team view).

create table public.club_award (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id) on delete cascade,
  season_label text not null check (season_label ~ '^[0-9]{4}-[0-9]{2}$'),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  description text check (description is null or char_length(description) <= 200),
  emoji text check (emoji is null or char_length(emoji) <= 16),
  sort integer not null default 0,
  -- Live: coaches see it and pick until due_on (in their team's time zone).
  live_at timestamptz,
  due_on date,
  created_at timestamptz not null default now(),
  unique (organization_id, season_label, name),
  check (live_at is null or due_on is not null)
);

create index on public.club_award (organization_id, season_label);

create table public.club_award_pick (
  award_id uuid not null references public.club_award (id) on delete cascade,
  team_id uuid not null references public.team (id) on delete cascade,
  player_id uuid not null references public.player (id) on delete cascade,
  note text check (note is null or char_length(note) <= 200),
  picked_by uuid references auth.users (id) on delete set null,
  picked_at timestamptz not null default now(),
  primary key (award_id, team_id)
);

create index on public.club_award_pick (team_id);

alter table public.club_award enable row level security;
alter table public.club_award_pick enable row level security;

-- Club admins make and change their awards. Coaches read them through team_club_awards.
create policy "club admins manage their awards" on public.club_award
  for all to authenticated
  using (public.is_club_admin(organization_id))
  with check (public.is_club_admin(organization_id));

-- Club admins read the picks; coaches pick only through pick_club_award.
create policy "club admins see their awards' picks" on public.club_award_pick
  for select to authenticated
  using (exists (
    select 1 from public.club_award a
    where a.id = award_id and public.is_club_admin(a.organization_id)
  ));

/* The team holds an active code from the award's club for the award's season. */
create function public.club_award_team_ok(p_award uuid, p_team uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.club_award a
    join public.club_code c
      on c.organization_id = a.organization_id and c.season_label = a.season_label
    where a.id = p_award and c.team_id = p_team and c.expires_on >= current_date
  );
$$;

revoke execute on function public.club_award_team_ok(uuid, uuid) from public, anon;
grant execute on function public.club_award_team_ok(uuid, uuid) to authenticated;

/*
 * A team's live club awards with its pick (coaches and managers of the team). Picking
 * is open through due_on in the team's time zone.
 */
create function public.team_club_awards(p_team uuid)
returns table (
  award_id uuid,
  club_name text,
  name text,
  description text,
  emoji text,
  due_on date,
  open boolean,
  player_id uuid,
  note text,
  picked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date;
begin
  if not public.has_team_role(p_team, '{coach,manager}') then
    return;
  end if;
  select (now() at time zone coalesce(t.timezone, 'America/Chicago'))::date into v_today
  from public.team t where t.id = p_team;
  return query
  select a.id, o.name, a.name, a.description, a.emoji, a.due_on,
    a.due_on >= v_today,
    p.player_id, p.note, p.picked_at
  from public.club_award a
  join public.organization o on o.id = a.organization_id
  left join public.club_award_pick p on p.award_id = a.id and p.team_id = p_team
  where a.live_at is not null and public.club_award_team_ok(a.id, p_team)
  order by a.sort, a.created_at;
end;
$$;

revoke execute on function public.team_club_awards(uuid) from public, anon;
grant execute on function public.team_club_awards(uuid) to authenticated;

/* A team's coach picks (or changes) the winner of a live award, through its due date. */
create function public.pick_club_award(p_award uuid, p_team uuid, p_player uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_due date;
  v_today date;
begin
  if not public.has_team_role(p_team, '{coach}') then
    raise exception 'Only the team''s coaches pick award winners.' using errcode = 'insufficient_privilege';
  end if;
  select a.due_on into v_due from public.club_award a
  where a.id = p_award and a.live_at is not null;
  if v_due is null or not public.club_award_team_ok(p_award, p_team) then
    raise exception 'That award isn''t open for this team.' using errcode = 'insufficient_privilege';
  end if;
  select (now() at time zone coalesce(t.timezone, 'America/Chicago'))::date into v_today
  from public.team t where t.id = p_team;
  if v_today > v_due then
    raise exception 'Picks for this award closed on %. Ask your club to reopen it.', to_char(v_due, 'Mon FMDD')
      using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.player pl where pl.id = p_player and pl.team_id = p_team) then
    raise exception 'Pick a player from your roster.' using errcode = 'check_violation';
  end if;
  insert into public.club_award_pick (award_id, team_id, player_id, note, picked_by)
  values (p_award, p_team, p_player, nullif(btrim(coalesce(p_note, '')), ''), (select auth.uid()))
  on conflict (award_id, team_id) do update
    set player_id = excluded.player_id, note = excluded.note,
        picked_by = excluded.picked_by, picked_at = now();
end;
$$;

revoke execute on function public.pick_club_award(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.pick_club_award(uuid, uuid, uuid, text) to authenticated;

/* A team's coach clears their pick while the award is open. */
create function public.unpick_club_award(p_award uuid, p_team uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_due date;
  v_today date;
begin
  if not public.has_team_role(p_team, '{coach}') then
    raise exception 'Only the team''s coaches pick award winners.' using errcode = 'insufficient_privilege';
  end if;
  select a.due_on into v_due from public.club_award a where a.id = p_award and a.live_at is not null;
  select (now() at time zone coalesce(t.timezone, 'America/Chicago'))::date into v_today
  from public.team t where t.id = p_team;
  if v_due is null or v_today > v_due then
    raise exception 'Picks for this award are closed.' using errcode = 'check_violation';
  end if;
  delete from public.club_award_pick where award_id = p_award and team_id = p_team;
end;
$$;

revoke execute on function public.unpick_club_award(uuid, uuid) from public, anon;
grant execute on function public.unpick_club_award(uuid, uuid) to authenticated;

/*
 * The club's awards board for a season: every award × every team with an active code
 * that season, with the pick (or nulls). Club admins only.
 */
create function public.club_award_board(p_org uuid, p_season text)
returns table (
  award_id uuid,
  team_id uuid,
  team_name text,
  age_group text,
  head_coach text,
  player_id uuid,
  player_name text,
  jersey_number integer,
  note text,
  picked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_club_admin(p_org) then
    raise exception 'Only club admins can see the club''s awards.' using errcode = 'insufficient_privilege';
  end if;
  return query
  with teams as (
    select distinct t.id, t.name, t.age_group
    from public.club_code c join public.team t on t.id = c.team_id
    where c.organization_id = p_org and c.season_label = p_season and c.expires_on >= current_date
  )
  select a.id, t.id, t.name, t.age_group,
    (select m.display_name from public.member m
      where m.team_id = t.id and m.role in ('owner', 'coach') and m.display_name is not null
      order by (m.role = 'owner') desc limit 1),
    p.player_id, pl.name, pl.jersey_number::integer, p.note, p.picked_at
  from public.club_award a
  cross join teams t
  left join public.club_award_pick p on p.award_id = a.id and p.team_id = t.id
  left join public.player pl on pl.id = p.player_id
  where a.organization_id = p_org and a.season_label = p_season and a.live_at is not null
  order by t.age_group, t.name, a.sort, a.created_at;
end;
$$;

revoke execute on function public.club_award_board(uuid, text) from public, anon;
grant execute on function public.club_award_board(uuid, text) to authenticated;
