-- Club posts to teams: a club admin writes one post (or poll) and every team they pick gets its
-- own copy in its Chatter. Replies, reactions and votes stay inside each team; the club never
-- reads a team's conversation, only totals (reactions, poll votes, how many replies) with no
-- names. Clubs pay, so team coaches can't remove, edit or close a club post; only the club
-- removes it (from every team at once) or closes its poll.

create table public.club_chatter_post (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  kind text not null default 'post' check (kind in ('post', 'poll')),
  options text[],
  multi boolean not null default false,
  anonymous boolean not null default false,
  closes_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  removed_at timestamptz
);
create index club_chatter_post_org_idx on public.club_chatter_post (organization_id, created_at desc);
alter table public.club_chatter_post enable row level security;
create policy club_chatter_post_read on public.club_chatter_post for select to authenticated
  using (public.is_club_admin(organization_id));

-- A team's copy: which club post it is, and the club's name, logo and color when it was sent
-- (so team members see who it's from without reading the club's own rows).
alter table public.chatter_post
  add column club_post_id uuid references public.club_chatter_post (id) on delete set null,
  add column club jsonb;
create index chatter_post_club_post_idx on public.chatter_post (club_post_id)
  where club_post_id is not null;

-- People can't make their own post look like a club's.
create or replace function public.chatter_post_no_reactions()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.reactions := '[]'::jsonb;
  if current_user in ('authenticated', 'anon') then
    new.club_post_id := null;
    new.club := null;
  end if;
  return new;
end;
$$;

