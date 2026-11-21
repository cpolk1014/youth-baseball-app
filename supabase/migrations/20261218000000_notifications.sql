-- Unread badges and push notifications.
--   Unread: Coach Chatter remembers when each person last read each club's feed (team Chatter
--   already does, chatter_member.last_read_at).
--   Push: each phone or browser someone turns notifications on for is a subscription; each
--   person picks, per team or club, which kinds they get (notify_pref; on unless turned off).
--   Sending happens on the server (service role), once per post (push_sent).

-- ── Coach Chatter unread ──

create table public.club_coach_read (
  organization_id uuid not null references public.organization (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
alter table public.club_coach_read enable row level security;
create policy club_coach_read_own on public.club_coach_read for select to authenticated
  using (user_id = (select auth.uid()));

create function public.mark_coach_chatter_read(p_org uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.club_coach_member(p_org) then
    raise exception 'You''re not in this club''s Coach Chatter.' using errcode = '42501';
  end if;
  insert into public.club_coach_read (organization_id, user_id, last_read_at)
  values (p_org, (select auth.uid()), now())
  on conflict (organization_id, user_id) do update set last_read_at = now();
end;
$$;
revoke execute on function public.mark_coach_chatter_read(uuid) from public, anon;
grant execute on function public.mark_coach_chatter_read(uuid) to authenticated;

-- New posts by others in every Coach Chatter I'm in, since I last read each.
create function public.my_coach_chatter_unread()
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.club_coach_post p
  join public.organization o on o.id = p.organization_id
  where public.club_coach_member(o.id) and p.removed_at is null
    and p.author_id is distinct from (select auth.uid())
    and p.created_at > coalesce(
      (select r.last_read_at from public.club_coach_read r
       where r.organization_id = o.id and r.user_id = (select auth.uid())),
      -- Someone new to a club starts with the last week unread, not its whole history.
      now() - interval '7 days');
$$;
revoke execute on function public.my_coach_chatter_unread() from public, anon;
grant execute on function public.my_coach_chatter_unread() to authenticated;

-- ── Push subscriptions ──

create table public.push_subscription (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  created_at timestamptz not null default now()
);
create index on public.push_subscription (user_id);
alter table public.push_subscription enable row level security;
create policy push_subscription_own_read on public.push_subscription for select to authenticated
  using (user_id = (select auth.uid()));
create policy push_subscription_own_insert on public.push_subscription for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy push_subscription_own_delete on public.push_subscription for delete to authenticated
  using (user_id = (select auth.uid()));

-- A phone that moves to another account (sign out, sign in as someone else) takes its
-- subscription along: one endpoint, one person.
create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  insert into public.push_subscription (user_id, endpoint, p256dh, auth)
  values ((select auth.uid()), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;
revoke execute on function public.save_push_subscription(text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;

-- ── What each person wants ──

-- scope_id: a team (chatter) or a club (coach_chatter). No row means on.
create table public.notify_pref (
  user_id uuid not null references auth.users (id) on delete cascade,
  scope_id uuid not null,
  category text not null check (category in ('chatter', 'coach_chatter')),
  enabled boolean not null,
  primary key (user_id, scope_id, category)
);
alter table public.notify_pref enable row level security;
create policy notify_pref_own on public.notify_pref for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ── Sent once ──

create table public.push_sent (
  kind text not null,
  ref_id uuid not null,
  sent_at timestamptz not null default now(),
  primary key (kind, ref_id)
);
alter table public.push_sent enable row level security;
-- No policies: only the server (service role) writes it.
