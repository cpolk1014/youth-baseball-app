-- Photos on club posts (a flyer, a schedule): up to 4, shrunk on the phone like team photos,
-- uploaded once to chatter-photos/club/<club id>/<file>.jpg. Every team copy points at the same
-- files. Club admins add and remove them; a person on a team opens them only while their team
-- has a club post showing that photo.

alter table public.club_chatter_post
  add column photos jsonb not null default '[]'
    check (jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) <= 4);
alter table public.club_chatter_post drop constraint club_chatter_post_body_check;
alter table public.club_chatter_post add constraint club_chatter_post_has_content check (
  char_length(body) <= 2000
  and (removed_at is not null or char_length(btrim(body)) > 0 or jsonb_array_length(photos) > 0)
);

-- The club a club photo belongs to (chatter-photos/club/<club id>/…), or null.
create function public.chatter_photo_club(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when (storage.foldername(p_name))[1] = 'club'
      and (storage.foldername(p_name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then ((storage.foldername(p_name))[2])::uuid
  end
$$;
grant execute on function public.chatter_photo_club(text) to authenticated;

-- Whether the signed-in person may open a club photo: a club admin, or on a team with a
-- (not removed) club post showing it.
create function public.can_see_club_photo(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_club_admin(public.chatter_photo_club(p_name))
    or exists (
      select 1 from public.chatter_post p
      join public.member m on m.team_id = p.team_id and m.user_id = (select auth.uid())
      where p.club_post_id is not null and p.removed_at is null
        and exists (
          select 1 from jsonb_array_elements(p.photos) ph
          where ph ->> 'path' = p_name or ph ->> 'thumb' = p_name
        )
    );
$$;
revoke execute on function public.can_see_club_photo(text) from public, anon;
grant execute on function public.can_see_club_photo(text) to authenticated;

create policy "club posts' photos for the club and its teams" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chatter-photos' and public.chatter_photo_club(name) is not null
    and public.can_see_club_photo(name)
  );
create policy "club admins add club photos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chatter-photos' and public.is_club_admin(public.chatter_photo_club(name))
  );
create policy "club admins remove club photos" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'chatter-photos' and public.is_club_admin(public.chatter_photo_club(name))
  );

-- Sending takes photos now (the old version without them goes away).
drop function public.send_club_chatter_post(uuid, uuid[], text, text[], boolean, boolean, timestamptz);
create function public.send_club_chatter_post(
  p_org uuid,
  p_team_ids uuid[],
  p_body text,
  p_options text[] default null,
  p_multi boolean default false,
  p_anonymous boolean default false,
  p_closes_at timestamptz default null,
  p_photos jsonb default '[]'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_body text := btrim(coalesce(p_body, ''));
  v_photos jsonb := coalesce(p_photos, '[]'::jsonb);
  v_prefix text := 'club/' || p_org::text || '/';
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
  if jsonb_typeof(v_photos) <> 'array' or jsonb_array_length(v_photos) > 4 then
    raise exception 'Up to 4 photos on a post.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_photos) ph
    where jsonb_typeof(ph) <> 'object'
      or not starts_with(coalesce(ph ->> 'path', ''), v_prefix)
      or not starts_with(coalesce(ph ->> 'thumb', ''), v_prefix)
      or (ph ->> 'path') like '%..%' or (ph ->> 'thumb') like '%..%'
      or char_length(ph ->> 'path') > 200 or char_length(ph ->> 'thumb') > 200
  ) then
    raise exception 'Those photos aren''t the club''s.' using errcode = '42501';
  end if;
  if v_body = '' and jsonb_array_length(v_photos) = 0 then
    raise exception 'Write a message or add a photo.' using errcode = '22023';
  end if;
  if char_length(v_body) > 2000 then
    raise exception 'Keep it to 2,000 characters.' using errcode = '22023';
  end if;
  if p_options is not null then
    v_kind := 'poll';
    if v_body = '' then
      raise exception 'Ask a question first.' using errcode = '22023';
    end if;
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
    anonymous, closes_at, photos)
  values (p_org, (select auth.uid()), v_body, v_kind, v_options, coalesce(p_multi, false),
    coalesce(p_anonymous, false), p_closes_at, v_photos)
  returning id into v_id;

  foreach v_team in array v_teams loop
    insert into public.chatter_post (team_id, author_id, body, kind, club_post_id, club, photos)
    values (v_team, null, v_body, v_kind, v_id, v_club, v_photos)
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
revoke execute on function public.send_club_chatter_post(uuid, uuid[], text, text[], boolean, boolean, timestamptz, jsonb)
  from public, anon;

-- The club's posts list includes their photos.
drop function public.club_chatter_posts(uuid);
create function public.club_chatter_posts(p_org uuid)
returns table (
  id uuid, body text, kind text, options text[], multi boolean, anonymous boolean,
  closes_at timestamptz, closed_at timestamptz, created_at timestamptz, removed_at timestamptz,
  teams int, replies int, reactions jsonb, votes int[], voters int, photos jsonb
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
    ) end,
    cp.photos
  from public.club_chatter_post cp
  where cp.organization_id = p_org
  order by cp.created_at desc
  limit 50;
end;
$$;
revoke execute on function public.club_chatter_posts(uuid) from public, anon;

-- Taking a club post down takes its photos out of every team's feed (the app deletes the files).
create or replace function public.remove_club_chatter_post(p_id uuid)
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
  update public.club_chatter_post set removed_at = coalesce(removed_at, now()), photos = '[]'
  where id = p_id;
  update public.chatter_post
  set body = '', photos = '[]', removed_at = now(), removed_by = (select auth.uid()), pinned_at = null
  where club_post_id = p_id and removed_at is null;
end;
$$;
