-- "Option" a team (archive it, like optioning a player down to AAA) and "Call Up" to bring
-- it back. Optioned teams stay readable but drop out of the normal app flow.
alter table public.team add column optioned_at timestamptz;

-- A team must be optioned before it can be deleted (a two-step guard against accidents).
drop policy "coaches can delete teams" on public.team;
create policy "coaches can delete optioned teams" on public.team
  for delete to authenticated
  using (public.has_team_role(id, '{coach}') and optioned_at is not null);
