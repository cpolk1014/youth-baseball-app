-- Club coaches: one chat feed per club for its admins (director, admins) and the coaches
-- (owner and coach roles, not managers) of every team holding the club's active code.
-- Everything in it is visible to all of them across teams; parents never see it. Posts,
-- quote replies, photos (chatter-photos/clubcoaches/<club>/<user>/<file>.jpg), reactions,
-- edits for 10 minutes; authors and club admins remove; club admins pin one post.

-- Whether the signed-in person is in a club's coaches feed.
create function public.club_coach_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_club_admin(p_org) or exists (
    select 1 from public.club_code c
    join public.team t on t.id = c.team_id
    join public.member m on m.team_id = c.team_id
    where c.organization_id = p_org and c.expires_on >= current_date and t.optioned_at is null
      and m.user_id = (select auth.uid()) and m.role in ('owner', 'coach')
  );
$$;
revoke execute on function public.club_coach_member(uuid) from public, anon;
grant execute on function public.club_coach_member(uuid) to authenticated;

create table public.club_coach_post (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  body text not null default '' check (char_length(body) <= 2000),
  quote_post_id uuid references public.club_coach_post (id) on delete set null,
  photos jsonb not null default '[]'
    check (jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) <= 4),
  reactions jsonb not null default '[]' check (jsonb_typeof(reactions) = 'array'),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  pinned_at timestamptz,
  removed_at timestamptz,
  removed_by uuid references auth.users (id) on delete set null,
  constraint club_coach_post_has_content check (
    removed_at is not null or char_length(btrim(body)) > 0 or jsonb_array_length(photos) > 0
  )
);
create index club_coach_post_org_idx on public.club_coach_post (organization_id, created_at desc);
alter table public.club_coach_post enable row level security;
create policy club_coach_post_read on public.club_coach_post for select to authenticated
  using (public.club_coach_member(organization_id));
create policy club_coach_post_insert on public.club_coach_post for insert to authenticated
  with check (author_id = (select auth.uid()) and public.club_coach_member(organization_id));

create table public.club_coach_reaction (
  post_id uuid not null references public.club_coach_post (id) on delete cascade,
  organization_id uuid not null references public.organization (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, emoji)
);
alter table public.club_coach_reaction enable row level security;
create policy club_coach_reaction_read on public.club_coach_reaction for select to authenticated
  using (public.club_coach_member(organization_id));

