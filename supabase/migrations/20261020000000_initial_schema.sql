-- Initial schema: teams, seasons, roster, games, lineups.
-- Every table has Row Level Security: users only see teams they are a member of.
-- Participation is derived from lineup_slot rows (see player_participation), never stored.

-- ─── Types ────────────────────────────────────────────────────────────────────

create type public.member_role as enum ('coach', 'manager', 'treasurer', 'parent');
create type public.game_status as enum ('scheduled', 'final');
create type public.lineup_position as enum (
  'P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'LCF', 'RCF', 'BENCH'
);

-- ─── Tables ───────────────────────────────────────────────────────────────────

create table public.organization (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.team (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organization (id) on delete set null,
  name text not null check (length(trim(name)) > 0),
  age_group text not null check (age_group ~ '^[0-9]{1,2}U$'),
  colors text[] not null default '{}',
  groupme_group_id text,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.season (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.team (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  start_date date,
  end_date date,
  -- RuleConfig overrides (camelCase, as in src/lib/rules/types.ts). Missing keys use defaults.
  fair_play_rules jsonb not null default '{}' check (jsonb_typeof(fair_play_rules) = 'object'),
  created_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create table public.member (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.team (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null,
  created_at timestamptz not null default now(),
  unique (team_id, user_id, role)
);

-- Players are minors: keep the minimum. No emails, phones, birthdates or addresses.
create table public.player (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.team (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  jersey_number smallint check (jersey_number between 0 and 99),
  preferred_positions public.lineup_position[] not null default '{}'
    check (not ('BENCH' = any (preferred_positions))),
  can_pitch boolean not null default false,
  can_catch boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.game (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.season (id) on delete cascade,
  game_date date not null,
  start_time time,
  opponent text not null check (length(trim(opponent)) > 0),
  location text,
  innings smallint not null default 6 check (innings between 1 and 9),
  status public.game_status not null default 'scheduled',
  created_at timestamptz not null default now()
);

-- Each save of a game's lineup is a new version; the highest version is current.
create table public.lineup (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.game (id) on delete cascade,
  batting_order uuid[] not null default '{}',
  version integer not null default 1 check (version >= 1),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (game_id, version)
);

-- Fair-play rules (positions filled once, etc.) are checked by the rules engine, so a
-- coach can save a lineup that still has warnings. The database only guarantees one
-- slot per player per inning and that players belong to the game's team.
create table public.lineup_slot (
  lineup_id uuid not null references public.lineup (id) on delete cascade,
  inning smallint not null check (inning between 1 and 9),
  player_id uuid not null references public.player (id) on delete cascade,
  position public.lineup_position not null,
  primary key (lineup_id, inning, player_id)
);

create index on public.team (organization_id);
create index on public.season (team_id);
create index on public.member (user_id);
create index on public.player (team_id);
create index on public.game (season_id, game_date);
create index on public.lineup_slot (player_id);

-- ─── Integrity triggers ───────────────────────────────────────────────────────

-- Slots and batting order may only reference players on the game's team, and
-- innings may not exceed the game's length.
create function public.check_lineup_slot()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  game_team uuid;
  game_innings smallint;
begin
  select s.team_id, g.innings into game_team, game_innings
  from public.lineup l
  join public.game g on g.id = l.game_id
  join public.season s on s.id = g.season_id
  where l.id = new.lineup_id;

  if new.inning > game_innings then
    raise exception 'inning % is beyond this %-inning game', new.inning, game_innings;
  end if;
  if not exists (select 1 from public.player p where p.id = new.player_id and p.team_id = game_team) then
    raise exception 'player % is not on this game''s team', new.player_id;
  end if;
  return new;
end;
$$;

create trigger lineup_slot_check
before insert or update on public.lineup_slot
for each row execute function public.check_lineup_slot();

create function public.check_lineup_batting_order()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from unnest(new.batting_order) as b(player_id)
    where not exists (
      select 1
      from public.player p
      join public.season s on s.team_id = p.team_id
      join public.game g on g.season_id = s.id
      where p.id = b.player_id and g.id = new.game_id
    )
  ) then
    raise exception 'batting order includes a player who is not on this game''s team';
  end if;
  return new;
end;
$$;

create trigger lineup_batting_order_check
before insert or update of batting_order, game_id on public.lineup
for each row execute function public.check_lineup_batting_order();

-- Whoever creates a team becomes its coach, so they can see it under RLS.
create function public.add_team_creator_as_coach()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    insert into public.member (team_id, user_id, role) values (new.id, auth.uid(), 'coach');
  end if;
  return new;
end;
$$;

create trigger team_creator_is_coach
after insert on public.team
for each row execute function public.add_team_creator_as_coach();

-- ─── RLS helpers ──────────────────────────────────────────────────────────────
-- security definer so policies can check membership without recursing through the
-- member table's own RLS. They only ever answer for the calling user.

create function public.is_team_member(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.member m
    where m.team_id = p_team_id and m.user_id = (select auth.uid())
  );
$$;

create function public.has_team_role(p_team_id uuid, p_roles public.member_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.member m
    where m.team_id = p_team_id and m.user_id = (select auth.uid()) and m.role = any (p_roles)
  );
$$;

create function public.season_team_id(p_season_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select team_id from public.season where id = p_season_id;
$$;

create function public.game_team_id(p_game_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.team_id from public.game g join public.season s on s.id = g.season_id
  where g.id = p_game_id;
$$;

create function public.lineup_team_id(p_lineup_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.team_id
  from public.lineup l
  join public.game g on g.id = l.game_id
  join public.season s on s.id = g.season_id
  where l.id = p_lineup_id;
$$;

revoke execute on function
  public.is_team_member(uuid),
  public.has_team_role(uuid, public.member_role[]),
  public.season_team_id(uuid),
  public.game_team_id(uuid),
  public.lineup_team_id(uuid)
from public, anon;

-- ─── Row Level Security ───────────────────────────────────────────────────────
-- Read: any member of the team. Write: coaches and managers; lineups: coaches;
-- membership: coaches. Nothing is visible to signed-out (anon) users.

alter table public.organization enable row level security;
alter table public.team enable row level security;
alter table public.season enable row level security;
alter table public.member enable row level security;
alter table public.player enable row level security;
alter table public.game enable row level security;
alter table public.lineup enable row level security;
alter table public.lineup_slot enable row level security;

-- organization
create policy "members of a team in the org can read it" on public.organization
  for select to authenticated
  using (
    created_by = (select auth.uid())
    or exists (
      select 1 from public.team t
      where t.organization_id = organization.id and public.is_team_member(t.id)
    )
  );
create policy "signed-in users can create orgs" on public.organization
  for insert to authenticated with check (created_by = (select auth.uid()));
create policy "creators can update their org" on public.organization
  for update to authenticated
  using (created_by = (select auth.uid())) with check (created_by = (select auth.uid()));

-- team
-- created_by lets `insert ... returning` see the new row before the coach trigger runs.
create policy "members can read their teams" on public.team
  for select to authenticated
  using (public.is_team_member(id) or created_by = (select auth.uid()));
create policy "signed-in users can create teams" on public.team
  for insert to authenticated with check (created_by = (select auth.uid()));
create policy "coaches and managers can update teams" on public.team
  for update to authenticated
  using (public.has_team_role(id, '{coach,manager}'))
  with check (public.has_team_role(id, '{coach,manager}'));
create policy "coaches can delete teams" on public.team
  for delete to authenticated using (public.has_team_role(id, '{coach}'));

-- season
create policy "members can read seasons" on public.season
  for select to authenticated using (public.is_team_member(team_id));
create policy "coaches and managers can insert seasons" on public.season
  for insert to authenticated with check (public.has_team_role(team_id, '{coach,manager}'));
create policy "coaches and managers can update seasons" on public.season
  for update to authenticated
  using (public.has_team_role(team_id, '{coach,manager}'))
  with check (public.has_team_role(team_id, '{coach,manager}'));
create policy "coaches and managers can delete seasons" on public.season
  for delete to authenticated using (public.has_team_role(team_id, '{coach,manager}'));

-- member
create policy "members can see who is on their team" on public.member
  for select to authenticated using (public.is_team_member(team_id));
create policy "coaches can add members" on public.member
  for insert to authenticated with check (public.has_team_role(team_id, '{coach}'));
create policy "coaches can change roles" on public.member
  for update to authenticated
  using (public.has_team_role(team_id, '{coach}'))
  with check (public.has_team_role(team_id, '{coach}'));
create policy "coaches can remove members, anyone can leave" on public.member
  for delete to authenticated
  using (public.has_team_role(team_id, '{coach}') or user_id = (select auth.uid()));

-- player
create policy "members can read the roster" on public.player
  for select to authenticated using (public.is_team_member(team_id));
create policy "coaches and managers can add players" on public.player
  for insert to authenticated with check (public.has_team_role(team_id, '{coach,manager}'));
create policy "coaches and managers can edit players" on public.player
  for update to authenticated
  using (public.has_team_role(team_id, '{coach,manager}'))
  with check (public.has_team_role(team_id, '{coach,manager}'));
create policy "coaches and managers can delete players" on public.player
  for delete to authenticated using (public.has_team_role(team_id, '{coach,manager}'));

-- game
create policy "members can read games" on public.game
  for select to authenticated using (public.is_team_member(public.season_team_id(season_id)));
create policy "coaches and managers can add games" on public.game
  for insert to authenticated
  with check (public.has_team_role(public.season_team_id(season_id), '{coach,manager}'));
create policy "coaches and managers can edit games" on public.game
  for update to authenticated
  using (public.has_team_role(public.season_team_id(season_id), '{coach,manager}'))
  with check (public.has_team_role(public.season_team_id(season_id), '{coach,manager}'));
create policy "coaches and managers can delete games" on public.game
  for delete to authenticated
  using (public.has_team_role(public.season_team_id(season_id), '{coach,manager}'));

-- lineup
create policy "members can read lineups" on public.lineup
  for select to authenticated using (public.is_team_member(public.game_team_id(game_id)));
create policy "coaches can save lineups" on public.lineup
  for insert to authenticated
  with check (public.has_team_role(public.game_team_id(game_id), '{coach}'));
create policy "coaches can edit lineups" on public.lineup
  for update to authenticated
  using (public.has_team_role(public.game_team_id(game_id), '{coach}'))
  with check (public.has_team_role(public.game_team_id(game_id), '{coach}'));
create policy "coaches can delete lineups" on public.lineup
  for delete to authenticated
  using (public.has_team_role(public.game_team_id(game_id), '{coach}'));

-- lineup_slot
create policy "members can read lineup slots" on public.lineup_slot
  for select to authenticated using (public.is_team_member(public.lineup_team_id(lineup_id)));
create policy "coaches can add lineup slots" on public.lineup_slot
  for insert to authenticated
  with check (public.has_team_role(public.lineup_team_id(lineup_id), '{coach}'));
create policy "coaches can edit lineup slots" on public.lineup_slot
  for update to authenticated
  using (public.has_team_role(public.lineup_team_id(lineup_id), '{coach}'))
  with check (public.has_team_role(public.lineup_team_id(lineup_id), '{coach}'));
create policy "coaches can delete lineup slots" on public.lineup_slot
  for delete to authenticated
  using (public.has_team_role(public.lineup_team_id(lineup_id), '{coach}'));

-- ─── Derived participation ────────────────────────────────────────────────────
-- Innings per player per position per season, from the current (highest-version)
-- lineup of each final game. security_invoker so the caller's RLS applies.

create view public.current_lineup with (security_invoker = true) as
select distinct on (l.game_id) l.*
from public.lineup l
order by l.game_id, l.version desc;

create view public.player_participation with (security_invoker = true) as
select
  g.season_id,
  ls.player_id,
  ls.position,
  count(*)::integer as innings
from public.current_lineup cl
join public.game g on g.id = cl.game_id and g.status = 'final'
join public.lineup_slot ls on ls.lineup_id = cl.id and ls.inning <= g.innings
group by g.season_id, ls.player_id, ls.position;
