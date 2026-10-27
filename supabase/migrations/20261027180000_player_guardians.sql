-- Which parent (team member) goes with which kid. Many-to-many: siblings, two parents.
-- Stores only the link; nothing new about the player.

create function public.player_team_id(p_player_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select team_id from public.player where id = p_player_id
$$;
revoke execute on function public.player_team_id(uuid) from public, anon;
grant execute on function public.player_team_id(uuid) to authenticated;

create table public.player_guardian (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.player (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (player_id, user_id)
);

create index on public.player_guardian (user_id);

alter table public.player_guardian enable row level security;

-- Families see their own links; coaches and managers see the whole team's.
create policy "members read own links, coaches read all" on public.player_guardian
  for select to authenticated using (
    (user_id = auth.uid() and public.is_team_member(public.player_team_id(player_id)))
    or public.has_team_role(public.player_team_id(player_id), '{coach,manager}')
  );

-- A member links themselves to a kid on their team; coaches and managers link any
-- member of the team.
create policy "members link themselves, coaches link anyone on the team"
  on public.player_guardian
  for insert to authenticated with check (
    (user_id = auth.uid() and public.is_team_member(public.player_team_id(player_id)))
    or (
      public.has_team_role(public.player_team_id(player_id), '{coach,manager}')
      and exists (
        select 1 from public.member m
        where m.user_id = player_guardian.user_id
          and m.team_id = public.player_team_id(player_guardian.player_id)
      )
    )
  );

create policy "members unlink themselves, coaches unlink anyone" on public.player_guardian
  for delete to authenticated using (
    user_id = auth.uid()
    or public.has_team_role(public.player_team_id(player_id), '{coach,manager}')
  );

-- Leaving (or being removed from) a team drops that person's links to its kids.
create function public.drop_guardian_links()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.player_guardian g
  using public.player p
  where g.player_id = p.id and p.team_id = old.team_id and g.user_id = old.user_id
    and not exists (
      select 1 from public.member m
      where m.team_id = old.team_id and m.user_id = old.user_id and m.id <> old.id
    );
  return old;
end;
$$;

create trigger drop_guardian_links
  after delete on public.member
  for each row execute function public.drop_guardian_links();
