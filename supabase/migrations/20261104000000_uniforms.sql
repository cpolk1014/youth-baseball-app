-- Uniforms: a team's named uniform combos (shirt, pants, hat, belt, socks), and what each
-- game wears: one of the combos, or a combo made just for that game. Everyone on the team
-- sees them (families dress the kids); coaches and managers make and assign them.

create table public.uniform_combo (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.team (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  shirt text check (shirt is null or length(shirt) between 1 and 40),
  pants text check (pants is null or length(pants) between 1 and 40),
  hat text check (hat is null or length(hat) between 1 and 40),
  belt text check (belt is null or length(belt) between 1 and 40),
  socks text check (socks is null or length(socks) between 1 and 40),
  created_at timestamptz not null default now()
);

create index on public.uniform_combo (team_id);

alter table public.uniform_combo enable row level security;

create policy "members see the team's uniforms" on public.uniform_combo
  for select to authenticated using (public.is_team_member(team_id));
create policy "coaches and managers add uniforms" on public.uniform_combo
  for insert to authenticated with check (public.has_team_role(team_id, '{coach,manager}'));
create policy "coaches and managers change uniforms" on public.uniform_combo
  for update to authenticated
  using (public.has_team_role(team_id, '{coach,manager}'))
  with check (public.has_team_role(team_id, '{coach,manager}'));
create policy "coaches and managers remove uniforms" on public.uniform_combo
  for delete to authenticated using (public.has_team_role(team_id, '{coach,manager}'));

-- A game wears a saved combo or its own pieces, not both. Deleting a combo leaves its
-- games with no uniform set.
alter table public.game
  add column uniform_combo_id uuid references public.uniform_combo (id) on delete set null,
  add column uniform_custom jsonb check (
    uniform_custom is null
    or (jsonb_typeof(uniform_custom) = 'object' and octet_length(uniform_custom::text) < 1000)
  ),
  add constraint game_one_uniform check (uniform_combo_id is null or uniform_custom is null);

-- A game can only wear its own team's combo.
create function public.check_game_uniform()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.uniform_combo_id is not null and not exists (
    select 1 from public.uniform_combo u
    join public.season s on s.team_id = u.team_id
    where u.id = new.uniform_combo_id and s.id = new.season_id
  ) then
    raise exception 'that uniform belongs to another team' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger game_uniform_team
  before insert or update of uniform_combo_id, season_id on public.game
  for each row execute function public.check_game_uniform();