-- Send a club post or poll to teams holding the club's active code. Returns the club post.
create function public.send_club_chatter_post(
  p_org uuid,
  p_team_ids uuid[],
  p_body text,
  p_options text[] default null,
  p_multi boolean default false,
  p_anonymous boolean default false,
  p_closes_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_body text := btrim(coalesce(p_body, ''));
  v_options text[];
  v_kind text := 'post';
  v_org public.organization;
  v_club jsonb;
  v_id uuid;
  v_teams uuid[];
  v_team uuid;
  v_copy uuid;
begin
  if not public.is_club_admin(p_org) then
    raise exception 'Only club admins post for the club.' using errcode = '42501';
  end if;
  if v_body = '' then
    raise exception 'Write a message first.' using errcode = '22023';
  end if;
  if char_length(v_body) > 2000 then
    raise exception 'Keep it to 2,000 characters.' using errcode = '22023';
  end if;
  if p_options is not null then
    v_kind := 'poll';
    select coalesce(array_agg(btrim(o) order by n), '{}') into v_options
    from unnest(p_options) with ordinality as t(o, n)
    where btrim(coalesce(o, '')) <> '';
    if coalesce(array_length(v_options, 1), 0) < 2 or array_length(v_options, 1) > 10 then
      raise exception 'A poll needs 2 to 10 choices.' using errcode = '22023';
    end if;
    if exists (select 1 from unnest(v_options) o where char_length(o) > 120) then
      raise exception 'Keep each choice to 120 characters.' using errcode = '22023';
    end if;
    if (select count(distinct lower(o)) from unnest(v_options) o) < array_length(v_options, 1) then
      raise exception 'Two of the choices are the same.' using errcode = '22023';
    end if;
    if p_closes_at is not null and p_closes_at <= now() then
      raise exception 'Pick a closing time that hasn''t passed.' using errcode = '22023';
    end if;
  end if;

  select coalesce(array_agg(distinct c.team_id), '{}') into v_teams
  from public.club_code c join public.team t on t.id = c.team_id
  where c.organization_id = p_org and c.expires_on >= current_date
    and c.team_id = any (coalesce(p_team_ids, '{}')) and t.optioned_at is null;
  if cardinality(v_teams) = 0 then
    raise exception 'Pick at least one of the club''s teams.' using errcode = '22023';
  end if;
  if (select count(*) from public.club_chatter_post
      where organization_id = p_org and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'That''s 20 club posts this hour. Try again a little later.' using errcode = 'P0429';
  end if;

  select * into v_org from public.organization where id = p_org;
  v_club := jsonb_build_object('name', v_org.name, 'logo', v_org.logo_path,
    'color', v_org.colors[1]);

  insert into public.club_chatter_post (organization_id, author_id, body, kind, options, multi,
    anonymous, closes_at)
  values (p_org, (select auth.uid()), v_body, v_kind, v_options, coalesce(p_multi, false),
    coalesce(p_anonymous, false), p_closes_at)
  returning id into v_id;

  foreach v_team in array v_teams loop
    insert into public.chatter_post (team_id, author_id, body, kind, club_post_id, club)
    values (v_team, null, v_body, v_kind, v_id, v_club)
    returning id into v_copy;
    if v_kind = 'poll' then
      insert into public.chatter_poll (post_id, team_id, options, multi, anonymous, closes_at)
      values (v_copy, v_team, v_options, coalesce(p_multi, false), coalesce(p_anonymous, false),
        p_closes_at);
    end if;
  end loop;
  return v_id;
end;
$$;
revoke execute on function public.send_club_chatter_post(uuid, uuid[], text, text[], boolean, boolean, timestamptz)
  from public, anon;

-- The club's posts with totals across its teams: how many teams, replies, reactions and poll
-- votes. Never names, and never what anyone wrote.
create function public.club_chatter_posts(p_org uuid)
returns table (
  id uuid, body text, kind text, options text[], multi boolean, anonymous boolean,
  closes_at timestamptz, closed_at timestamptz, created_at timestamptz, removed_at timestamptz,
  teams int, replies int, reactions jsonb, votes int[], voters int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_club_admin(p_org) then
    raise exception 'Only club admins see the club''s posts.' using errcode = '42501';
  end if;
  return query
  select cp.id, cp.body, cp.kind, cp.options, cp.multi, cp.anonymous, cp.closes_at, cp.closed_at,
    cp.created_at, cp.removed_at,
    (select count(*)::int from public.chatter_post p where p.club_post_id = cp.id),
    (select count(*)::int from public.chatter_post q
      join public.chatter_post p on p.id = q.quote_post_id
      where p.club_post_id = cp.id and q.removed_at is null),
    coalesce((
      select jsonb_agg(jsonb_build_object('e', x.emoji, 'n', x.n) order by x.n desc, x.first_at)
      from (
        select r.emoji, count(*)::int as n, min(r.created_at) as first_at
        from public.chatter_reaction r join public.chatter_post p on p.id = r.post_id
        where p.club_post_id = cp.id
        group by r.emoji
      ) x
    ), '[]'::jsonb),
    case when cp.kind = 'poll' then (
      select array_agg((
        select count(*)::int from public.chatter_poll_vote v
        join public.chatter_post p on p.id = v.post_id
        where p.club_post_id = cp.id and v.option = o.n - 1
      ) order by o.n)
      from unnest(cp.options) with ordinality as o(label, n)
    ) end,
    case when cp.kind = 'poll' then (
      select count(distinct (v.post_id, v.user_id))::int from public.chatter_poll_vote v
      join public.chatter_post p on p.id = v.post_id
      where p.club_post_id = cp.id
    ) end
  from public.club_chatter_post cp
  where cp.organization_id = p_org
  order by cp.created_at desc
  limit 50;
end;
$$;
revoke execute on function public.club_chatter_posts(uuid) from public, anon;

-- The club takes its post down from every team.
create function public.remove_club_chatter_post(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.club_chatter_post where id = p_id;
  if v_org is null or not public.is_club_admin(v_org) then
    raise exception 'Only club admins remove the club''s posts.' using errcode = '42501';
  end if;
  update public.club_chatter_post set removed_at = coalesce(removed_at, now()) where id = p_id;
  update public.chatter_post
  set body = '', removed_at = now(), removed_by = (select auth.uid()), pinned_at = null
  where club_post_id = p_id and removed_at is null;
end;
$$;
revoke execute on function public.remove_club_chatter_post(uuid) from public, anon;

-- The club closes its poll in every team.
create function public.close_club_chatter_poll(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.club_chatter_post where id = p_id and kind = 'poll';
  if v_org is null or not public.is_club_admin(v_org) then
    raise exception 'Only club admins close the club''s polls.' using errcode = '42501';
  end if;
  update public.club_chatter_post set closed_at = coalesce(closed_at, now()) where id = p_id;
  update public.chatter_poll pl set closed_at = coalesce(pl.closed_at, now()), version = pl.version + 1
  from public.chatter_post p
  where p.id = pl.post_id and p.club_post_id = p_id;
end;
$$;
revoke execute on function public.close_club_chatter_poll(uuid) from public, anon;

-- Team coaches can't take a club post down (the club removes it).
create or replace function public.remove_chatter_post(p_post uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.chatter_post;
begin
  select * into v_post from public.chatter_post where id = p_post;
  if v_post.club_post_id is not null then
    raise exception 'Club posts stay up. The club can take them down.' using errcode = '42501';
  end if;
  if v_post.id is null or not (
    (v_post.author_id = (select auth.uid()) and public.is_team_member(v_post.team_id))
    or public.has_team_role(v_post.team_id, array['coach', 'manager']::public.member_role[])
  ) then
    raise exception 'Only the person who posted, or a coach or manager, can remove it.'
      using errcode = '42501';
  end if;
  if v_post.removed_at is not null then
    return;
  end if;
  insert into public.chatter_removed_post (post_id, team_id, author_id, body, removed_by)
  values (v_post.id, v_post.team_id, v_post.author_id,
    v_post.body || case when jsonb_array_length(v_post.photos) > 0
      then E'\n[' || jsonb_array_length(v_post.photos) || ' photo(s)]' else '' end,
    (select auth.uid()))
  on conflict (post_id) do nothing;
  update public.chatter_post
  set body = '', photos = '[]', removed_at = now(), removed_by = (select auth.uid()), pinned_at = null
  where id = p_post;
end;
$$;

-- …nor close a club poll.
create or replace function public.close_chatter_poll(p_post uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_poll public.chatter_poll;
  v_author uuid;
  v_club uuid;
begin
  select * into v_poll from public.chatter_poll where post_id = p_post;
  select author_id, club_post_id into v_author, v_club from public.chatter_post where id = p_post;
  if v_club is not null then
    raise exception 'The club closes its own polls.' using errcode = '42501';
  end if;
  if v_poll.post_id is null or not (
    (v_author = (select auth.uid()) and public.is_team_member(v_poll.team_id))
    or public.has_team_role(v_poll.team_id, array['coach', 'manager']::public.member_role[])
  ) then
    raise exception 'Only the person who asked, or a coach or manager, can close the poll.'
      using errcode = '42501';
  end if;
  update public.chatter_poll set closed_at = coalesce(closed_at, now()), version = version + 1
  where post_id = p_post;
end;
$$;
