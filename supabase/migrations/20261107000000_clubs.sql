-- Clubs (Phase 1). A club is an organization with admins (director, admins). It buys a
-- code per team per season (August–June); a team's coach enters the code to join the club
-- and unlock the team. While a team holds an active code, the club's admins can VIEW (never
-- change) its players, games, lineups, season settings, imported team stats and coaches'
-- names. Not money, parents, walk-ups, GroupMe or parents' own imports.

create table public.club_admin (
  organization_id uuid not null references public.organization (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'admin' check (role in ('director', 'admin')),
  display_name text check (display_name is null or length(display_name) <= 60),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index on public.club_admin (user_id);

create table public.club_code (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id) on delete cascade,
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  -- "2026-27": August through June
  season_label text not null check (season_label ~ '^[0-9]{4}-[0-9]{2}$'),
  expires_on date not null,
  team_id uuid references public.team (id) on delete set null,
  redeemed_by uuid references auth.users (id) on delete set null,
  redeemed_at timestamptz,
  created_at timestamptz not null default now(),
  -- One code per team per season.
  unique (team_id, season_label)
);

create index on public.club_code (organization_id);

alter table public.club_admin enable row level security;
alter table public.club_code enable row level security;

create function public.is_club_admin(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.club_admin a
    where a.organization_id = p_org and a.user_id = (select auth.uid())
  );
$$;

/* The signed-in user is an admin of a club this team holds an active code from. */
create function public.club_sees_team(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.club_code c
    join public.club_admin a on a.organization_id = c.organization_id
    where c.team_id = p_team_id and a.user_id = (select auth.uid())
      and c.expires_on >= current_date
  );
$$;

revoke execute on function public.is_club_admin(uuid) from public, anon;
grant execute on function public.is_club_admin(uuid) to authenticated;
revoke execute on function public.club_sees_team(uuid) from public, anon;
grant execute on function public.club_sees_team(uuid) to authenticated;

create policy "club admins see their club's admins" on public.club_admin
  for select to authenticated using (public.is_club_admin(organization_id));
create policy "club admins see their codes; coaches see their team's" on public.club_code
  for select to authenticated
  using (
    public.is_club_admin(organization_id)
    or (team_id is not null and public.has_team_role(team_id, '{coach,manager}'))
  );
create policy "club admins can read their club" on public.organization
  for select to authenticated using (public.is_club_admin(id));

-- View-only access for club admins (policies add up: these only ever allow reading).
create policy "club admins view their teams" on public.team
  for select to authenticated using (public.club_sees_team(id));
create policy "club admins view their teams' seasons" on public.season
  for select to authenticated using (public.club_sees_team(team_id));
create policy "club admins view their teams' players" on public.player
  for select to authenticated using (public.club_sees_team(team_id));
create policy "club admins view their teams' games" on public.game
  for select to authenticated using (public.club_sees_team(public.season_team_id(season_id)));
create policy "club admins view their teams' lineups" on public.lineup
  for select to authenticated using (public.club_sees_team(public.game_team_id(game_id)));
create policy "club admins view their teams' lineup spots" on public.lineup_slot
  for select to authenticated using (public.club_sees_team(public.lineup_team_id(lineup_id)));
create policy "club admins view their teams' imported stats" on public.team_stats
  for select to authenticated using (public.club_sees_team(public.season_team_id(season_id)));
create policy "club admins see their teams' coaches" on public.member
  for select to authenticated
  using (role in ('owner', 'coach') and public.club_sees_team(team_id));

/*
 * A team's coach enters a club code: the team joins the club for that season (keeping all
 * its data). Codes are single use; a team holds one per season.
 */
create function public.redeem_club_code(p_team_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.club_code;
  club text;
begin
  if not public.has_team_role(p_team_id, '{coach}') then
    raise exception 'Only a coach can enter a club code.' using errcode = 'insufficient_privilege';
  end if;
  select * into c from public.club_code
  where code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'))
  for update;
  if not found then
    raise exception 'That code isn''t right. Check it with your club.' using errcode = 'P0002';
  end if;
  if c.team_id = p_team_id then
    select name into club from public.organization where id = c.organization_id;
    return jsonb_build_object('club', club, 'season', c.season_label);
  end if;
  if c.team_id is not null then
    raise exception 'That code has already been used by another team.' using errcode = 'P0001';
  end if;
  if c.expires_on < current_date then
    raise exception 'That code has expired.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.club_code x where x.team_id = p_team_id and x.season_label = c.season_label
  ) then
    raise exception 'This team already has a club code for %.', c.season_label using errcode = 'P0001';
  end if;
  update public.club_code
    set team_id = p_team_id, redeemed_by = (select auth.uid()), redeemed_at = now()
    where id = c.id;
  update public.team set organization_id = c.organization_id where id = p_team_id;
  select name into club from public.organization where id = c.organization_id;
  return jsonb_build_object('club', club, 'season', c.season_label);
end;
$$;

revoke execute on function public.redeem_club_code(uuid, text) from public, anon;
grant execute on function public.redeem_club_code(uuid, text) to authenticated;

/*
 * A club's dashboard: each team with an active code, with its head coach, roster size,
 * record, next game and when a lineup was last saved. Club admins only.
 */
create function public.club_overview(p_org uuid)
returns table (
  team_id uuid,
  team_name text,
  age_group text,
  colors text[],
  logo_path text,
  season_label text,
  head_coach text,
  players integer,
  wins integer,
  losses integer,
  ties integer,
  next_game_date date,
  next_game_time time,
  next_opponent text,
  last_lineup_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_club_admin(p_org) then
    raise exception 'Only club admins can see the club.' using errcode = 'insufficient_privilege';
  end if;
  return query
  with teams as (
    select distinct on (t.id) t.*, c.season_label as code_season
    from public.club_code c join public.team t on t.id = c.team_id
    where c.organization_id = p_org and c.expires_on >= current_date
    order by t.id, c.season_label desc
  ),
  seasons as (
    select distinct on (s.team_id) s.team_id, s.id
    from public.season s join teams t on t.id = s.team_id
    order by s.team_id, s.start_date desc nulls last, s.created_at desc
  )
  select
    t.id, t.name, t.age_group, t.colors, t.logo_path, t.code_season,
    (select m.display_name from public.member m
      where m.team_id = t.id and m.role in ('owner', 'coach') and m.display_name is not null
      order by (m.role = 'owner') desc limit 1),
    (select count(*)::integer from public.player p where p.team_id = t.id and p.active),
    (select count(*)::integer from public.game g where g.season_id = s.id and g.status = 'final' and g.score_us > g.score_them),
    (select count(*)::integer from public.game g where g.season_id = s.id and g.status = 'final' and g.score_us < g.score_them),
    (select count(*)::integer from public.game g where g.season_id = s.id and g.status = 'final' and g.score_us = g.score_them),
    n.game_date, n.start_time, n.opponent,
    (select max(l.created_at) from public.lineup l join public.game g on g.id = l.game_id where g.season_id = s.id)
  from teams t
  left join seasons s on s.team_id = t.id
  left join lateral (
    select g.game_date, g.start_time, g.opponent from public.game g
    where g.season_id = s.id and g.status = 'scheduled' and g.game_date >= current_date
    order by g.game_date, g.start_time nulls last limit 1
  ) n on true
  order by t.age_group, t.name;
end;
$$;

revoke execute on function public.club_overview(uuid) from public, anon;
grant execute on function public.club_overview(uuid) to authenticated;

-- ── Setup helpers, run in the SQL Editor (not callable from the app) ──

/* A club and its director (who must have signed in to RallyCap once). Returns the club id. */
create function public.create_club(p_name text, p_director_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  org uuid;
  director uuid;
begin
  select id into director from auth.users where lower(email) = lower(trim(p_director_email));
  if director is null then
    raise exception 'No RallyCap account for %. Have them sign in once first.', p_director_email;
  end if;
  insert into public.organization (name, created_by) values (trim(p_name), director)
    returning id into org;
  insert into public.club_admin (organization_id, user_id, role) values (org, director, 'director');
  return org;
end;
$$;

/* Another admin for a club (must have signed in once). */
create function public.add_club_admin(p_org uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  who uuid;
begin
  select id into who from auth.users where lower(email) = lower(trim(p_email));
  if who is null then
    raise exception 'No RallyCap account for %. Have them sign in once first.', p_email;
  end if;
  insert into public.club_admin (organization_id, user_id) values (p_org, who)
  on conflict do nothing;
end;
$$;

/* N new codes for a club's season ("2026-27" runs to June 30, 2027). Returns the codes. */
create function public.create_club_codes(p_org uuid, p_count integer, p_season text)
returns setof text
language plpgsql
security definer
set search_path = ''
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  new_code text;
  i integer;
  k integer;
begin
  if p_count < 1 or p_count > 200 then
    raise exception 'Make between 1 and 200 codes at a time.';
  end if;
  for i in 1..p_count loop
    loop
      new_code := '';
      for k in 1..8 loop
        new_code := new_code || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
      end loop;
      exit when not exists (select 1 from public.club_code x where x.code = new_code);
    end loop;
    insert into public.club_code (organization_id, code, season_label, expires_on)
    values (p_org, new_code, p_season, make_date(2000 + right(p_season, 2)::integer, 6, 30));
    return next new_code;
  end loop;
end;
$$;

revoke execute on function public.create_club(text, text) from public, anon, authenticated;
revoke execute on function public.add_club_admin(uuid, text) from public, anon, authenticated;
revoke execute on function public.create_club_codes(uuid, integer, text) from public, anon, authenticated;
