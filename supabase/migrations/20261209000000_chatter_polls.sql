-- Chatter polls: a poll is a post (its words are the question) with 2–10 options. One vote
-- per person (or several, when the poll allows it), changeable until it closes. Votes show who
-- voted, unless the poll is anonymous. Results come from chatter_poll_results; vote rows are
-- private to the voter.

alter table public.chatter_post
  add column kind text not null default 'post' check (kind in ('post', 'poll'));

create table public.chatter_poll (
  post_id uuid primary key references public.chatter_post (id) on delete cascade,
  team_id uuid not null references public.team (id) on delete cascade,
  options text[] not null check (
    array_length(options, 1) between 2 and 10
    and array_position(options, null) is null
  ),
  multi boolean not null default false,
  anonymous boolean not null default false,
  closes_at timestamptz,
  closed_at timestamptz,
  -- Bumped on every vote, so the feed knows to fetch new results (live updates).
  version int not null default 0
);
alter table public.chatter_poll enable row level security;
create policy chatter_poll_read on public.chatter_poll for select to authenticated
  using (public.is_team_member(team_id));

create table public.chatter_poll_vote (
  post_id uuid not null references public.chatter_poll (post_id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  option int not null check (option >= 0),
  voted_at timestamptz not null default now(),
  primary key (post_id, user_id, option)
);
alter table public.chatter_poll_vote enable row level security;
create policy chatter_poll_vote_read on public.chatter_poll_vote for select to authenticated
  using (user_id = (select auth.uid()));

-- Post a poll. Runs as the person posting, so the post goes through the same rules as any
-- other (paid team, agreed, not paused, not flooding).
create function public.create_chatter_poll(
  p_team uuid,
  p_question text,
  p_options text[],
  p_multi boolean,
  p_anonymous boolean,
  p_closes_at timestamptz
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

  insert into public.chatter_post (team_id, author_id, body, kind)
  values (p_team, (select auth.uid()), p_question, 'poll')
  returning id into v_post;
  perform public.add_chatter_poll(v_post, v_options, p_multi, p_anonymous, p_closes_at);
  return v_post;
end;
$$;
revoke execute on function public.create_chatter_poll(uuid, text, text[], boolean, boolean, timestamptz)
  from public, anon;

-- The poll's own row, for a poll post its author just made (called by create_chatter_poll).
create function public.add_chatter_poll(
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
  insert into public.chatter_poll (post_id, team_id, options, multi, anonymous, closes_at)
  values (p_post, v_post.team_id, p_options, coalesce(p_multi, false), coalesce(p_anonymous, false),
    p_closes_at);
end;
$$;
revoke execute on function public.add_chatter_poll(uuid, text[], boolean, boolean, timestamptz)
  from public, anon;

-- Vote (or change or take back a vote: an empty list).
create function public.vote_chatter_poll(p_post uuid, p_options int[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_poll public.chatter_poll;
  v_choices int[] := coalesce((select array_agg(distinct o) from unnest(p_options) o), '{}');
begin
  select * into v_poll from public.chatter_poll where post_id = p_post;
  if v_poll.post_id is null or not public.is_team_member(v_poll.team_id) then
    raise exception 'You''re not on this team.' using errcode = '42501';
  end if;
  if exists (select 1 from public.chatter_post where id = p_post and removed_at is not null) then
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
revoke execute on function public.vote_chatter_poll(uuid, int[]) from public, anon;

-- The poll's author, or a coach or manager, closes it early.
create function public.close_chatter_poll(p_post uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_poll public.chatter_poll;
  v_author uuid;
begin
  select * into v_poll from public.chatter_poll where post_id = p_post;
  select author_id into v_author from public.chatter_post where id = p_post;
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
revoke execute on function public.close_chatter_poll(uuid) from public, anon;

-- Results for the polls on screen: votes per choice, whether I picked it, and who did (null
-- for anonymous polls).
create function public.chatter_poll_results(p_posts uuid[])
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
  cross join lateral unnest(p.options) with ordinality as o(label, n)
  left join public.chatter_poll_vote v on v.post_id = p.post_id and v.option = o.n - 1
  where p.post_id = any (p_posts) and public.is_team_member(p.team_id)
  group by p.post_id, p.anonymous, o.n
  order by p.post_id, o.n;
$$;
revoke execute on function public.chatter_poll_results(uuid[]) from public, anon;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.chatter_poll;
  end if;
end;
$$;
