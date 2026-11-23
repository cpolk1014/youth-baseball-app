-- The admin panel (fungo.team/admin): how the business is doing, for Fungo's own people only.
-- Who's an admin is a list in the database (app_admin), added in the SQL Editor:
--   insert into public.app_admin (user_id) select id from auth.users where email = '<email>';
-- Everything the panel shows comes from admin_overview(), which refuses anyone not on the list.
-- Demo clubs (deleted after two days) and shared tournament links (opened by people without
-- accounts) leave no rows behind, so two small counters keep daily totals: site_count.

create table public.app_admin (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.app_admin enable row level security;
-- No policies: read only through the functions below.

create function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.app_admin where user_id = (select auth.uid()));
$$;
revoke execute on function public.is_app_admin() from public, anon;
grant execute on function public.is_app_admin() to authenticated;

-- ── daily counters: demo clubs started, shared tournament opens and trial taps ──
create table public.site_count (
  day date not null,
  kind text not null check (kind in ('demo_start', 'share_open', 'share_trial')),
  ref text not null default '' check (char_length(ref) <= 64),
  n integer not null default 0,
  primary key (day, kind, ref)
);
alter table public.site_count enable row level security;

create function public.bump_site_count(p_kind text, p_ref text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.site_count (day, kind, ref, n)
  values ((now() at time zone 'America/Chicago')::date, p_kind, coalesce(p_ref, ''), 1)
  on conflict (day, kind, ref) do update set n = public.site_count.n + 1;
$$;
revoke execute on function public.bump_site_count(text, text) from public, anon, authenticated;

/* A visitor opened a shared tournament, or tapped its trial button. Only real shared ones count. */
create function public.count_share_event(p_tournament uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_kind not in ('share_open', 'share_trial') then
    return;
  end if;
  if exists (select 1 from public.tournament where id = p_tournament and share_token is not null) then
    perform public.bump_site_count(p_kind, p_tournament::text);
  end if;
end;
$$;
revoke execute on function public.count_share_event(uuid, text) from public;
grant execute on function public.count_share_event(uuid, text) to anon, authenticated;

/* Each demo club counts the day it's built. */
create function public.count_demo_start()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.demo_until is not null then
    perform public.bump_site_count('demo_start', '');
  end if;
  return new;
end;
$$;
create trigger organization_count_demo
  after insert on public.organization
  for each row execute function public.count_demo_start();

-- ── a team's plan, for the panel (team_plan answers only a team's own members) ──
create function public.admin_plan_kind(p_team uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_free date;
  v_free_kind text;
  v_end date;
begin
  select free_until, free_kind into v_free, v_free_kind from public.team where id = p_team;
  select greatest(
    (select max(expires_on) from public.team_pass where team_id = p_team),
    (select max(expires_on) from public.club_code where team_id = p_team)) into v_end;
  if v_end is not null and v_end >= current_date then
    return case when exists (select 1 from public.club_code where team_id = p_team and expires_on = v_end)
      then 'club' else 'pass' end;
  elsif v_free >= current_date then
    return coalesce(v_free_kind, 'trial');
  elsif v_end is not null and v_end + public.paid_grace_days() >= current_date then
    return 'grace';
  end if;
  return 'none';
end;
$$;
revoke execute on function public.admin_plan_kind(uuid) from public, anon, authenticated;

/*
 * Everything the admin panel shows, in one answer. Demo clubs, their teams and guest accounts
 * are left out of the business numbers. Money is in cents; AI cost in cents.
 */
create function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'America/Chicago')::date;
  v_season_start date := make_date(
    extract(year from current_date)::integer - case when extract(month from current_date) >= 8 then 0 else 1 end,
    8, 1);
  v_out jsonb;
begin
  if not public.is_app_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  with real_team as (
    select t.* from public.team t
    left join public.organization o on o.id = t.organization_id
    where o.demo_until is null
  ),
  real_user as (
    select u.* from auth.users u where not coalesce(u.is_anonymous, false)
  ),
  team_row as (
    select t.id, t.name, t.age_group, t.created_at, t.free_until,
      public.admin_plan_kind(t.id) as plan,
      (select o.name from public.organization o where o.id = t.organization_id) as club,
      (select u.email from auth.users u where u.id = t.created_by) as owner_email,
      (select count(*) from public.player p where p.team_id = t.id and p.active) as players,
      (select count(*) from public.game g join public.season s on s.id = g.season_id where s.team_id = t.id) as games,
      (select count(*) from public.lineup l join public.game g on g.id = l.game_id
        join public.season s on s.id = g.season_id where s.team_id = t.id) as lineups,
      (select count(distinct m.user_id) from public.member m where m.team_id = t.id) as people,
      (select count(distinct m.user_id) from public.member m where m.team_id = t.id and m.role = 'parent') as parents,
      greatest(
        (select max(l.created_at) from public.lineup l join public.game g on g.id = l.game_id
          join public.season s on s.id = g.season_id where s.team_id = t.id),
        (select max(c.created_at) from public.chatter_post c where c.team_id = t.id)) as last_active
    from real_team t
  ),
  real_purchase as (
    select p.* from public.purchase p
    where not exists (select 1 from public.organization o where o.id = p.organization_id and o.demo_until is not null)
  )
  select jsonb_build_object(
    'generated_at', now(),
    'season_start', v_season_start,
    'users', jsonb_build_object(
      'total', (select count(*) from real_user),
      'new_7', (select count(*) from real_user where created_at >= now() - interval '7 days'),
      'new_30', (select count(*) from real_user where created_at >= now() - interval '30 days'),
      'active_7', (select count(*) from real_user where last_sign_in_at >= now() - interval '7 days'),
      'parents', (select count(distinct m.user_id) from public.member m join real_team t on t.id = m.team_id where m.role = 'parent'),
      'coaches', (select count(distinct m.user_id) from public.member m join real_team t on t.id = m.team_id where m.role in ('owner', 'coach', 'manager'))),
    'teams', jsonb_build_object(
      'total', (select count(*) from team_row),
      'new_7', (select count(*) from team_row where created_at >= now() - interval '7 days'),
      'new_30', (select count(*) from team_row where created_at >= now() - interval '30 days'),
      'active_14', (select count(*) from team_row where last_active >= now() - interval '14 days'),
      'by_plan', coalesce((select jsonb_object_agg(plan, n) from
        (select plan, count(*) as n from team_row group by plan) x), '{}'::jsonb)),
    'clubs', jsonb_build_object(
      'total', (select count(*) from public.organization where demo_until is null),
      'codes_sold', (select count(*) from public.club_code c join public.organization o on o.id = c.organization_id
        where o.demo_until is null and c.expires_on >= current_date),
      'codes_used', (select count(*) from public.club_code c join public.organization o on o.id = c.organization_id
        where o.demo_until is null and c.expires_on >= current_date and c.team_id is not null)),
    'revenue', jsonb_build_object(
      'season', coalesce((select jsonb_object_agg(kind, cents) from
        (select kind, sum(amount_cents) as cents from real_purchase where created_at >= v_season_start group by kind) x), '{}'::jsonb),
      'last_30', (select coalesce(sum(amount_cents), 0) from real_purchase where created_at >= now() - interval '30 days'),
      'all_time', (select coalesce(sum(amount_cents), 0) from real_purchase),
      'player_passes', (select count(*) from public.family_pass where expires_on >= current_date),
      'player_pass_kids', (select coalesce(sum(kids), 0) from public.family_pass where expires_on >= current_date)),
    'ai', jsonb_build_object(
      'cents_30', (select coalesce(sum(coalesce(cost_cents, estimate_cents)), 0) from public.ai_usage
        where not released and created_at >= now() - interval '30 days'),
      'cents_season', (select coalesce(sum(coalesce(cost_cents, estimate_cents)), 0) from public.ai_usage
        where not released and created_at >= v_season_start),
      'by_kind_30', coalesce((select jsonb_agg(x order by x.cents desc) from
        (select kind, count(*) as calls, round(sum(coalesce(cost_cents, estimate_cents)), 1) as cents
         from public.ai_usage where not released and created_at >= now() - interval '30 days' group by kind) x), '[]'::jsonb),
      'top_teams_30', coalesce((select jsonb_agg(x order by x.cents desc) from
        (select t.name, round(sum(coalesce(a.cost_cents, a.estimate_cents)), 1) as cents
         from public.ai_usage a join real_team t on t.id = a.team_id
         where not a.released and a.created_at >= now() - interval '30 days'
         group by t.name order by 2 desc limit 5) x), '[]'::jsonb)),
    'ask', jsonb_build_object(
      'questions_7', (select count(*) from public.ask_question where asked_at >= now() - interval '7 days'),
      'questions_30', (select count(*) from public.ask_question where asked_at >= now() - interval '30 days'),
      'cents_30', (select coalesce(sum(cents), 0) from public.ask_day where day >= v_today - 30),
      'recent', coalesce((select jsonb_agg(x order by x.asked_at desc) from
        (select asked_at, question, outcome, page from public.ask_question
         order by asked_at desc limit 30) x), '[]'::jsonb)),
    'demo', jsonb_build_object(
      'starts_7', (select coalesce(sum(n), 0) from public.site_count where kind = 'demo_start' and day > v_today - 7),
      'starts_30', (select coalesce(sum(n), 0) from public.site_count where kind = 'demo_start' and day > v_today - 30),
      'live', (select count(*) from public.organization where demo_until > now())),
    'shares', jsonb_build_object(
      'live', (select count(*) from public.tournament t join real_team r on r.id = t.team_id where t.share_token is not null),
      'opens_30', (select coalesce(sum(n), 0) from public.site_count where kind = 'share_open' and day > v_today - 30),
      'trial_taps_30', (select coalesce(sum(n), 0) from public.site_count where kind = 'share_trial' and day > v_today - 30),
      'top', coalesce((select jsonb_agg(x order by x.opens desc) from
        (select tr.name as tournament, r.name as team,
           coalesce(sum(c.n) filter (where c.kind = 'share_open'), 0) as opens,
           coalesce(sum(c.n) filter (where c.kind = 'share_trial'), 0) as trial_taps
         from public.tournament tr join real_team r on r.id = tr.team_id
         left join public.site_count c on c.ref = tr.id::text and c.day > v_today - 30
         where tr.share_token is not null
         group by tr.name, r.name order by 3 desc limit 10) x), '[]'::jsonb)),
    'daily', coalesce((select jsonb_agg(x order by x.day) from
      (select d::date as day,
         (select count(*) from real_user u where (u.created_at at time zone 'America/Chicago')::date = d::date) as users,
         (select count(*) from team_row t where (t.created_at at time zone 'America/Chicago')::date = d::date) as teams,
         (select coalesce(sum(amount_cents), 0) from real_purchase p where (p.created_at at time zone 'America/Chicago')::date = d::date) as cents
       from generate_series(v_today - 29, v_today, interval '1 day') d) x), '[]'::jsonb),
    'recent_teams', coalesce((select jsonb_agg(x order by x.created_at desc) from
      (select * from team_row order by created_at desc limit 40) x), '[]'::jsonb),
    'recent_purchases', coalesce((select jsonb_agg(x order by x.created_at desc) from
      (select p.created_at, p.kind, p.amount_cents, p.quantity, p.season_label,
         coalesce((select t.name from public.team t where t.id = p.team_id),
                  (select o.name from public.organization o where o.id = p.organization_id)) as what,
         (select u.email from auth.users u where u.id = p.buyer) as buyer_email
       from real_purchase p order by p.created_at desc limit 25) x), '[]'::jsonb)
  ) into v_out;
  return v_out;
end;
$$;
revoke execute on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;
