-- Team money: one ledger of entries per season. Balances and totals are computed from it.
--   bat_around   team cost split across players (one share per player)
--   cleanup      charge to one player
--   walkoff      team pays out
--   safe_at_home a family pays (refund = money given back to the family)
--   rain_check   credit to one player
--   grand_slam   money in that isn't from a family (fundraiser, sponsor)
-- Coaches and treasurers manage it. Everyone else sees Walkoffs, entries tagged to their
-- own kids (and only their kids' shares), and team totals through finance_summary().

create table public.finance_entry (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.season (id) on delete cascade,
  type text not null check (
    type in ('bat_around', 'cleanup', 'walkoff', 'safe_at_home', 'rain_check', 'grand_slam')
  ),
  title text not null check (length(trim(title)) between 1 and 80),
  amount_cents integer not null check (amount_cents between 1 and 10000000),
  entry_date date not null,
  category text check (category is null or length(category) <= 40),
  payee text check (payee is null or length(payee) <= 80),
  method text check (method is null or length(method) <= 20),
  refund boolean not null default false check (not refund or type = 'safe_at_home'),
  estimate boolean not null default false check (not estimate or type in ('walkoff', 'grand_slam')),
  due_dates date[] not null default '{}' check (
    cardinality(due_dates) <= 24 and (cardinality(due_dates) = 0 or type in ('bat_around', 'cleanup'))
  ),
  note text check (note is null or length(note) <= 500),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index on public.finance_entry (season_id, entry_date);

create table public.finance_share (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.finance_entry (id) on delete cascade,
  player_id uuid not null references public.player (id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  unique (entry_id, player_id)
);

create index on public.finance_share (player_id);

create function public.finance_entry_team_id(p_entry_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.team_id from public.finance_entry e join public.season s on s.id = e.season_id
  where e.id = p_entry_id
$$;
revoke execute on function public.finance_entry_team_id(uuid) from public, anon;
grant execute on function public.finance_entry_team_id(uuid) to authenticated;

-- True when the signed-in user is a parent (guardian) of a player tagged on the entry.
create function public.finance_entry_is_mine(p_entry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.finance_share s
    join public.player_guardian g on g.player_id = s.player_id
    where s.entry_id = p_entry_id and g.user_id = (select auth.uid())
  )
$$;
revoke execute on function public.finance_entry_is_mine(uuid) from public, anon;
grant execute on function public.finance_entry_is_mine(uuid) to authenticated;

alter table public.finance_entry enable row level security;
alter table public.finance_share enable row level security;

create policy "money managers see all; members see walkoffs and their kids' entries"
  on public.finance_entry for select to authenticated using (
    public.has_team_role(public.season_team_id(season_id), '{coach,treasurer}')
    or (
      public.is_team_member(public.season_team_id(season_id))
      and (type = 'walkoff' or public.finance_entry_is_mine(id))
    )
  );
create policy "coaches and treasurers add entries" on public.finance_entry
  for insert to authenticated
  with check (public.has_team_role(public.season_team_id(season_id), '{coach,treasurer}'));
create policy "coaches and treasurers edit entries" on public.finance_entry
  for update to authenticated
  using (public.has_team_role(public.season_team_id(season_id), '{coach,treasurer}'))
  with check (public.has_team_role(public.season_team_id(season_id), '{coach,treasurer}'));
create policy "coaches and treasurers delete entries" on public.finance_entry
  for delete to authenticated
  using (public.has_team_role(public.season_team_id(season_id), '{coach,treasurer}'));

create policy "money managers see all shares; parents see their kids'" on public.finance_share
  for select to authenticated using (
    public.has_team_role(public.finance_entry_team_id(entry_id), '{coach,treasurer}')
    or exists (
      select 1 from public.player_guardian g
      where g.player_id = finance_share.player_id and g.user_id = (select auth.uid())
    )
  );
create policy "coaches and treasurers add shares" on public.finance_share
  for insert to authenticated
  with check (public.has_team_role(public.finance_entry_team_id(entry_id), '{coach,treasurer}'));
create policy "coaches and treasurers delete shares" on public.finance_share
  for delete to authenticated
  using (public.has_team_role(public.finance_entry_team_id(entry_id), '{coach,treasurer}'));

-- Save an entry and its shares together (all or nothing). Runs as the caller, so the
-- policies above decide who may do it.
create function public.save_finance_entry(p_entry jsonb, p_shares jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := (p_entry ->> 'id')::uuid;
  v_type text := p_entry ->> 'type';
  v_amount integer := (p_entry ->> 'amount_cents')::integer;
  v_team uuid;
  v_count integer := jsonb_array_length(p_shares);
  v_sum integer;
begin
  insert into public.finance_entry (
    id, season_id, type, title, amount_cents, entry_date, category, payee, method, refund,
    estimate, due_dates, note
  ) values (
    v_id,
    (p_entry ->> 'season_id')::uuid,
    v_type,
    p_entry ->> 'title',
    v_amount,
    (p_entry ->> 'entry_date')::date,
    p_entry ->> 'category',
    p_entry ->> 'payee',
    p_entry ->> 'method',
    coalesce((p_entry ->> 'refund')::boolean, false),
    coalesce((p_entry ->> 'estimate')::boolean, false),
    coalesce(
      (select array_agg(d::date) from jsonb_array_elements_text(p_entry -> 'due_dates') d),
      '{}'
    ),
    p_entry ->> 'note'
  )
  on conflict (id) do update set
    season_id = excluded.season_id, type = excluded.type, title = excluded.title,
    amount_cents = excluded.amount_cents, entry_date = excluded.entry_date,
    category = excluded.category, payee = excluded.payee, method = excluded.method,
    refund = excluded.refund, estimate = excluded.estimate, due_dates = excluded.due_dates,
    note = excluded.note;

  -- Shares must fit the type and add up to the amount.
  select coalesce(sum((s ->> 'amount_cents')::integer), 0) into v_sum
  from jsonb_array_elements(p_shares) s;
  if v_type in ('walkoff', 'grand_slam') and v_count <> 0 then
    raise exception 'A % is not tagged to players', v_type using errcode = 'check_violation';
  elsif v_type in ('cleanup', 'safe_at_home', 'rain_check') and v_count <> 1 then
    raise exception 'A % is tagged to exactly one player', v_type using errcode = 'check_violation';
  elsif v_type = 'bat_around' and v_count = 0 then
    raise exception 'A Bat Around needs at least one player' using errcode = 'check_violation';
  elsif v_count > 0 and v_sum <> v_amount then
    raise exception 'Shares add up to %, not %', v_sum, v_amount using errcode = 'check_violation';
  end if;

  v_team := public.finance_entry_team_id(v_id);
  if exists (
    select 1 from jsonb_array_elements(p_shares) s
    left join public.player p on p.id = (s ->> 'player_id')::uuid
    where p.team_id is distinct from v_team
  ) then
    raise exception 'Shares must be for players on this team' using errcode = 'check_violation';
  end if;

  delete from public.finance_share where entry_id = v_id;
  insert into public.finance_share (entry_id, player_id, amount_cents)
  select v_id, (s ->> 'player_id')::uuid, (s ->> 'amount_cents')::integer
  from jsonb_array_elements(p_shares) s;
end;
$$;
revoke execute on function public.save_finance_entry(jsonb, jsonb) from public, anon;
grant execute on function public.save_finance_entry(jsonb, jsonb) to authenticated;

-- Team totals for everyone on the team (no family details). Same math as teamSummary()
-- in src/lib/finance/ledger.ts.
create function public.finance_summary(p_season_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r jsonb;
begin
  if not public.is_team_member(public.season_team_id(p_season_id)) then
    raise exception 'Not on this team' using errcode = 'insufficient_privilege';
  end if;
  with t as (
    select
      coalesce(sum(amount_cents) filter (where type = 'bat_around'), 0) as bat_around,
      coalesce(sum(amount_cents) filter (where type = 'cleanup'), 0) as cleanup,
      coalesce(sum(amount_cents) filter (where type = 'grand_slam' and not estimate), 0) as grand_slam,
      coalesce(sum(amount_cents) filter (where type = 'rain_check'), 0) as rain_check,
      coalesce(sum(amount_cents) filter (where type = 'walkoff' and not estimate), 0) as walkoff,
      coalesce(sum(amount_cents) filter (where type = 'safe_at_home' and not refund), 0)
        - coalesce(sum(amount_cents) filter (where type = 'safe_at_home' and refund), 0) as collected,
      coalesce(sum(amount_cents) filter (where type = 'walkoff' and estimate), 0) as planned_out,
      coalesce(sum(amount_cents) filter (where type = 'grand_slam' and estimate), 0) as expected_in
    from public.finance_entry where season_id = p_season_id
  )
  select jsonb_build_object(
    'batAroundCents', bat_around,
    'cleanupCents', cleanup,
    'grandSlamCents', grand_slam,
    'totalInCents', bat_around + cleanup + grand_slam,
    'rainCheckCents', rain_check,
    'walkoffCents', walkoff,
    'totalOutCents', rain_check + walkoff,
    'leftOverCents', bat_around + cleanup + grand_slam - rain_check - walkoff,
    'billedCents', bat_around + cleanup - rain_check,
    'collectedCents', collected,
    'cashOnHandCents', collected + grand_slam - walkoff,
    'plannedOutCents', planned_out,
    'expectedInCents', expected_in
  ) into r from t;
  return r;
end;
$$;
revoke execute on function public.finance_summary(uuid) from public, anon;
grant execute on function public.finance_summary(uuid) to authenticated;
