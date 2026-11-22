-- Two Chatter channels per team, like a club's two GroupMe groups:
--   Team: everyone on the team, plus the club's director and admins as full members while the
--     team holds the club's code (they read, post, react, vote, and remove or pin, since the
--     club owns this channel). Club posts and Fungo's game day posts land here.
--   Parents: everyone on the team (coaches, managers, treasurer, parents), and never the club.
-- Every post so far is in Team.

alter table public.chatter_post
  add column channel text not null default 'team' check (channel in ('team', 'parents'));
create index chatter_post_team_channel on public.chatter_post (team_id, channel, created_at desc);

-- The Parents channel's own read marker (the Team channel keeps last_read_at).
alter table public.chatter_member add column parents_read_at timestamptz;

-- Who is in a channel: the team, and for Team also the club's admins (active code).
create function public.chatter_in(p_team uuid, p_channel text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_team_member(p_team)
    or (p_channel = 'team' and public.club_sees_team(p_team));
$$;
revoke execute on function public.chatter_in(uuid, text) from public, anon;
grant execute on function public.chatter_in(uuid, text) to authenticated;

-- Who moderates a channel: the team's coaches and managers, and in Team the club's admins.
create function public.chatter_moderator(p_team uuid, p_channel text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_team_role(p_team, array['coach', 'manager']::public.member_role[])
    or (p_channel = 'team' and public.club_sees_team(p_team));
$$;
revoke execute on function public.chatter_moderator(uuid, text) from public, anon;
grant execute on function public.chatter_moderator(uuid, text) to authenticated;

-- ── Reading and posting ──

drop policy chatter_post_read on public.chatter_post;
create policy chatter_post_read on public.chatter_post for select to authenticated
  using (public.chatter_in(team_id, channel));

drop policy chatter_post_insert on public.chatter_post;
create policy chatter_post_insert on public.chatter_post for insert to authenticated
  with check (author_id = (select auth.uid()) and public.chatter_in(team_id, channel));

drop policy chatter_poll_read on public.chatter_poll;
create policy chatter_poll_read on public.chatter_poll for select to authenticated
  using (exists (
    select 1 from public.chatter_post p
    where p.id = chatter_poll.post_id and public.chatter_in(p.team_id, p.channel)
  ));

drop policy chatter_reaction_read on public.chatter_reaction;
create policy chatter_reaction_read on public.chatter_reaction for select to authenticated
  using (exists (
    select 1 from public.chatter_post p
    where p.id = chatter_reaction.post_id and public.chatter_in(p.team_id, p.channel)
  ));

-- Club admins can agree to a team's Chatter rules (for its Team channel) too.
create or replace function public.agree_chatter(p_team uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.chatter_in(p_team, 'team') then
    raise exception 'You''re not on this team.' using errcode = '42501';
  end if;
  insert into public.chatter_member (team_id, user_id, agreed_at, last_read_at, parents_read_at)
  values (p_team, (select auth.uid()), now(), now(), now())
  on conflict (team_id, user_id) do update set agreed_at = coalesce(public.chatter_member.agreed_at, now());
end;
$$;

-- Mark a channel read up to now.
create function public.mark_chatter_channel_read(p_team uuid, p_channel text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.chatter_in(p_team, p_channel) then
    return;
  end if;
  insert into public.chatter_member (team_id, user_id, last_read_at, parents_read_at)
  values (p_team, (select auth.uid()),
    case when p_channel = 'team' then now() end, case when p_channel = 'parents' then now() end)
  on conflict (team_id, user_id) do update set
    last_read_at = case when p_channel = 'team' then now() else public.chatter_member.last_read_at end,
    parents_read_at = case when p_channel = 'parents' then now() else public.chatter_member.parents_read_at end;
end;
$$;
revoke execute on function public.mark_chatter_channel_read(uuid, text) from public, anon;
grant execute on function public.mark_chatter_channel_read(uuid, text) to authenticated;

-- The old one marks the Team channel (older app versions still call it).
create or replace function public.mark_chatter_read(p_team uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select public.mark_chatter_channel_read(p_team, 'team');
$$;

-- New posts by others in each channel since I last read it.
create function public.chatter_unread_channels(p_team uuid)
returns table (team int, parents int)
language sql
stable
security definer
set search_path = ''
as $$
  select
    case when public.chatter_in(p_team, 'team') then (
      select count(*)::int from public.chatter_post p
      where p.team_id = p_team and p.channel = 'team' and p.removed_at is null
        and p.author_id is distinct from (select auth.uid())
        and p.created_at > coalesce(
          (select c.last_read_at from public.chatter_member c
           where c.team_id = p_team and c.user_id = (select auth.uid())), '-infinity'::timestamptz)
    ) else 0 end,
    case when public.chatter_in(p_team, 'parents') then (
      select count(*)::int from public.chatter_post p
      where p.team_id = p_team and p.channel = 'parents' and p.removed_at is null
        and p.author_id is distinct from (select auth.uid())
        and p.created_at > coalesce(
          (select c.parents_read_at from public.chatter_member c
           where c.team_id = p_team and c.user_id = (select auth.uid())), '-infinity'::timestamptz)
    ) else 0 end;
$$;
revoke execute on function public.chatter_unread_channels(uuid) from public, anon;
grant execute on function public.chatter_unread_channels(uuid) to authenticated;

-- The old count is the Team channel's.
create or replace function public.chatter_unread(p_team uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select team from public.chatter_unread_channels(p_team);
$$;

-- Photos: club admins post them in Team (the insert policy keeps them out of Parents).
create or replace function public.chatter_can_post_photos(p_team uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.team_paid(p_team) and (
    public.club_sees_team(p_team)
    or (
      public.is_team_member(p_team)
      and (
        (select t.chatter_photos from public.team t where t.id = p_team) = 'everyone'
        or public.has_team_role(p_team, array['coach', 'manager']::public.member_role[])
      )
    )
  );
$$;

-- Club admins see a team's photos only where they're on a Team channel post.
create function public.club_sees_team_photo(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.club_sees_team(public.receipt_team_id(p_name)) and exists (
    select 1 from public.chatter_post p
    where p.team_id = public.receipt_team_id(p_name) and p.channel = 'team'
      and exists (
        select 1 from jsonb_array_elements(p.photos) ph
        where ph ->> 'path' = p_name or ph ->> 'thumb' = p_name
      )
  );
$$;
revoke execute on function public.club_sees_team_photo(text) from public, anon;
grant execute on function public.club_sees_team_photo(text) to authenticated;

create policy "club admins view team-channel photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'chatter-photos' and public.club_sees_team_photo(name));
create policy "club admins remove their own team photos" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'chatter-photos'
    and public.chatter_photo_owner(name) = (select auth.uid())
    and public.club_sees_team(public.receipt_team_id(name))
  );

-- New posts: as before, plus a quote must be from the same channel.
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
  -- The database and the service role write system posts; these rules are for people.
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
    where q.id = new.quote_post_id and q.team_id = new.team_id and q.channel = new.channel
      and q.removed_at is null
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

-- ── Changing posts ──

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
    or not public.chatter_in(v_post.team_id, v_post.channel) then
    raise exception 'Only the person who posted can edit it.' using errcode = '42501';
  end if;
  if v_post.removed_at is not null then
    raise exception 'That post was removed.' using errcode = '42501';
  end if;
  if v_post.created_at < now() - interval '10 minutes' then
    raise exception 'Posts can be edited for 10 minutes. Remove it and post again instead.'
      using errcode = '42501';
  end if;
  if char_length(v_body) > 2000
    or (v_body = '' and jsonb_array_length(v_post.photos) = 0 and v_post.gif is null) then
    raise exception 'A post needs 1 to 2,000 characters.' using errcode = '22023';
  end if;
  update public.chatter_post set body = v_body, edited_at = now() where id = p_post;
end;
$$;

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
    (v_post.author_id = (select auth.uid()) and public.chatter_in(v_post.team_id, v_post.channel))
    or public.chatter_moderator(v_post.team_id, v_post.channel)
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

-- One pinned post per channel.
create or replace function public.pin_chatter_post(p_post uuid, p_pin boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.chatter_post;
begin
  select * into v_post from public.chatter_post where id = p_post;
  if v_post.id is null or not public.chatter_moderator(v_post.team_id, v_post.channel) then
    raise exception 'Only coaches and managers can pin posts.' using errcode = '42501';
  end if;
  if p_pin and v_post.removed_at is not null then
    raise exception 'That post was removed.' using errcode = '42501';
  end if;
  update public.chatter_post set pinned_at = null
  where team_id = v_post.team_id and channel = v_post.channel and pinned_at is not null
    and id <> p_post;
  update public.chatter_post set pinned_at = case when p_pin then now() end where id = p_post;
end;
$$;

create or replace function public.react_chatter_post(p_post uuid, p_emoji text, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.chatter_post;
  v_state public.chatter_member;
  v_me uuid := (select auth.uid());
  v_emoji text := btrim(coalesce(p_emoji, ''));
begin
  select * into v_post from public.chatter_post where id = p_post for update;
  if v_post.id is null or not public.chatter_in(v_post.team_id, v_post.channel) then
    raise exception 'You''re not on this team.' using errcode = '42501';
  end if;
  if v_post.removed_at is not null then
    raise exception 'That post was removed.' using errcode = '42501';
  end if;

  if p_on then
    perform public.require_team_paid(v_post.team_id);
    select * into v_state from public.chatter_member
    where team_id = v_post.team_id and user_id = v_me;
    if v_state.agreed_at is null then
      raise exception 'Agree to Chatter''s rules first.' using errcode = '42501';
    end if;
    if v_state.muted_until is not null and v_state.muted_until > now() then
      raise exception 'A coach has paused your posting in Chatter for now.' using errcode = '42501';
    end if;
    if v_emoji = '' or char_length(v_emoji) > 16 or v_emoji ~ '[[:alpha:][:space:]<>&"''`\\]'
      or v_emoji ~ '^[0-9#*]+$' then
      raise exception 'Pick an emoji.' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.chatter_reaction
      where post_id = p_post and user_id = v_me and emoji = v_emoji
    ) then
      if (select count(*) from public.chatter_reaction where post_id = p_post and user_id = v_me) >= 3 then
        raise exception 'Up to 3 emoji on a post. Tap one of yours to take it back.'
          using errcode = '22023';
      end if;
      if (select count(distinct emoji) from public.chatter_reaction where post_id = p_post) >= 20 then
        raise exception 'This post has all the emoji it can hold. Tap one that''s there.'
          using errcode = '22023';
      end if;
      insert into public.chatter_reaction (post_id, team_id, user_id, emoji)
      values (p_post, v_post.team_id, v_me, v_emoji);
    end if;
  else
    delete from public.chatter_reaction
    where post_id = p_post and user_id = v_me and emoji = v_emoji;
  end if;

  update public.chatter_post p set reactions = coalesce((
    select jsonb_agg(jsonb_build_object('e', r.emoji, 'u', r.users) order by r.first_at)
    from (
      select emoji, min(created_at) as first_at,
        jsonb_agg(user_id order by created_at) as users
      from public.chatter_reaction where post_id = p_post
      group by emoji
    ) r
  ), '[]'::jsonb)
  where p.id = p_post;
end;
$$;

-- ── Polls ──

drop function public.create_chatter_poll(uuid, text, text[], boolean, boolean, timestamptz);
create function public.create_chatter_poll(
  p_team uuid,
  p_question text,
  p_options text[],
  p_multi boolean,
  p_anonymous boolean,
  p_closes_at timestamptz,
  p_channel text default 'team'
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_options text[];
  v_post uuid;
begin
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
  if btrim(coalesce(p_question, '')) = '' then
    raise exception 'Ask a question first.' using errcode = '22023';
  end if;
  if p_closes_at is not null and p_closes_at <= now() then
    raise exception 'Pick a closing time that hasn''t passed.' using errcode = '22023';
  end if;

  insert into public.chatter_post (team_id, author_id, body, kind, channel)
  values (p_team, (select auth.uid()), p_question, 'poll', coalesce(p_channel, 'team'))
  returning id into v_post;
  perform public.add_chatter_poll(v_post, v_options, p_multi, p_anonymous, p_closes_at);
  return v_post;
end;
$$;
revoke execute on function public.create_chatter_poll(uuid, text, text[], boolean, boolean, timestamptz, text)
  from public, anon;

create or replace function public.add_chatter_poll(
  p_post uuid,
  p_options text[],
  p_multi boolean,
  p_anonymous boolean,
  p_closes_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.chatter_post;
begin
  select * into v_post from public.chatter_post where id = p_post;
  if v_post.id is null or v_post.kind <> 'poll' or v_post.author_id is distinct from (select auth.uid())
    or v_post.removed_at is not null or v_post.created_at < now() - interval '1 minute'
    or exists (select 1 from public.chatter_poll where post_id = p_post) then
    raise exception 'That isn''t a new poll of yours.' using errcode = '42501';
  end if;
  if (select t.chatter_polls from public.team t where t.id = v_post.team_id) <> 'everyone'
    and not public.chatter_moderator(v_post.team_id, v_post.channel) then
    raise exception 'On this team, only coaches and managers start polls.' using errcode = '42501';
  end if;
  insert into public.chatter_poll (post_id, team_id, options, multi, anonymous, closes_at)
  values (p_post, v_post.team_id, p_options, coalesce(p_multi, false), coalesce(p_anonymous, false),
    p_closes_at);
end;
$$;

create or replace function public.vote_chatter_poll(p_post uuid, p_options int[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_poll public.chatter_poll;
  v_post public.chatter_post;
  v_choices int[] := coalesce((select array_agg(distinct o) from unnest(p_options) o), '{}');
begin
  select * into v_poll from public.chatter_poll where post_id = p_post;
  select * into v_post from public.chatter_post where id = p_post;
  if v_poll.post_id is null or not public.chatter_in(v_post.team_id, v_post.channel) then
    raise exception 'You''re not on this team.' using errcode = '42501';
  end if;
  if v_post.removed_at is not null then
    raise exception 'That poll was removed.' using errcode = '42501';
  end if;
  if v_poll.closed_at is not null or (v_poll.closes_at is not null and v_poll.closes_at <= now()) then
    raise exception 'This poll is closed.' using errcode = '42501';
  end if;
  if exists (select 1 from unnest(v_choices) o where o < 0 or o >= array_length(v_poll.options, 1)) then
    raise exception 'That isn''t one of the choices.' using errcode = '22023';
  end if;
  if not v_poll.multi and coalesce(array_length(v_choices, 1), 0) > 1 then
    raise exception 'Pick one choice.' using errcode = '22023';
  end if;
  delete from public.chatter_poll_vote where post_id = p_post and user_id = (select auth.uid());
  insert into public.chatter_poll_vote (post_id, user_id, option)
  select p_post, (select auth.uid()), o from unnest(v_choices) o;
  update public.chatter_poll set version = version + 1 where post_id = p_post;
end;
$$;

create or replace function public.close_chatter_poll(p_post uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_poll public.chatter_poll;
  v_post public.chatter_post;
begin
  select * into v_poll from public.chatter_poll where post_id = p_post;
  select * into v_post from public.chatter_post where id = p_post;
  if v_post.club_post_id is not null then
    raise exception 'The club closes its own polls.' using errcode = '42501';
  end if;
  if v_poll.post_id is null or not (
    (v_post.author_id = (select auth.uid()) and public.chatter_in(v_post.team_id, v_post.channel))
    or public.chatter_moderator(v_post.team_id, v_post.channel)
  ) then
    raise exception 'Only the person who asked, or a coach or manager, can close the poll.'
      using errcode = '42501';
  end if;
  update public.chatter_poll set closed_at = coalesce(closed_at, now()), version = version + 1
  where post_id = p_post;
end;
$$;

create or replace function public.chatter_poll_results(p_posts uuid[])
returns table (post_id uuid, option int, votes int, mine boolean, voters uuid[])
language sql
stable
security definer
set search_path = ''
as $$
  select p.post_id, o.n - 1, count(v.user_id)::int,
    coalesce(bool_or(v.user_id = (select auth.uid())), false),
    case when p.anonymous then null
      else coalesce(array_agg(v.user_id order by v.voted_at) filter (where v.user_id is not null), '{}')
    end
  from public.chatter_poll p
  join public.chatter_post cp on cp.id = p.post_id
  cross join lateral unnest(p.options) with ordinality as o(label, n)
  left join public.chatter_poll_vote v on v.post_id = p.post_id and v.option = o.n - 1
  where p.post_id = any (p_posts) and public.chatter_in(cp.team_id, cp.channel)
  group by p.post_id, p.anonymous, o.n
  order by p.post_id, o.n;
$$;

-- ── Names ──

-- Who can post in a team's Team channel, so everyone sees names on posts: the team's members
-- (with their kids' first names for parents) and the club's admins. Anyone in the channel.
create function public.chatter_people(p_team uuid)
returns table (user_id uuid, name text, role text, kids text[])
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, m.display_name, m.role::text,
    coalesce((
      select array_agg(split_part(btrim(p.name), ' ', 1) order by p.name)
      from public.player_guardian g join public.player p on p.id = g.player_id
      where g.user_id = m.user_id and p.team_id = p_team
    ), '{}')
  from public.member m
  where m.team_id = p_team and m.user_id is not null and public.chatter_in(p_team, 'team')
  union all
  select a.user_id, a.display_name, case when a.role = 'director' then 'director' else 'club_admin' end, '{}'
  from public.club_admin a
  join public.club_code c on c.organization_id = a.organization_id
  where c.team_id = p_team and c.expires_on >= current_date and public.chatter_in(p_team, 'team')
    and not exists (select 1 from public.member m2 where m2.team_id = p_team and m2.user_id = a.user_id);
$$;
revoke execute on function public.chatter_people(uuid) from public, anon;
grant execute on function public.chatter_people(uuid) to authenticated;

-- ── The club's view ──

-- Each club team's Team channel for its admins: the latest post and how many are new to me.
create function public.club_team_chatter(p_org uuid)
returns table (
  team_id uuid, team_name text, age_group text, last_body text, last_kind text,
  last_at timestamptz, unread int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_club_admin(p_org) then
    raise exception 'Only club admins see the club''s teams.' using errcode = '42501';
  end if;
  return query
  select t.id, t.name, t.age_group, last.body, last.kind, last.created_at,
    (select count(*)::int from public.chatter_post p
     where p.team_id = t.id and p.channel = 'team' and p.removed_at is null
       and p.author_id is distinct from (select auth.uid())
       and p.created_at > coalesce(
         (select cm.last_read_at from public.chatter_member cm
          where cm.team_id = t.id and cm.user_id = (select auth.uid())),
         now() - interval '7 days'))
  from (select distinct c.team_id from public.club_code c
        where c.organization_id = p_org and c.expires_on >= current_date and c.team_id is not null) ct
  join public.team t on t.id = ct.team_id
  left join lateral (
    select p.body, p.kind, p.created_at from public.chatter_post p
    where p.team_id = t.id and p.channel = 'team' and p.removed_at is null
    order by p.created_at desc limit 1
  ) last on true
  order by last.created_at desc nulls last, t.age_group, t.name;
end;
$$;
revoke execute on function public.club_team_chatter(uuid) from public, anon;
grant execute on function public.club_team_chatter(uuid) to authenticated;

-- ── The home-screen badge counts both channels (and a club admin's teams' Team channels) ──

create or replace function public.unread_total_for(p_user uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select (
    select count(*) from public.chatter_member c
    join public.chatter_post p on p.team_id = c.team_id
    where c.user_id = p_user and c.agreed_at is not null and p.removed_at is null
      and p.author_id is distinct from p_user
      and (
        (p.channel = 'team'
          and p.created_at > coalesce(c.last_read_at, '-infinity'::timestamptz)
          and (
            exists (select 1 from public.member m where m.team_id = c.team_id and m.user_id = p_user)
            or exists (
              select 1 from public.club_code cc
              join public.club_admin a on a.organization_id = cc.organization_id
              where cc.team_id = c.team_id and cc.expires_on >= current_date and a.user_id = p_user)
          ))
        or (p.channel = 'parents'
          and p.created_at > coalesce(c.parents_read_at, c.agreed_at)
          and exists (select 1 from public.member m where m.team_id = c.team_id and m.user_id = p_user))
      )
  )::int + (
    select count(*) from public.club_coach_post p
    where p.removed_at is null and p.author_id is distinct from p_user
      and (
        exists (select 1 from public.club_admin a
                where a.organization_id = p.organization_id and a.user_id = p_user)
        or exists (
          select 1 from public.club_code cc
          join public.team t on t.id = cc.team_id
          join public.member m on m.team_id = cc.team_id
          where cc.organization_id = p.organization_id and cc.expires_on >= current_date
            and t.optioned_at is null and m.user_id = p_user and m.role in ('owner', 'coach'))
      )
      and p.created_at > coalesce(
        (select r.last_read_at from public.club_coach_read r
         where r.organization_id = p.organization_id and r.user_id = p_user),
        now() - interval '7 days')
  )::int;
$$;

-- Each channel has its own notification switch: 'chatter' is Team, 'parents' is Parents.
alter table public.notify_pref drop constraint notify_pref_category_check;
alter table public.notify_pref add constraint notify_pref_category_check
  check (category in ('chatter', 'parents', 'coach_chatter', 'games', 'money', 'mention'));
