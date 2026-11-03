-- A person's profile across teams. For now, an optional Venmo handle. Only you can see or
-- change yours. Teammates get a "Pay with Venmo" button, never the handle: the database
-- only says who has one, and the server looks the handle up when someone taps the button.

create table public.profile (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  -- Venmo usernames: 5–30 letters, numbers, hyphens or underscores (no @).
  venmo text check (venmo is null or venmo ~ '^[A-Za-z0-9_-]{5,30}$'),
  updated_at timestamptz not null default now()
);

alter table public.profile enable row level security;

create policy "you see your profile" on public.profile
  for select to authenticated using (user_id = (select auth.uid()));
create policy "you add your profile" on public.profile
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "you change your profile" on public.profile
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "you remove your profile" on public.profile
  for delete to authenticated using (user_id = (select auth.uid()));

/* Which of a team's members have a Venmo handle (not the handles). Team members only. */
create function public.team_venmo_users(p_team_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id
  from public.member m
  join public.profile p on p.user_id = m.user_id and p.venmo is not null
  where m.team_id = p_team_id and public.is_team_member(p_team_id);
$$;

revoke execute on function public.team_venmo_users(uuid) from public, anon;
grant execute on function public.team_venmo_users(uuid) to authenticated;
