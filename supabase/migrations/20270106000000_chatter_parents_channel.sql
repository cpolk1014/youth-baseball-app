-- A Parents channel in every team's Chatter: the families only, no coaches. It's the
-- "parents only" GroupMe every team ends up making. Stored as 'families' (the stored names are
-- old: 'parents' is the Team channel and 'team' the Club channel).
--
-- Who's in it: members with the parent role, and a treasurer who is linked to a kid on the team
-- (they're a parent too). Never the owner, coaches or managers, even ones with a kid on the team,
-- and never the club. Nobody moderates it (there are no coaches in it): people remove their own
-- posts, nobody pins, anyone in it can start a poll. A report is the way out: the reported post's
-- text goes to the team's coaches and managers with the report, and they can take it down.
--
-- Also: "Save me from myself" (profile.confirm_posts), a person's own setting that asks before
-- every post goes out.

alter table public.chatter_post drop constraint chatter_post_channel_check;
alter table public.chatter_post add constraint chatter_post_channel_check
  check (channel in ('team', 'parents', 'families'));

alter table public.chatter_member add column families_read_at timestamptz;

alter table public.profile add column confirm_posts boolean not null default false;

-- Whether a person is in a team's Parents channel.
create function public.is_chatter_family(p_team uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.member m
    where m.team_id = p_team and m.user_id = p_user
      and (
        m.role = 'parent'
        or (m.role = 'treasurer' and exists (
          select 1 from public.player_guardian g
          join public.player p on p.id = g.player_id
          where g.user_id = p_user and p.team_id = p_team
        ))
      )
  );
$$;
revoke execute on function public.is_chatter_family(uuid, uuid) from public, anon;
grant execute on function public.is_chatter_family(uuid, uuid) to authenticated;

create or replace function public.chatter_in(p_team uuid, p_channel text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_channel = 'families' then public.is_chatter_family(p_team, (select auth.uid()))
    else public.is_team_member(p_team)
      or (p_channel = 'team' and public.club_sees_team(p_team))
  end;
$$;

-- Nobody moderates the Parents channel.
create or replace function public.chatter_moderator(p_team uuid, p_channel text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_channel <> 'families' and (
    public.has_team_role(p_team, array['coach', 'manager']::public.member_role[])
    or (p_channel = 'team' and public.club_sees_team(p_team))
  );
$$;

-- ── Reads and unread counts ──

create or replace function public.mark_chatter_channel_read(p_team uuid, p_channel text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.chatter_in(p_team, p_channel) then
    return;
  end if;
  insert into public.chatter_member (team_id, user_id, last_read_at, parents_read_at, families_read_at)
  values (p_team, (select auth.uid()),
    case when p_channel = 'team' then now() end,
    case when p_channel = 'parents' then now() end,
    case when p_channel = 'families' then now() end)
  on conflict (team_id, user_id) do update set
    last_read_at = case when p_channel = 'team' then now() else public.chatter_member.last_read_at end,
    parents_read_at = case when p_channel = 'parents' then now() else public.chatter_member.parents_read_at end,
    families_read_at = case when p_channel = 'families' then now() else public.chatter_member.families_read_at end;
end;
$$;

drop function public.chatter_unread(uuid);
drop function public.chatter_unread_channels(uuid);
create function public.chatter_unread_channels(p_team uuid)
returns table (team int, parents int, families int)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select c.last_read_at, c.parents_read_at, c.families_read_at, c.agreed_at
    from public.chatter_member c
    where c.team_id = p_team and c.user_id = (select auth.uid())
  )
  select
    case when public.chatter_in(p_team, 'team') then (
      select count(*)::int from public.chatter_post p
      where p.team_id = p_team and p.channel = 'team' and p.removed_at is null
        and p.author_id is distinct from (select auth.uid())
        and p.created_at > coalesce((select last_read_at from me), '-infinity'::timestamptz)
    ) else 0 end,
    case when public.chatter_in(p_team, 'parents') then (
      select count(*)::int from public.chatter_post p
      where p.team_id = p_team and p.channel = 'parents' and p.removed_at is null
        and p.author_id is distinct from (select auth.uid())
        and p.created_at > coalesce((select parents_read_at from me), '-infinity'::timestamptz)
    ) else 0 end,
    -- The new channel starts quiet: nothing before someone joined Chatter counts.
    case when public.chatter_in(p_team, 'families') then (
      select count(*)::int from public.chatter_post p
      where p.team_id = p_team and p.channel = 'families' and p.removed_at is null
        and p.author_id is distinct from (select auth.uid())
        and p.created_at > coalesce((select families_read_at from me), (select agreed_at from me),
          '-infinity'::timestamptz)
    ) else 0 end;
$$;
revoke execute on function public.chatter_unread_channels(uuid) from public, anon;
grant execute on function public.chatter_unread_channels(uuid) to authenticated;

create function public.chatter_unread(p_team uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select team from public.chatter_unread_channels(p_team);
$$;
revoke execute on function public.chatter_unread(uuid) from public, anon;
grant execute on function public.chatter_unread(uuid) to authenticated;

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
        or (p.channel = 'families'
          and p.created_at > coalesce(c.families_read_at, c.agreed_at)
          and public.is_chatter_family(c.team_id, p_user))
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

-- ── Tags: in the Parents channel, only the people in it (no @coaches, no @everyone) ──

create or replace function public.check_chatter_mentions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tag text;
begin
  if cardinality(new.mentions) = 0 then
    return new;
  end if;
  new.mentions := array(select distinct unnest(new.mentions));
  foreach v_tag in array new.mentions loop
    if new.channel = 'families' then
      if v_tag !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or not public.is_chatter_family(new.team_id, v_tag::uuid) then
        raise exception 'In the Parents channel you can only tag other parents.' using errcode = '42501';
      end if;
    elsif v_tag = 'coaches' then
      continue;
    elsif v_tag = 'everyone' then
      if not exists (
        select 1 from public.member m
        where m.team_id = new.team_id and m.user_id = new.author_id
          and m.role in ('owner', 'coach', 'manager')
      ) then
        raise exception 'Only coaches and managers can tag everyone.' using errcode = '42501';
      end if;
    elsif v_tag !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or not exists (
        select 1 from public.member m where m.team_id = new.team_id and m.user_id = v_tag::uuid
      ) then
      raise exception 'You can only tag people on this team.' using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;

-- ── Polls: anyone in the Parents channel can start one ──

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
  if v_post.channel <> 'families'
    and (select t.chatter_polls from public.team t where t.id = v_post.team_id) <> 'everyone'
    and not public.chatter_moderator(v_post.team_id, v_post.channel) then
    raise exception 'On this team, only coaches and managers start polls.' using errcode = '42501';
  end if;
  insert into public.chatter_poll (post_id, team_id, options, multi, anonymous, closes_at)
  values (p_post, v_post.team_id, p_options, coalesce(p_multi, false), coalesce(p_anonymous, false),
    p_closes_at);
end;
$$;

-- ── Reports: a reported Parents post goes to the coaches with its words ──

alter table public.chatter_report
  add column channel text,
  add column post_author uuid references auth.users (id) on delete set null,
  add column post_body text,
  add column post_photos jsonb;

create or replace function public.report_chatter_post(p_post uuid, p_reason text, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.chatter_post;
  v_families boolean;
begin
  select * into v_post from public.chatter_post where id = p_post;
  if v_post.id is null or not public.chatter_in(v_post.team_id, v_post.channel) then
    raise exception 'You''re not on this team.' using errcode = '42501';
  end if;
  -- The coaches can't read the Parents channel, so they get a copy of what was reported.
  v_families := v_post.channel = 'families';
  insert into public.chatter_report (post_id, team_id, reporter_id, reason, note, channel,
    post_author, post_body, post_photos)
  values (p_post, v_post.team_id, (select auth.uid()), p_reason,
    nullif(btrim(coalesce(p_note, '')), ''), v_post.channel,
    case when v_families then v_post.author_id end,
    case when v_families then v_post.body end,
    case when v_families then v_post.photos end)
  on conflict (post_id, reporter_id) do update
    set reason = excluded.reason, note = excluded.note, created_at = now(), resolved_at = null,
      resolved_by = null, channel = excluded.channel, post_author = excluded.post_author,
      post_body = excluded.post_body, post_photos = excluded.post_photos;
end;
$$;
revoke execute on function public.report_chatter_post(uuid, text, text) from public, anon;

-- Remove: the author, a channel's moderators, and for a reported Parents post the team's
-- coaches and managers.
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
    or (v_post.channel = 'families'
      and public.has_team_role(v_post.team_id, array['coach', 'manager']::public.member_role[])
      and exists (select 1 from public.chatter_report r where r.post_id = p_post))
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

-- ── Photos: a Parents channel photo is only for the people in it ──

create function public.chatter_photo_visible(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_team_member(public.receipt_team_id(p_name)) and (
    public.chatter_photo_owner(p_name) = (select auth.uid())
    or public.chatter_in(public.receipt_team_id(p_name), 'families')
    or not exists (
      select 1 from public.chatter_post p
      where p.team_id = public.receipt_team_id(p_name) and p.channel = 'families'
        and (p.photos @> jsonb_build_array(jsonb_build_object('path', p_name))
          or p.photos @> jsonb_build_array(jsonb_build_object('thumb', p_name)))
    )
    -- Coaches see the photos of a reported Parents post.
    or (public.has_team_role(public.receipt_team_id(p_name), array['coach', 'manager']::public.member_role[])
      and exists (
        select 1 from public.chatter_report r
        where r.team_id = public.receipt_team_id(p_name) and r.resolved_at is null
          and (r.post_photos @> jsonb_build_array(jsonb_build_object('path', p_name))
            or r.post_photos @> jsonb_build_array(jsonb_build_object('thumb', p_name)))
      ))
  );
$$;
revoke execute on function public.chatter_photo_visible(text) from public, anon;
grant execute on function public.chatter_photo_visible(text) to authenticated;

drop policy "team members view chatter photos" on storage.objects;
create policy "team members view chatter photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'chatter-photos' and public.chatter_photo_visible(name));

-- ── Notifications: the Parents channel has its own switch ──

alter table public.notify_pref drop constraint notify_pref_category_check;
alter table public.notify_pref add constraint notify_pref_category_check
  check (category in ('chatter', 'parents', 'families', 'coach_chatter', 'games', 'money',
    'mention', 'stats'));
