-- Chatter: each team's own chat feed (posts and quote replies), adults only. Kids have no
-- accounts, and only the team's members (coaches, managers, treasurers, parents) read or post.
-- Club admins never see it. There are no private messages: every post goes to the whole team.
--
-- People insert their own posts; every other change (edit, remove, pin, report, mute) goes
-- through the functions below, so the rules live here and not in the browser.

-- ── Each member's Chatter state on a team ──
create table public.chatter_member (
  team_id uuid not null references public.team (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Tapped "I'm 18 or older and a coach or parent on this team" and the community rules.
  agreed_at timestamptz,
  last_read_at timestamptz,
  -- Set by a coach or manager: no posting until then.
  muted_until timestamptz,
  muted_by uuid references auth.users (id) on delete set null,
  primary key (team_id, user_id)
);
alter table public.chatter_member enable row level security;

create policy chatter_member_read on public.chatter_member for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.has_team_role(team_id, array['coach', 'manager']::public.member_role[])
  );

-- ── Posts ──
create table public.chatter_post (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.team (id) on delete cascade,
  -- Null once the account is deleted ("Former member").
  author_id uuid references auth.users (id) on delete set null,
  body text not null check (char_length(body) <= 2000),
  quote_post_id uuid references public.chatter_post (id) on delete set null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  pinned_at timestamptz,
  removed_at timestamptz,
  removed_by uuid references auth.users (id) on delete set null,
  -- A removed post's text leaves the feed (see chatter_removed_post).
  check (removed_at is not null or char_length(btrim(body)) > 0)
);
create index chatter_post_team_created on public.chatter_post (team_id, created_at desc);
alter table public.chatter_post enable row level security;

create policy chatter_post_read on public.chatter_post for select to authenticated
  using (public.is_team_member(team_id));

create policy chatter_post_insert on public.chatter_post for insert to authenticated
  with check (author_id = (select auth.uid()) and public.is_team_member(team_id));

-- A removed post's text, kept 30 days for reports, readable only by the service role.
create table public.chatter_removed_post (
  post_id uuid primary key references public.chatter_post (id) on delete cascade,
  team_id uuid not null references public.team (id) on delete cascade,
  author_id uuid,
  body text not null,
  removed_by uuid,
  removed_at timestamptz not null default now()
);
alter table public.chatter_removed_post enable row level security;
revoke all on public.chatter_removed_post from anon, authenticated;

-- ── Reports ──
create table public.chatter_report (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.chatter_post (id) on delete cascade,
  team_id uuid not null references public.team (id) on delete cascade,
  reporter_id uuid references auth.users (id) on delete set null,
  reason text not null check (reason in ('mean', 'inappropriate', 'child_safety', 'spam', 'other')),
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null,
  unique (post_id, reporter_id)
);
create index chatter_report_open on public.chatter_report (team_id) where resolved_at is null;
alter table public.chatter_report enable row level security;

create policy chatter_report_read on public.chatter_report for select to authenticated
  using (
    reporter_id = (select auth.uid())
    or public.has_team_role(team_id, array['coach', 'manager']::public.member_role[])
  );

-- ── A new post: paid team, agreed, not muted, not flooding, quoting its own team ──
-- Not security definer: it runs as the person posting, so current_user tells people apart
-- from the database's own system posts, and it reads only what they can read.
create function public.chatter_post_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_state public.chatter_member;
  v_recent int;
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
revoke execute on function public.chatter_post_before_insert() from public, anon, authenticated;

create trigger chatter_post_before_insert
  before insert on public.chatter_post
  for each row execute function public.chatter_post_before_insert();

-- ── Functions people call ──

