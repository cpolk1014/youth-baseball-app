-- "Where do I go?" plays: homework assignments, quiz results, and plays on practices.
-- The plays themselves ship with the app (src/lib/plays/); rows refer to them by id.

alter table public.practice
  add column plays text[] not null default '{}' check (cardinality(plays) <= 20);

-- A set of plays a coach assigns to the team's families.
create table public.play_assignment (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.team (id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 80),
  play_ids text[] not null check (cardinality(play_ids) between 1 and 60),
  due_date date,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index on public.play_assignment (team_id, created_at);

create function public.assignment_team_id(p_assignment_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select team_id from public.play_assignment where id = p_assignment_id
$$;
revoke execute on function public.assignment_team_id(uuid) from public, anon;
grant execute on function public.assignment_team_id(uuid) to authenticated;

alter table public.play_assignment enable row level security;

create policy "members can read assignments" on public.play_assignment
  for select to authenticated using (public.is_team_member(team_id));
create policy "coaches and managers can add assignments" on public.play_assignment
  for insert to authenticated with check (public.has_team_role(team_id, '{coach,manager}'));
create policy "coaches and managers can edit assignments" on public.play_assignment
  for update to authenticated
  using (public.has_team_role(team_id, '{coach,manager}'))
  with check (public.has_team_role(team_id, '{coach,manager}'));
create policy "coaches and managers can delete assignments" on public.play_assignment
  for delete to authenticated using (public.has_team_role(team_id, '{coach,manager}'));

-- One finished quiz on an assignment, by a family member (optionally for one of the team's kids).
create table public.quiz_result (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.play_assignment (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  player_id uuid references public.player (id) on delete set null,
  correct int not null check (correct >= 0),
  total int not null check (total between 1 and 100 and correct <= total),
  completed_at timestamptz not null default now()
);

create index on public.quiz_result (assignment_id);

alter table public.quiz_result enable row level security;

-- Families see their own results; coaches and managers see the whole team's.
create policy "members read own results, coaches read all" on public.quiz_result
  for select to authenticated using (
    (user_id = auth.uid() and public.is_team_member(public.assignment_team_id(assignment_id)))
    or public.has_team_role(public.assignment_team_id(assignment_id), '{coach,manager}')
  );
create policy "members record their own results" on public.quiz_result
  for insert to authenticated with check (
    user_id = auth.uid()
    and public.is_team_member(public.assignment_team_id(assignment_id))
    and (
      player_id is null
      or exists (
        select 1 from public.player p
        where p.id = player_id and p.team_id = public.assignment_team_id(assignment_id)
      )
    )
  );