-- New posts: the poster's own photo folder, a quote from the same club, a rate limit, and
-- nothing set that only the functions below set. Runs as the poster (security invoker), so
-- current_user tells people from the database's own writes.
create function public.club_coach_post_before_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_prefix text := 'clubcoaches/' || new.organization_id::text || '/'
    || coalesce(new.author_id::text, '') || '/';
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if (select count(*) from public.club_coach_post
      where organization_id = new.organization_id and author_id = new.author_id
        and created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'That''s a lot of posts. Take a breather and try again in a few minutes.'
      using errcode = 'P0429';
  end if;
  if exists (
    select 1 from jsonb_array_elements(new.photos) p
    where jsonb_typeof(p) <> 'object'
      or not starts_with(coalesce(p ->> 'path', ''), v_prefix)
      or not starts_with(coalesce(p ->> 'thumb', ''), v_prefix)
      or (p ->> 'path') like '%..%' or (p ->> 'thumb') like '%..%'
      or char_length(p ->> 'path') > 200 or char_length(p ->> 'thumb') > 200
  ) then
    raise exception 'Those photos aren''t yours to post.' using errcode = '42501';
  end if;
  if new.quote_post_id is not null and not exists (
    select 1 from public.club_coach_post q
    where q.id = new.quote_post_id and q.organization_id = new.organization_id
      and q.removed_at is null
  ) then
    raise exception 'That post isn''t there anymore.' using errcode = '23503';
  end if;
  new.body := btrim(new.body);
  new.reactions := '[]'::jsonb;
  new.created_at := now();
  new.edited_at := null;
  new.pinned_at := null;
  new.removed_at := null;
  new.removed_by := null;
  return new;
end;
$$;
create trigger club_coach_post_before_insert
  before insert on public.club_coach_post
  for each row execute function public.club_coach_post_before_insert();

create function public.edit_club_coach_post(p_post uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.club_coach_post;
  v_body text := btrim(coalesce(p_body, ''));
begin
  select * into v_post from public.club_coach_post where id = p_post;
  if v_post.id is null or v_post.author_id is distinct from (select auth.uid())
    or not public.club_coach_member(v_post.organization_id) then
    raise exception 'Only the person who posted can edit it.' using errcode = '42501';
  end if;
  if v_post.removed_at is not null then
    raise exception 'That post was removed.' using errcode = '42501';
  end if;
  if v_post.created_at < now() - interval '10 minutes' then
    raise exception 'Posts can be edited for 10 minutes. Remove it and post again instead.'
      using errcode = '42501';
  end if;
  if char_length(v_body) > 2000 or (v_body = '' and jsonb_array_length(v_post.photos) = 0) then
    raise exception 'A post needs 1 to 2,000 characters.' using errcode = '22023';
  end if;
  update public.club_coach_post set body = v_body, edited_at = now() where id = p_post;
end;
$$;
revoke execute on function public.edit_club_coach_post(uuid, text) from public, anon;

-- The author, or a club admin, removes a post (the app deletes its photo files).
create function public.remove_club_coach_post(p_post uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.club_coach_post;
begin
  select * into v_post from public.club_coach_post where id = p_post;
  if v_post.id is null or not (
    (v_post.author_id = (select auth.uid()) and public.club_coach_member(v_post.organization_id))
    or public.is_club_admin(v_post.organization_id)
  ) then
    raise exception 'Only the person who posted, or a club admin, can remove it.'
      using errcode = '42501';
  end if;
  update public.club_coach_post
  set body = '', photos = '[]', reactions = '[]', removed_at = coalesce(removed_at, now()),
    removed_by = coalesce(removed_by, (select auth.uid())), pinned_at = null
  where id = p_post;
  delete from public.club_coach_reaction where post_id = p_post;
end;
$$;
revoke execute on function public.remove_club_coach_post(uuid) from public, anon;

-- Club admins pin one post to the top.
create function public.pin_club_coach_post(p_post uuid, p_pin boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.club_coach_post;
begin
  select * into v_post from public.club_coach_post where id = p_post;
  if v_post.id is null or not public.is_club_admin(v_post.organization_id) then
    raise exception 'Only club admins pin posts here.' using errcode = '42501';
  end if;
  if p_pin and v_post.removed_at is not null then
    raise exception 'That post was removed.' using errcode = '42501';
  end if;
  update public.club_coach_post set pinned_at = null
  where organization_id = v_post.organization_id and pinned_at is not null and id <> p_post;
  update public.club_coach_post set pinned_at = case when p_pin then now() end where id = p_post;
end;
$$;
revoke execute on function public.pin_club_coach_post(uuid, boolean) from public, anon;

-- Add (p_on true) or take back my emoji on a post; up to 3 different ones per person.
create function public.react_club_coach_post(p_post uuid, p_emoji text, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.club_coach_post;
  v_me uuid := (select auth.uid());
  v_emoji text := btrim(coalesce(p_emoji, ''));
begin
  select * into v_post from public.club_coach_post where id = p_post for update;
  if v_post.id is null or not public.club_coach_member(v_post.organization_id) then
    raise exception 'You''re not in this club''s coaches chat.' using errcode = '42501';
  end if;
  if v_post.removed_at is not null then
    raise exception 'That post was removed.' using errcode = '42501';
  end if;
  if p_on then
    if v_emoji = '' or char_length(v_emoji) > 16 or v_emoji ~ '[[:alpha:][:space:]<>&"''`\\]'
      or v_emoji ~ '^[0-9#*]+$' then
      raise exception 'Pick an emoji.' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.club_coach_reaction
      where post_id = p_post and user_id = v_me and emoji = v_emoji
    ) then
      if (select count(*) from public.club_coach_reaction where post_id = p_post and user_id = v_me) >= 3 then
        raise exception 'Up to 3 emoji on a post. Tap one of yours to take it back.'
          using errcode = '22023';
      end if;
      if (select count(distinct emoji) from public.club_coach_reaction where post_id = p_post) >= 20 then
        raise exception 'This post has all the emoji it can hold. Tap one that''s there.'
          using errcode = '22023';
      end if;
      insert into public.club_coach_reaction (post_id, organization_id, user_id, emoji)
      values (p_post, v_post.organization_id, v_me, v_emoji);
    end if;
  else
    delete from public.club_coach_reaction
    where post_id = p_post and user_id = v_me and emoji = v_emoji;
  end if;
  update public.club_coach_post p set reactions = coalesce((
    select jsonb_agg(jsonb_build_object('e', r.emoji, 'u', r.users) order by r.first_at)
    from (
      select emoji, min(created_at) as first_at, jsonb_agg(user_id order by created_at) as users
      from public.club_coach_reaction where post_id = p_post
      group by emoji
    ) r
  ), '[]'::jsonb)
  where p.id = p_post;
end;
$$;
revoke execute on function public.react_club_coach_post(uuid, text, boolean) from public, anon;

-- Who's in the feed, to show names on posts: club admins ("Director", "Club admin") and the
-- coaches with their club teams ("Coach · 10U Canes").
create function public.club_coach_people(p_org uuid)
returns table (user_id uuid, name text, label text, admin boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.club_coach_member(p_org) then
    raise exception 'You''re not in this club''s coaches chat.' using errcode = '42501';
  end if;
  return query
  with coaches as (
    select m.user_id, max(m.display_name) as name,
      string_agg(t.name, ', ' order by t.age_group, t.name) as teams
    from public.club_code c
    join public.team t on t.id = c.team_id
    join public.member m on m.team_id = c.team_id
    where c.organization_id = p_org and c.expires_on >= current_date and t.optioned_at is null
      and m.role in ('owner', 'coach')
    group by m.user_id
  )
  select coalesce(a.user_id, co.user_id),
    coalesce(nullif(btrim(a.display_name), ''), nullif(btrim(co.name), '')),
    case
      when a.role = 'director' then 'Director'
      when a.role is not null then 'Club admin'
      else 'Coach · ' || co.teams
    end,
    a.user_id is not null
  from (select * from public.club_admin where organization_id = p_org) a
  full join coaches co on co.user_id = a.user_id;
end;
$$;
revoke execute on function public.club_coach_people(uuid) from public, anon;

-- The clubs whose coaches feed I'm in (for the menu and the page).
create function public.my_coach_clubs()
returns table (id uuid, name text, logo_path text, color text, admin boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.name, o.logo_path, o.colors[1], public.is_club_admin(o.id)
  from public.organization o
  where public.club_coach_member(o.id)
  order by o.name;
$$;
revoke execute on function public.my_coach_clubs() from public, anon;
grant execute on function public.my_coach_clubs() to authenticated;

-- Photos: in the poster's own folder; everyone in the feed opens them; the poster or a club
-- admin removes them.
create function public.club_coach_photo_club(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when (storage.foldername(p_name))[1] = 'clubcoaches'
      and (storage.foldername(p_name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then ((storage.foldername(p_name))[2])::uuid
  end
$$;
create function public.club_coach_photo_owner(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when (storage.foldername(p_name))[1] = 'clubcoaches'
      and (storage.foldername(p_name))[3] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then ((storage.foldername(p_name))[3])::uuid
  end
$$;
grant execute on function public.club_coach_photo_club(text) to authenticated;
grant execute on function public.club_coach_photo_owner(text) to authenticated;

create policy "club coaches view their feed's photos" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chatter-photos' and public.club_coach_photo_club(name) is not null
    and public.club_coach_member(public.club_coach_photo_club(name))
  );
create policy "club coaches add photos to their own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chatter-photos'
    and public.club_coach_photo_owner(name) = (select auth.uid())
    and public.club_coach_member(public.club_coach_photo_club(name))
  );
create policy "club coaches' photos removed by the poster or a club admin" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'chatter-photos' and public.club_coach_photo_club(name) is not null
    and (
      public.club_coach_photo_owner(name) = (select auth.uid())
      or public.is_club_admin(public.club_coach_photo_club(name))
    )
  );

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.club_coach_post;
  end if;
end;
$$;