-- Agree to the rules (once per team).
create function public.agree_chatter(p_team uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_team_member(p_team) then
    raise exception 'You''re not on this team.' using errcode = '42501';
  end if;
  insert into public.chatter_member (team_id, user_id, agreed_at, last_read_at)
  values (p_team, (select auth.uid()), now(), now())
  on conflict (team_id, user_id) do update set agreed_at = coalesce(public.chatter_member.agreed_at, now());
end;
$$;
revoke execute on function public.agree_chatter(uuid) from public, anon;

-- Mark the feed read up to now.
create function public.mark_chatter_read(p_team uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_team_member(p_team) then
    return;
  end if;
  insert into public.chatter_member (team_id, user_id, last_read_at)
  values (p_team, (select auth.uid()), now())
  on conflict (team_id, user_id) do update set last_read_at = now();
end;
$$;
revoke execute on function public.mark_chatter_read(uuid) from public, anon;

-- The author fixes their own post within 10 minutes.
create function public.edit_chatter_post(p_post uuid, p_body text)
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
  if v_body = '' or char_length(v_body) > 2000 then
    raise exception 'A post needs 1 to 2,000 characters.' using errcode = '22023';
  end if;
  update public.chatter_post set body = v_body, edited_at = now() where id = p_post;
end;
$$;
revoke execute on function public.edit_chatter_post(uuid, text) from public, anon;

-- The author, or a coach or manager, removes a post. Its text is kept 30 days, out of view.
create function public.remove_chatter_post(p_post uuid)
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
  values (v_post.id, v_post.team_id, v_post.author_id, v_post.body, (select auth.uid()))
  on conflict (post_id) do nothing;
  update public.chatter_post
  set body = '', removed_at = now(), removed_by = (select auth.uid()), pinned_at = null
  where id = p_post;
end;
$$;
revoke execute on function public.remove_chatter_post(uuid) from public, anon;

-- A coach or manager pins one post to the top (pinning another replaces it), or unpins it.
create function public.pin_chatter_post(p_post uuid, p_pin boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.chatter_post;
begin
  select * into v_post from public.chatter_post where id = p_post;
  if v_post.id is null
    or not public.has_team_role(v_post.team_id, array['coach', 'manager']::public.member_role[]) then
    raise exception 'Only coaches and managers can pin posts.' using errcode = '42501';
  end if;
  if p_pin and v_post.removed_at is not null then
    raise exception 'That post was removed.' using errcode = '42501';
  end if;
  update public.chatter_post set pinned_at = null
  where team_id = v_post.team_id and pinned_at is not null and id <> p_post;
  update public.chatter_post set pinned_at = case when p_pin then now() end where id = p_post;
end;
$$;
revoke execute on function public.pin_chatter_post(uuid, boolean) from public, anon;

-- Anyone on the team reports a post to the team's coaches and managers.
create function public.report_chatter_post(p_post uuid, p_reason text, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team uuid;
begin
  select team_id into v_team from public.chatter_post where id = p_post;
  if v_team is null or not public.is_team_member(v_team) then
    raise exception 'You''re not on this team.' using errcode = '42501';
  end if;
  insert into public.chatter_report (post_id, team_id, reporter_id, reason, note)
  values (p_post, v_team, (select auth.uid()), p_reason, nullif(btrim(coalesce(p_note, '')), ''))
  on conflict (post_id, reporter_id) do update
    set reason = excluded.reason, note = excluded.note, created_at = now(), resolved_at = null,
      resolved_by = null;
end;
$$;
revoke execute on function public.report_chatter_post(uuid, text, text) from public, anon;

-- A coach or manager marks a report handled (after removing the post, or deciding it's fine).
create function public.resolve_chatter_report(p_report uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team uuid;
begin
  select team_id into v_team from public.chatter_report where id = p_report;
  if v_team is null
    or not public.has_team_role(v_team, array['coach', 'manager']::public.member_role[]) then
    raise exception 'Only coaches and managers handle reports.' using errcode = '42501';
  end if;
  update public.chatter_report set resolved_at = now(), resolved_by = (select auth.uid())
  where id = p_report;
end;
$$;
revoke execute on function public.resolve_chatter_report(uuid) from public, anon;

-- A coach or manager pauses someone's posting (p_until null lifts it). Never another coach,
-- manager or the owner.
create function public.mute_chatter_member(p_team uuid, p_user uuid, p_until timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_team_role(p_team, array['coach', 'manager']::public.member_role[]) then
    raise exception 'Only coaches and managers can pause posting.' using errcode = '42501';
  end if;
  if p_user = (select auth.uid()) or exists (
    select 1 from public.member m
    where m.team_id = p_team and m.user_id = p_user and m.role in ('owner', 'coach', 'manager')
  ) then
    raise exception 'Coaches and managers can''t be paused.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.member m where m.team_id = p_team and m.user_id = p_user) then
    raise exception 'They''re not on this team.' using errcode = '42501';
  end if;
  insert into public.chatter_member (team_id, user_id, muted_until, muted_by)
  values (p_team, p_user, p_until, case when p_until is not null then (select auth.uid()) end)
  on conflict (team_id, user_id) do update
    set muted_until = excluded.muted_until, muted_by = excluded.muted_by;
end;
$$;
revoke execute on function public.mute_chatter_member(uuid, uuid, timestamptz) from public, anon;

-- How many posts by others since the member last read the feed (for the menu badge).
create function public.chatter_unread(p_team uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.chatter_post p
  where public.is_team_member(p_team) and p.team_id = p_team and p.removed_at is null
    and p.author_id is distinct from (select auth.uid())
    and p.created_at > coalesce(
      (select c.last_read_at from public.chatter_member c
       where c.team_id = p_team and c.user_id = (select auth.uid())),
      '-infinity'::timestamptz);
$$;
revoke execute on function public.chatter_unread(uuid) from public, anon;

-- Removed posts' text is gone after 30 days (daily, where the scheduler is available).
create function public.forget_removed_chatter()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.chatter_removed_post where removed_at < now() - interval '30 days';
$$;
revoke execute on function public.forget_removed_chatter() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule('fungo-forget-removed-chatter', '17 4 * * *',
      'select public.forget_removed_chatter()');
  end if;
  -- Live updates: Supabase Realtime sends new and changed posts to the team's members.
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.chatter_post;
  end if;
end;
$$;
