-- The admin panel's Plan tab: the marketing plan (docs/marketing/marketing-plan.md) and the
-- Road to $1M as a to-do list to check off, and a scoreboard of their targets filled in from
-- the live data. Fungo's admins only (app_admin), like the rest of the panel.

create table public.admin_task (
  id uuid primary key default gen_random_uuid(),
  section text not null check (section in ('foundation', 'weekly', 'parents', 'growth', 'decision', 'mine')),
  title text not null check (char_length(btrim(title)) between 1 and 300),
  detail text check (char_length(detail) <= 2000),
  due_week date,
  status text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  notes text check (char_length(notes) <= 2000),
  done_at timestamptz,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);
create index admin_task_section_idx on public.admin_task (section, sort);
alter table public.admin_task enable row level security;
create policy "admins manage the plan" on public.admin_task
  for all to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

-- Done items keep the date they were done.
create function public.admin_task_done_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then
    new.done_at := coalesce(new.done_at, now());
  elsif new.status <> 'done' then
    new.done_at := null;
  end if;
  return new;
end;
$$;
create trigger admin_task_done
  before insert or update on public.admin_task
  for each row execute function public.admin_task_done_at();

-- ── the plan as of Nov 23, 2026 ──
insert into public.admin_task (section, sort, title, detail, due_week, status, notes, done_at) values
  -- Foundation (marketing plan §3)
  ('foundation', 10, 'Website analytics', 'Visitors, pages, where they came from.', null, 'done', 'Vercel Web Analytics, not PostHog (Nov 23).', '2026-11-23'),
  ('foundation', 20, 'Funnel numbers: trials, first lineups, purchases', 'Marketing plan §7.', null, 'done', 'The admin panel''s scoreboard counts these from the database.', '2026-11-23'),
  ('foundation', 30, 'UTM tags on every link we post', '?utm_source=facebook&utm_medium=group&utm_campaign=spring-pricing. Keep a sheet of campaigns.', null, 'todo', null, null),
  ('foundation', 40, '"How did you hear about us?" in team setup', 'One tap: Facebook group, another coach, saw it at a game, club, search, other. App build.', null, 'todo', null, null),
  ('foundation', 50, 'Grab the social handles', '@fungo.team / @fungoapp / @fungobaseball, the same everywhere: Instagram, TikTok, Facebook page, YouTube, X, Threads.', '2026-11-23', 'todo', null, null),
  ('foundation', 60, 'Social bio, profile picture and banner', 'Bio in marketing plan §3; the color F and ball; navy banner with the demo phone shot.', '2026-11-30', 'todo', null, null),
  ('foundation', 70, 'Ask the Nov 20 demo director for a quote', 'Permission to use name, title and club, or "Club director, Louisiana".', '2026-11-23', 'todo', null, null),
  ('foundation', 80, 'Ask 3 Traction Canes coaches for one sentence each', 'What Fungo saved them. Script: Email A5.', '2026-11-30', 'todo', null, null),
  ('foundation', 90, 'Screen-record 10 clips from the demo club', 'Auto-fill, schedule photo to games, "What time do we play tomorrow?", a walk-up song, a Pine Tar reel.', '2026-11-30', 'todo', null, null),
  ('foundation', 100, 'Put quotes on the home page and /clubs', 'As soon as they''re in.', '2026-12-14', 'todo', null, null),
  ('foundation', 110, 'Set up Loops for the trial emails', 'Free to 1,000 contacts. Unsubscribe link and mailing address on every marketing email.', '2026-12-07', 'todo', null, null),
  ('foundation', 120, 'Meta Pixel and Google Ads tags', 'Signed-out site pages only, never in the app. Update the privacy policy first.', null, 'todo', 'Only once ads start (after Fungo makes money).', null),
  -- Week by week (marketing plan §8)
  ('weekly', 10, 'Get the comedian intro going through your wife', 'Have the demo club link, 3 demo clips and a personal code ready (§6.8).', '2026-11-23', 'todo', null, null),
  ('weekly', 20, 'Send B3: Black Friday Player pass email', 'To parents on teams with box scores.', '2026-11-23', 'todo', null, null),
  ('weekly', 30, 'Send A1 (what''s new) to coaches', null, '2026-11-30', 'todo', null, null),
  ('weekly', 40, 'Send B1 (notifications) to parents', null, '2026-11-30', 'todo', null, null),
  ('weekly', 50, 'Send A2 (invite families) and B2 (Player pass)', null, '2026-12-07', 'todo', null, null),
  ('weekly', 60, 'Write the trial email sequence (C)', null, '2026-12-07', 'todo', null, null),
  ('weekly', 70, 'Join 20 Facebook groups and start answering', 'Rule of 10: answer 10 questions for every post about Fungo (§6.1).', '2026-12-07', 'todo', null, null),
  ('weekly', 80, 'Start posting: 3 a week plus Stories', 'Posts 1–12 in §5.', '2026-12-14', 'todo', null, null),
  ('weekly', 90, 'Book a facility for the January coach clinic', '"Run your season in 2 hours a week" (§6.2).', '2026-12-14', 'todo', null, null),
  ('weekly', 100, 'Holiday post; schedule the Jan 1 spring pricing posts and email', null, '2026-12-21', 'todo', null, null),
  ('weekly', 110, 'Draft the press kit and local press pitch', '§6.6: the fair-play angle is the story.', '2026-12-21', 'todo', null, null),
  ('weekly', 120, 'Order dugout cards', '500 for about $60, with a QR code (§6.2).', '2026-12-21', 'todo', null, null),
  ('weekly', 130, 'Turn on the trial email sequence', null, '2026-12-28', 'todo', null, null),
  ('weekly', 140, 'Line up 5 club director intros from coaches', 'A4 goes out Jan 13.', '2026-12-28', 'todo', null, null),
  ('weekly', 150, 'Pick the first free search tool to build', 'Printable lineup card, then the pitch count calculator, then the fair lineup generator (§6.3).', '2026-12-28', 'todo', null, null),
  -- Getting parents to 40% (Road to $1M)
  ('parents', 10, 'Tell parents when the box score is in', '"Mason went 2 for 3 today. See his season."', null, 'done', 'Box score notices shipped Nov 23.', '2026-11-23'),
  ('parents', 20, 'Lead the Player pass pitch with pitch-count safety', '"Is my kid safe to pitch tomorrow?" is a reason to buy.', null, 'todo', null, null),
  ('parents', 30, 'A short link in the Pine Tar outro', 'Every shared reel points back to Fungo. App build.', null, 'todo', null, null),
  ('parents', 40, 'Let grandparents gift a Player pass', 'App build.', null, 'todo', null, null),
  ('parents', 50, 'A club share of Player passes', 'Clubs get 20% of the passes their families buy, so directors promote it.', null, 'todo', null, null),
  ('parents', 60, 'The roster nudge', 'Remind families once at the start of each season and once at the first tournament.', null, 'todo', null, null),
  -- Growth (marketing plan §6 and the Road to $1M)
  ('growth', 10, 'Demo club anyone can try', null, null, 'done', 'Shipped Nov 2026.', '2026-11-22'),
  ('growth', 20, 'Ask Fungo on the website', null, null, 'done', 'Shipped Nov 2026.', '2026-11-23'),
  ('growth', 30, 'Shared tournament links for other teams', null, null, 'done', 'Shipped Nov 23; opens and trial taps are on the Numbers tab.', '2026-11-23'),
  ('growth', 40, 'Referral program', 'Coach to coach, coach to club, parent to coach (§6.4). Build before Opening Day.', null, 'todo', null, null),
  ('growth', 50, 'Free search tools on fungo.team', 'Printable lineup card, pitch count calculator, fair lineup generator (§6.3).', null, 'todo', null, null),
  ('growth', 60, 'Instructor and facility partnerships', 'Free Player pass and a code for instructors'' students; dugout cards at the front desk (§6.5).', null, 'todo', null, null),
  ('growth', 70, 'Sponsor one local tournament a month in spring', '$250–$750: fence banner, QR on the schedule handout (§6.2).', null, 'todo', null, null),
  ('growth', 80, 'Count the US 7U–14U travel and select market', 'Perfect Game, USSSA and similar registrations, before the $1M plan goes in a pitch.', null, 'todo', null, null),
  ('growth', 90, 'Check AI cost per paid team each month', 'Lower the club-code AI budget to about $30 if heavy teams get close to $60.', null, 'todo', 'The scoreboard shows it.', null),
  -- Decisions (marketing plan §9)
  ('decision', 10, 'Analytics', null, null, 'done', 'Vercel Web Analytics; no ad tags until ads start.', '2026-11-23'),
  ('decision', 20, 'Ad budget', null, null, 'done', 'No paid ads until Fungo makes money; then up to 25% of last month''s profit.', '2026-11-23'),
  ('decision', 30, 'Hashtags: #travelball / #travelbaseball in hashtags only?', 'Recommend yes.', null, 'todo', null, null),
  ('decision', 40, 'Referral reward', '50% off next season per paid referral, or a free season after 3? Recommend the free season.', null, 'todo', null, null),
  ('decision', 50, 'Who posts on social', 'Craig, or a part-time social person (~$500–800/month) once the pillars work.', null, 'todo', null, null),
  ('decision', 60, 'Launch area for January', 'Which metro for PR and the clinic.', null, 'todo', null, null),
  ('decision', 70, 'The comedian partnership', 'What to offer (revenue-share code, free Fungo, advisor) and when the intro happens.', null, 'todo', null, null);

