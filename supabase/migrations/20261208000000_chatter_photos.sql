-- Chatter photos: up to 4 per post, shrunk on the phone (which also drops the file's location
-- data), in a private bucket only the team can open. Files live at
-- chatter-photos/<team id>/<user id>/<file>.jpg. A team can let everyone post photos (the
-- default) or only its coaches and managers.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chatter-photos', 'chatter-photos', false, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

alter table public.team
  add column chatter_photos text not null default 'everyone'
    check (chatter_photos in ('everyone', 'staff'));

-- Each photo: {path, thumb, w, h}; the paths are in the poster's own folder on this team.
alter table public.chatter_post
  add column photos jsonb not null default '[]'
    check (jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) <= 4);

-- A post needs words or a photo (removed posts have neither).
alter table public.chatter_post drop constraint chatter_post_check;
alter table public.chatter_post add constraint chatter_post_has_content check (
  removed_at is not null or char_length(btrim(body)) > 0 or jsonb_array_length(photos) > 0
);

-- Whether someone may post photos on a team right now.
create function public.chatter_can_post_photos(p_team uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_team_member(p_team)
    and public.team_paid(p_team)
    and (
      (select t.chatter_photos from public.team t where t.id = p_team) = 'everyone'
      or public.has_team_role(p_team, array['coach', 'manager']::public.member_role[])
    );
$$;
revoke execute on function public.chatter_can_post_photos(uuid) from public, anon;
grant execute on function public.chatter_can_post_photos(uuid) to authenticated;

-- The second folder of a photo's path: whose it is (null if it isn't a uuid).
create function public.chatter_photo_owner(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when (storage.foldername(p_name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then ((storage.foldername(p_name))[2])::uuid
  end
$$;
grant execute on function public.chatter_photo_owner(text) to authenticated;

create policy "team members view chatter photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'chatter-photos' and public.is_team_member(public.receipt_team_id(name)));
create policy "members add chatter photos to their own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chatter-photos'
    and public.chatter_photo_owner(name) = (select auth.uid())
    and public.chatter_can_post_photos(public.receipt_team_id(name))
  );
create policy "owners, coaches and managers remove chatter photos" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'chatter-photos'
    and (
      (public.chatter_photo_owner(name) = (select auth.uid())
        and public.is_team_member(public.receipt_team_id(name)))
      or public.has_team_role(public.receipt_team_id(name), array['coach', 'manager']::public.member_role[])
    )
  );

-- New posts: photos follow the team's setting, a daily limit, and the poster's own folder.
create or replace function public.chatter_post_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_state public.chatter_member;
  v_recent int;
  v_photos int := jsonb_array_length(coalesce(new.photos, '[]'::jsonb));
  v_prefix text := new.team_id::text || '/' || coalesce(new.author_id::text, '') || '/';
begin
  -- The database and the service role write system posts later; these rules are for people.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  perform public.require_team_paid(new.team_id);

  select * into v_state from public.chatter_member
  where team_id = new.team_id and user_id = new.author_id;
  if v_state.agreed_at is null then
    raise exception 'Agree to Chatter''s rules before posting.' using errcode = '42501';
  end if;
  if v_state.muted_until is not null and v_state.muted_until > now() then
    raise exception 'A coach has paused your posting in Chatter for now.' using errcode = '42501';
  end if;

  select count(*) into v_recent from public.chatter_post
  where team_id = new.team_id and author_id = new.author_id
    and created_at > now() - interval '10 minutes';
  if v_recent >= 30 then
    raise exception 'That''s a lot of posts. Take a breather and try again in a few minutes.'
      using errcode = 'P0429';
  end if;

  if v_photos > 0 then
    if not public.chatter_can_post_photos(new.team_id) then
      raise exception 'On this team, only coaches and managers post photos.' using errcode = '42501';
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
    if (
      select coalesce(sum(jsonb_array_length(p.photos)), 0) from public.chatter_post p
      where p.team_id = new.team_id and p.author_id = new.author_id
        and p.created_at > now() - interval '1 day'
    ) + v_photos > 40 then
      raise exception 'That''s 40 photos today. Post more tomorrow.' using errcode = 'P0429';
    end if;
  end if;

  if new.quote_post_id is not null and not exists (
    select 1 from public.chatter_post q
    where q.id = new.quote_post_id and q.team_id = new.team_id and q.removed_at is null
  ) then
    raise exception 'That post isn''t there anymore.' using errcode = '23503';
  end if;

  new.body := btrim(new.body);
  new.created_at := now();
  new.edited_at := null;
  new.pinned_at := null;
  new.removed_at := null;
  new.removed_by := null;
  return new;
end;
$$;

-- Editing a photo post may leave the words empty.
create or replace function public.edit_chatter_post(p_post uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.chatter_post;
  v_body text := btrim(coalesce(p_body, ''));
begin
  select * into v_post from public.chatter_post where id = p_post;
  if v_post.id is null or v_post.author_id is distinct from (select auth.uid())
    or not public.is_team_member(v_post.team_id) then
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
  update public.chatter_post set body = v_body, edited_at = now() where id = p_post;
end;
$$;

-- Removing a post takes its photos out of the feed too (the app deletes the files).
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
