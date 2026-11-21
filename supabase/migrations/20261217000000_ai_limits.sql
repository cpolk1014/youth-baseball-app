-- AI limits (security review H4, M4): one free trial per person, daily and monthly caps on
-- every AI feature, and a season AI budget per team, all counted in one ledger.
--
-- The server reserves a call before it runs (ai_reserve, as the person; it takes a lock so
-- parallel requests can't slip past a cap), then records what it really cost (ai_settle) or
-- gives the reservation back if it failed (ai_release); those two are service-role only, so
-- nobody can rewrite their own usage.

-- ── One free trial per person ──

create table public.team_trial (
  user_id uuid primary key references auth.users (id) on delete cascade,
  team_id uuid,          -- no foreign key: deleting the team doesn't give the trial back
  started_on date not null default current_date
);
alter table public.team_trial enable row level security;
create policy team_trial_read_own on public.team_trial for select to authenticated
  using (user_id = (select auth.uid()));

-- Everyone who already started a trial team has used theirs.
insert into public.team_trial (user_id, team_id, started_on)
select distinct on (t.created_by) t.created_by, t.id, (t.free_until - 14)
from public.team t
where t.free_kind = 'trial' and t.created_by is not null
order by t.created_by, t.free_until
on conflict do nothing;

-- Claims the trial for a new team; false when this person already used theirs.
create function public.claim_team_trial(p_team uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.team_trial (user_id, team_id) values ((select auth.uid()), p_team)
  on conflict (user_id) do nothing;
  return found;
end;
$$;
revoke execute on function public.claim_team_trial(uuid) from public, anon;
grant execute on function public.claim_team_trial(uuid) to authenticated;

create or replace function public.lock_team_billing_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Security-definer functions run as their owner, and the service role isn't a browser user.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    -- Your first team gets the 14-day trial; later teams start on the free plan.
    new.free_until := case when public.claim_team_trial(new.id)
      then current_date + 14 else current_date - 1 end;
    new.free_kind := 'trial';
    new.organization_id := null;
    return new;
  end if;
  if new.free_until is distinct from old.free_until
    or new.free_kind is distinct from old.free_kind
    or new.created_by is distinct from old.created_by
    or new.organization_id is distinct from old.organization_id then
    raise exception 'A team''s plan and club can''t be changed here.' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Whether the signed-in person can still start a team with a free trial.
create function public.my_trial_left()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from public.team_trial where user_id = (select auth.uid()));
$$;
revoke execute on function public.my_trial_left() from public, anon;
grant execute on function public.my_trial_left() to authenticated;

-- ── The ledger ──

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.team (id) on delete cascade,
  organization_id uuid references public.organization (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  kind text not null,
  -- What it was expected to cost when reserved, then what it really cost (cents).
  estimate_cents numeric(10, 3) not null,
  cost_cents numeric(10, 3),
  released boolean not null default false,
  created_at timestamptz not null default now(),
  check (team_id is not null or organization_id is not null)
);
create index ai_usage_team_idx on public.ai_usage (team_id, created_at desc);
create index ai_usage_org_idx on public.ai_usage (organization_id, created_at desc);
create index ai_usage_user_idx on public.ai_usage (user_id, created_at desc);
alter table public.ai_usage enable row level security;
-- No policies: nobody reads or writes it directly; the functions below do.

-- The caps for each kind of AI call. Daily counts look back 24 hours and monthly 30 days.
-- budget: whether it counts against the team's season AI budget (Player pass highlights
-- don't; families pay for those).
create function public.ai_cap(p_kind text)
returns table (
  label text, team_day int, team_month int, person_day int, staff_day int,
  estimate_cents numeric, budget boolean
)
language sql
immutable
set search_path = ''
as $$
  select c.label, c.team_day, c.team_month, c.person_day, c.staff_day, c.estimate_cents, c.budget
  from (values
    ('roster',          'roster imports',         5,   15, null::int, null::int, 6.0,  true),
    ('schedule',        'schedule imports',       10,  30, null,      null,      10.0, true),
    ('boxscore',        'box score reads',        8,   60, null,      null,      9.0,  true),
    ('uniform',         'flyer reads',            5,   15, null,      null,      4.0,  true),
    ('tournament',      'tournament reads',       25, 150, null,      null,      28.0, true),
    ('tournament_scores','score updates',         25, 150, 5,         5,         17.0, true),
    ('rules',           'typed rules',            20, 100, null,      null,      3.0,  true),
    ('practice',        'AI practice plans',      3,   12, null,      null,      70.0, true),
    ('lyrics',          'lyric ideas',            40, null, 10,       10,        2.0,  true),
    ('song',            'walk-up songs',          30, 150, 5,         15,        5.0,  true),
    ('announce',        'announcer calls',        60, 200, 10,        30,        2.0,  true),
    ('sound',           'AI sounds',              20,  60, 0,         10,        4.0,  true),
    ('highlight_write', 'highlight calls',        null, null, 10,     10,        1.1,  false),
    ('highlight_voice', 'highlight voices',       null, null, 10,     10,        2.0,  false)
  ) as c(kind, label, team_day, team_month, person_day, staff_day, estimate_cents, budget)
  where c.kind = p_kind;
$$;

-- The season starts August 1 (August through December: this year; January through July: last).
create function public.season_start(p_day date default current_date)
returns date
language sql
immutable
as $$
  select make_date(extract(year from (p_day - interval '7 months'))::int, 8, 1);
$$;

-- A team's season AI budget in cents: $60 for a paid season (a pass bought at the spring
-- price gets the same share of it), $5 for a trial, $30 for a launch team, nothing unpaid.
create function public.team_ai_budget_cents(p_team uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_team public.team;
  v_amount int;
begin
  select * into v_team from public.team where id = p_team;
  if v_team.id is null then
    return 0;
  end if;
  if exists (
    select 1 from public.club_code c
    where c.team_id = p_team and c.expires_on + public.paid_grace_days() >= current_date
  ) then
    return 6000;
  end if;
  if exists (
    select 1 from public.team_pass p
    where p.team_id = p_team and p.expires_on + public.paid_grace_days() >= current_date
  ) then
    select max(amount_cents) into v_amount from public.purchase
    where team_id = p_team and kind = 'team' and created_at >= public.season_start();
    return round(6000 * least(1, coalesce(v_amount, 12900)::numeric / 12900));
  end if;
  if v_team.free_until >= current_date then
    return case when v_team.free_kind = 'launch' then 3000 else 500 end;
  end if;
  return 0;
end;
$$;
revoke execute on function public.team_ai_budget_cents(uuid) from public, anon, authenticated;

-- What a team has used of its season AI budget (team members), in cents.
create function public.team_ai_budget(p_team uuid)
returns table (used_cents numeric, budget_cents numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((
      select sum(coalesce(u.cost_cents, u.estimate_cents)) from public.ai_usage u
      where u.team_id = p_team and not u.released and u.created_at >= public.season_start()
        and (select c.budget from public.ai_cap(u.kind) c)
    ), 0),
    public.team_ai_budget_cents(p_team)
  where public.is_team_member(p_team);
$$;
revoke execute on function public.team_ai_budget(uuid) from public, anon;
grant execute on function public.team_ai_budget(uuid) to authenticated;

-- Reserve one AI call for a team (p_team) or a club (p_club, the flyer reader). Checks the
-- person's and the team's daily and monthly caps and the season budget, under a lock, then
-- records the reservation. Errors: P0429 (a cap), P0430 (the season budget).
create function public.ai_reserve(p_team uuid, p_club uuid, p_kind text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_cap record;
  v_staff boolean := false;
  v_mine int;
  v_limit int;
  v_count int;
  v_used numeric;
  v_budget numeric;
  v_id uuid;
begin
  select * into v_cap from public.ai_cap(p_kind);
  if v_cap.label is null then
    raise exception 'Unknown AI feature.' using errcode = '22023';
  end if;
  if v_me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if p_team is not null then
    if not public.is_team_member(p_team) then
      raise exception 'You''re not on this team.' using errcode = '42501';
    end if;
    v_staff := public.has_team_role(p_team, array['coach', 'manager']::public.member_role[]);
  elsif p_club is null or not public.is_club_admin(p_club) then
    raise exception 'Only club admins do that for the club.' using errcode = '42501';
  else
    v_staff := true;
  end if;

  -- One at a time per team (or club), so parallel requests can't slip past a cap.
  perform pg_advisory_xact_lock(hashtext('ai:' || coalesce(p_team, p_club)::text));

  -- The person's own daily cap.
  v_limit := case when v_staff then v_cap.staff_day else v_cap.person_day end;
  if v_limit is not null then
    select count(*) into v_mine from public.ai_usage
    where user_id = v_me and kind = p_kind and not released
      and created_at > now() - interval '1 day';
    if v_mine >= v_limit then
      raise exception 'You''ve reached today''s limit of % % (% a day). Try again tomorrow.',
        v_limit, v_cap.label, v_limit using errcode = 'P0429';
    end if;
  end if;

  -- The team's (or club's) caps. Tournament reads and score updates share one count.
  if v_cap.team_day is not null then
    select count(*) into v_count from public.ai_usage
    where (team_id = p_team or (p_team is null and organization_id = p_club))
      and not released and created_at > now() - interval '1 day'
      and (kind = p_kind or (p_kind like 'tournament%' and kind like 'tournament%'));
    if v_count >= v_cap.team_day then
      raise exception 'Your team has reached today''s limit of % (% a day). Try again tomorrow.',
        v_cap.label, v_cap.team_day using errcode = 'P0429';
    end if;
  end if;
  if v_cap.team_month is not null then
    select count(*) into v_count from public.ai_usage
    where (team_id = p_team or (p_team is null and organization_id = p_club))
      and not released and created_at > now() - interval '30 days'
      and (kind = p_kind or (p_kind like 'tournament%' and kind like 'tournament%'));
    if v_count >= v_cap.team_month then
      raise exception 'Your team has reached this month''s limit of % (% in 30 days). Try again in a few days.',
        v_cap.label, v_cap.team_month using errcode = 'P0429';
    end if;
  end if;

  -- The team's season AI budget.
  if p_team is not null and v_cap.budget then
    select b.used_cents, b.budget_cents into v_used, v_budget from public.team_ai_budget(p_team) b;
    if v_used + v_cap.estimate_cents > v_budget then
      raise exception 'Your team has used this season''s AI help. It comes back when the team renews, or ask a coach to contact Fungo for more.'
        using errcode = 'P0430';
    end if;
  end if;

  insert into public.ai_usage (team_id, organization_id, user_id, kind, estimate_cents)
  values (p_team, case when p_team is null then p_club end, v_me, p_kind, v_cap.estimate_cents)
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.ai_reserve(uuid, uuid, text) from public, anon;
grant execute on function public.ai_reserve(uuid, uuid, text) to authenticated;

-- The server records what a call really cost (cents), or gives back a failed one.
create function public.ai_settle(p_id uuid, p_cost_cents numeric)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.ai_usage set cost_cents = greatest(0, p_cost_cents) where id = p_id;
$$;
create function public.ai_release(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.ai_usage set released = true where id = p_id;
$$;
revoke execute on function public.ai_settle(uuid, numeric) from public, anon, authenticated;
revoke execute on function public.ai_release(uuid) from public, anon, authenticated;
grant execute on function public.ai_settle(uuid, numeric) to service_role;
grant execute on function public.ai_release(uuid) to service_role;

