-- Clubs, phase 2: the club's look (logo, colors) and uniform combos, a shared library
-- (practice plans, homework play sets), and club GroupMe posts. Teams see club things while
-- they hold an active club code; only club admins change them.

/* The signed-in user is on a team that holds an active code from this club. */
create function public.in_club(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.club_code c
    join public.member m on m.team_id = c.team_id
    where c.organization_id = p_org and c.expires_on >= current_date
      and m.user_id = (select auth.uid())
  );
$$;
revoke execute on function public.in_club(uuid) from public, anon;
grant execute on function public.in_club(uuid) to authenticated;

-- ── Look ──
alter table public.organization
  add column colors text[] not null default '{}'
    check (cardinality(colors) <= 2 and array_to_string(colors, ',') ~ '^(#[0-9a-fA-F]{6}(,#[0-9a-fA-F]{6})?)?$'),
  add column logo_path text check (logo_path is null or length(logo_path) <= 200);

create policy "club admins update their club" on public.organization
  for update to authenticated
  using (public.is_club_admin(id)) with check (public.is_club_admin(id));
create policy "club teams can read their club" on public.organization
  for select to authenticated using (public.in_club(id));

-- Club logos live in the public team-logos bucket at club/<club id>/<file>.
create function public.logo_club_id(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when (storage.foldername(p_name))[1] = 'club'
      and (storage.foldername(p_name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then ((storage.foldername(p_name))[2])::uuid
  end;
$$;

create policy "club admins add club logos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'team-logos' and public.is_club_admin(public.logo_club_id(name)));
create policy "club admins replace club logos" on storage.objects
  for update to authenticated
  using (bucket_id = 'team-logos' and public.is_club_admin(public.logo_club_id(name)))
  with check (bucket_id = 'team-logos' and public.is_club_admin(public.logo_club_id(name)));
create policy "club admins remove club logos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'team-logos' and public.is_club_admin(public.logo_club_id(name)));

-- ── Uniforms: a combo belongs to a team or to a club ──
alter table public.uniform_combo
  alter column team_id drop not null,
  add column organization_id uuid references public.organization (id) on delete cascade,
  add constraint uniform_combo_owner check ((team_id is null) <> (organization_id is null));

create index on public.uniform_combo (organization_id);

create policy "club teams see the club's uniforms" on public.uniform_combo
  for select to authenticated
  using (
    organization_id is not null
    and (public.is_club_admin(organization_id) or public.in_club(organization_id))
  );
create policy "club admins add club uniforms" on public.uniform_combo
  for insert to authenticated
  with check (organization_id is not null and public.is_club_admin(organization_id));
create policy "club admins change club uniforms" on public.uniform_combo
  for update to authenticated
  using (organization_id is not null and public.is_club_admin(organization_id))
  with check (organization_id is not null and public.is_club_admin(organization_id));
create policy "club admins remove club uniforms" on public.uniform_combo
  for delete to authenticated
  using (organization_id is not null and public.is_club_admin(organization_id));

-- A game wears its own team's combo, or its club's while the team holds an active code.
create or replace function public.check_game_uniform()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.uniform_combo_id is not null and not exists (
    select 1 from public.uniform_combo u
    join public.season s on s.id = new.season_id
    where u.id = new.uniform_combo_id
      and (
        u.team_id = s.team_id
        or exists (
          select 1 from public.club_code c
          where c.team_id = s.team_id and c.organization_id = u.organization_id
            and c.expires_on >= current_date
        )
      )
  ) then
    raise exception 'that uniform belongs to another team' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- ── Library ──
create table public.club_practice_plan (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 80),
  focus text check (focus is null or length(focus) <= 40),
  -- [{title, minutes, notes?}]
  items jsonb not null default '[]' check (
    jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 40
    and octet_length(items::text) < 20000
  ),
  created_at timestamptz not null default now()
);

create table public.club_play_set (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 80),
  play_ids text[] not null check (cardinality(play_ids) between 1 and 60),
  created_at timestamptz not null default now()
);

create index on public.club_practice_plan (organization_id);
create index on public.club_play_set (organization_id);

alter table public.club_practice_plan enable row level security;
alter table public.club_play_set enable row level security;

create policy "club admins and club teams see club plans" on public.club_practice_plan
  for select to authenticated
  using (public.is_club_admin(organization_id) or public.in_club(organization_id));
create policy "club admins add club plans" on public.club_practice_plan
  for insert to authenticated with check (public.is_club_admin(organization_id));
create policy "club admins change club plans" on public.club_practice_plan
  for update to authenticated
  using (public.is_club_admin(organization_id)) with check (public.is_club_admin(organization_id));
create policy "club admins remove club plans" on public.club_practice_plan
  for delete to authenticated using (public.is_club_admin(organization_id));

create policy "club admins and club teams see club play sets" on public.club_play_set
  for select to authenticated
  using (public.is_club_admin(organization_id) or public.in_club(organization_id));
create policy "club admins add club play sets" on public.club_play_set
  for insert to authenticated with check (public.is_club_admin(organization_id));
create policy "club admins change club play sets" on public.club_play_set
  for update to authenticated
  using (public.is_club_admin(organization_id)) with check (public.is_club_admin(organization_id));
create policy "club admins remove club play sets" on public.club_play_set
  for delete to authenticated using (public.is_club_admin(organization_id));

-- ── GroupMe ──
-- The club's coaches group bot. Club admins manage it; nobody else sees it.
create table public.club_groupme (
  organization_id uuid primary key references public.organization (id) on delete cascade,
  bot_id text not null check (bot_id ~ '^[A-Za-z0-9]{10,64}$'),
  group_name text check (group_name is null or length(trim(group_name)) between 1 and 80),
  connected_at timestamptz not null default now()
);

alter table public.club_groupme enable row level security;

create policy "club admins see the coaches group bot" on public.club_groupme
  for select to authenticated using (public.is_club_admin(organization_id));
create policy "club admins connect the coaches group" on public.club_groupme
  for insert to authenticated with check (public.is_club_admin(organization_id));
create policy "club admins change the coaches group" on public.club_groupme
  for update to authenticated
  using (public.is_club_admin(organization_id)) with check (public.is_club_admin(organization_id));
create policy "club admins disconnect the coaches group" on public.club_groupme
  for delete to authenticated using (public.is_club_admin(organization_id));

create table public.club_post_log (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organization (id) on delete cascade,
  posted_by uuid default auth.uid() references auth.users (id) on delete set null,
  groups integer not null,
  posted_at timestamptz not null default now()
);
create index on public.club_post_log (organization_id, posted_at);
alter table public.club_post_log enable row level security;
create policy "club admins see their posts" on public.club_post_log
  for select to authenticated using (public.is_club_admin(organization_id));

/* Which teams' groups a club can post to: active code and a connected GroupMe bot. */
create function public.club_groupme_targets(p_org uuid)
returns table (team_id uuid, team_name text, age_group text, connected boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_club_admin(p_org) then
    raise exception 'Only club admins post for the club.' using errcode = 'insufficient_privilege';
  end if;
  return query
  select distinct on (t.id) t.id, t.name, t.age_group,
    exists (select 1 from public.team_groupme b where b.team_id = t.id)
  from public.club_code c join public.team t on t.id = c.team_id
  where c.organization_id = p_org and c.expires_on >= current_date
  order by t.id;
end;
$$;

revoke execute on function public.club_groupme_targets(uuid) from public, anon;
grant execute on function public.club_groupme_targets(uuid) to authenticated;

/*
 * A club admin posts to the coaches group and/or teams' groups. Sent by the database
 * (bots never leave it), only to teams holding the club's active code. Returns how many
 * groups it went to. At most 20 posts an hour per club.
 */
create function public.club_groupme_post(
  p_org uuid,
  p_coaches boolean,
  p_team_ids uuid[],
  p_text text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  msg text := trim(coalesce(p_text, ''));
  bot text;
  sent integer := 0;
begin
  if not public.is_club_admin(p_org) then
    raise exception 'Only club admins post for the club.' using errcode = 'insufficient_privilege';
  end if;
  if msg = '' then raise exception 'Write a message first.' using errcode = 'P0001'; end if;
  if length(msg) > 1000 then
    raise exception 'Keep it under 1,000 characters (GroupMe''s limit).' using errcode = 'P0001';
  end if;
  if (select count(*) from public.club_post_log l
      where l.organization_id = p_org and l.posted_at > now() - interval '1 hour') >= 20 then
    raise exception 'That''s 20 posts this hour. Try again later.' using errcode = 'P0001';
  end if;

  if p_coaches then
    select g.bot_id into bot from public.club_groupme g where g.organization_id = p_org;
    if bot is null then
      raise exception 'Connect the coaches group first.' using errcode = 'P0001';
    end if;
    perform net.http_post(
      url := 'https://api.groupme.com/v3/bots/post',
      body := jsonb_build_object('bot_id', bot, 'text', msg),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
    sent := sent + 1;
  end if;

  for bot in
    select distinct b.bot_id
    from public.club_code c
    join public.team_groupme b on b.team_id = c.team_id
    join public.team t on t.id = c.team_id
    where c.organization_id = p_org and c.expires_on >= current_date
      and c.team_id = any (coalesce(p_team_ids, '{}')) and t.optioned_at is null
  loop
    perform net.http_post(
      url := 'https://api.groupme.com/v3/bots/post',
      body := jsonb_build_object('bot_id', bot, 'text', msg),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
    sent := sent + 1;
  end loop;

  if sent = 0 then
    raise exception 'None of those groups are connected to GroupMe.' using errcode = 'P0001';
  end if;
  insert into public.club_post_log (organization_id, groups) values (p_org, sent);
  return sent;
end;
$$;

revoke execute on function public.club_groupme_post(uuid, boolean, uuid[], text) from public, anon;
grant execute on function public.club_groupme_post(uuid, boolean, uuid[], text) to authenticated;