/*
 * The scoreboard: the Road to $1M and marketing plan targets, measured from the live data.
 * Demo clubs, their teams and guests are left out. Money in cents.
 */
create function public.admin_scoreboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_season_start date := make_date(
    extract(year from current_date)::integer - case when extract(month from current_date) >= 8 then 0 else 1 end,
    8, 1);
  v_plan_start date := '2026-11-23';
  v_out jsonb;
begin
  if not public.is_app_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  with real_team as (
    select t.*, public.admin_plan_kind(t.id) as plan from public.team t
    left join public.organization o on o.id = t.organization_id
    where o.demo_until is null
  ),
  real_purchase as (
    select p.* from public.purchase p
    where not exists (select 1 from public.organization o where o.id = p.organization_id and o.demo_until is not null)
  ),
  trial_team as (
    select t.id, t.created_at from real_team t
    where t.free_kind = 'trial' and t.created_at >= v_plan_start
  ),
  first_lineup as (
    select s.team_id, min(l.created_at) as at from public.lineup l
    join public.game g on g.id = l.game_id join public.season s on s.id = g.season_id
    group by s.team_id
  ),
  first_paid as (
    select team_id, min(at) as at from (
      select tp.team_id, tp.created_at as at from public.team_pass tp
      union all
      select c.team_id, c.redeemed_at from public.club_code c where c.team_id is not null
    ) x group by team_id
  ),
  parent_user as (
    select distinct m.user_id from public.member m join real_team t on t.id = m.team_id where m.role = 'parent'
  ),
  pass_buyer as (
    select distinct f.buyer from public.family_pass f where f.expires_on >= current_date and f.buyer is not null
  ),
  paying as (
    select * from real_team where plan in ('club', 'pass', 'grace')
  )
  select jsonb_build_object(
    'season_start', v_season_start,
    'plan_start', v_plan_start,
    'revenue_season', (select coalesce(sum(amount_cents), 0) from real_purchase where created_at >= v_season_start),
    'clubs_paying', (select count(distinct c.organization_id) from public.club_code c
      join public.organization o on o.id = c.organization_id
      where o.demo_until is null and c.expires_on >= current_date),
    'club_teams', (select count(*) from real_team where plan = 'club'),
    'independent_teams', (select count(*) from real_team where plan in ('pass', 'grace')),
    'pass_families', (select count(*) from pass_buyer),
    'pass_kids', (select coalesce(sum(kids), 0) from public.family_pass where expires_on >= current_date),
    'parent_accounts', (select count(*) from parent_user),
    'parents_with_pass', (select count(*) from parent_user p join pass_buyer b on b.buyer = p.user_id),
    'ai_cents_paid_season', (select coalesce(sum(coalesce(a.cost_cents, a.estimate_cents)), 0)
      from public.ai_usage a join paying t on t.id = a.team_id
      where not a.released and a.created_at >= v_season_start),
    'paying_teams', (select count(*) from paying),
    'trials', (select count(*) from trial_team),
    'trials_7_days_old', (select count(*) from trial_team where created_at <= now() - interval '7 days'),
    'trials_lineup_7', (select count(*) from trial_team t join first_lineup f on f.team_id = t.id
      where t.created_at <= now() - interval '7 days' and f.at <= t.created_at + interval '7 days'),
    'trials_30_days_old', (select count(*) from trial_team where created_at <= now() - interval '30 days'),
    'trials_paid_30', (select count(*) from trial_team t join first_paid f on f.team_id = t.id
      where t.created_at <= now() - interval '30 days' and f.at <= t.created_at + interval '30 days'),
    'teams_with_players', (select count(*) from real_team t where exists (select 1 from public.player p where p.team_id = t.id)),
    'parent_links', (select count(*) from public.member m join real_team t on t.id = m.team_id
      where m.role = 'parent' and exists (select 1 from public.player p where p.team_id = t.id)),
    'renewed', (select count(*) from paying t where
      exists (select 1 from public.team_pass tp where tp.team_id = t.id and tp.expires_on > make_date(extract(year from v_season_start)::integer + 1, 7, 31))
      or exists (select 1 from public.club_code c where c.team_id = t.id and c.expires_on > make_date(extract(year from v_season_start)::integer + 1, 7, 31)))
  ) into v_out;
  return v_out;
end;
$$;
revoke execute on function public.admin_scoreboard() from public, anon;
grant execute on function public.admin_scoreboard() to authenticated;
