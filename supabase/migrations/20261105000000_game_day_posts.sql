-- Game day posts: a GroupMe post per game day ("Game against The Cubs / Chabills Field /
-- 7:00 PM / Arrive by 6:00 PM / White combo"), posted automatically by the database on
-- the coach's schedule. Built here (not in the app) so the app's preview is exactly what
-- gets posted.

alter table public.team
  -- Where the team plays, for "the day before at 6 PM" and game times.
  add column timezone text not null default 'America/Chicago'
    check (length(timezone) between 1 and 64),
  -- Arrive this long before the first game; null leaves "Arrive by" out.
  add column arrive_minutes smallint default 60
    check (arrive_minutes is null or arrive_minutes between 0 and 240),
  -- off | hours (game_post_hours before the first game) | days (game_post_days before,
  -- at game_post_time; 0 days = the morning of)
  add column game_post_mode text not null default 'off'
    check (game_post_mode in ('off', 'hours', 'days')),
  add column game_post_hours smallint not null default 3 check (game_post_hours between 1 and 12),
  add column game_post_days smallint not null default 1 check (game_post_days between 0 and 3),
  add column game_post_time time not null default '18:00';

-- A real time zone name, or the save fails.
create function public.check_team_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform now() at time zone new.timezone;
  return new;
exception when others then
  raise exception 'unknown time zone %', new.timezone using errcode = 'check_violation';
end;
$$;

create trigger team_timezone
  before insert or update of timezone on public.team
  for each row execute function public.check_team_timezone();

-- A game's own arrival time, instead of the team's "minutes before".
alter table public.game add column arrive_time time;

-- One post per team per game day (automatic or "Post now").
create table public.game_post_log (
  team_id uuid not null references public.team (id) on delete cascade,
  game_date date not null,
  sent_at timestamptz not null default now(),
  automatic boolean not null default true,
  primary key (team_id, game_date)
);

alter table public.game_post_log enable row level security;

create policy "coaches and managers see game day posts" on public.game_post_log
  for select to authenticated using (public.has_team_role(team_id, '{coach,manager}'));

-- "7:00 PM", or "noon".
create function public.game_post_time_text(p_time time)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_time = '12:00' then 'noon' else to_char(p_time, 'FMHH12:MI AM') end;
$$;

-- "a", "a and b", "a, b and c".
create function public.game_post_and(p_items text[])
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(array_length(p_items, 1), 0) = 0 then ''
    when array_length(p_items, 1) = 1 then p_items[1]
    else array_to_string(p_items[1:array_length(p_items, 1) - 1], ', ')
      || ' and ' || p_items[array_length(p_items, 1)]
  end;
$$;

/*
 * The game day post for a team's scheduled games on a date, or null when there are none.
 * p_same_day: posting on the game day itself (otherwise the day is named, "Saturday game...").
 * Coaches and managers can preview it; the scheduler (no signed-in user) can too.
 */
create function public.game_day_message(p_team_id uuid, p_date date, p_same_day boolean)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t public.team;
  g record;
  n int := 0;
  times text[] := '{}';
  opponents text[] := '{}';
  places text[] := '{}';
  uniforms text[] := '{}';
  per_place text[] := '{}';
  per_uniform text[] := '{}';
  first_time time;
  first_arrive time;
  day_word text := to_char(p_date, 'FMDay');
  lines text[] := '{}';
  head text;
begin
  if auth.uid() is not null and not public.has_team_role(p_team_id, '{coach,manager}') then
    raise exception 'only coaches and managers can preview game day posts'
      using errcode = 'insufficient_privilege';
  end if;
  select * into t from public.team where id = p_team_id;
  if not found then return null; end if;

  for g in
    select gm.start_time, gm.arrive_time, nullif(trim(gm.opponent), '') as opponent,
      nullif(trim(gm.location), '') as location,
      coalesce(
        u.name,
        nullif(concat_ws(' · ',
          (gm.uniform_custom ->> 'shirt') || ' shirt', (gm.uniform_custom ->> 'pants') || ' pants',
          (gm.uniform_custom ->> 'hat') || ' hat', (gm.uniform_custom ->> 'belt') || ' belt',
          (gm.uniform_custom ->> 'socks') || ' socks'), '')
      ) as uniform
    from public.game gm
    join public.season s on s.id = gm.season_id
    left join public.uniform_combo u on u.id = gm.uniform_combo_id
    where s.team_id = p_team_id and gm.game_date = p_date and gm.status = 'scheduled'
    order by gm.start_time nulls last, gm.created_at
  loop
    n := n + 1;
    if n = 1 then
      first_time := g.start_time;
      first_arrive := coalesce(
        g.arrive_time,
        case when g.start_time is not null and t.arrive_minutes is not null
          then g.start_time - make_interval(mins => t.arrive_minutes) end
      );
    end if;
    times := times || coalesce(public.game_post_time_text(g.start_time), 'time TBD');
    if g.opponent is not null and not g.opponent = any (opponents) then
      opponents := opponents || g.opponent;
    end if;
    places := places || coalesce(g.location, '');
    uniforms := uniforms || coalesce(g.uniform, '');
    per_place := per_place
      || (coalesce(public.game_post_time_text(g.start_time), 'TBD') || ': ' || coalesce(g.location, 'place TBD'));
    per_uniform := per_uniform
      || (coalesce(public.game_post_time_text(g.start_time), 'TBD') || ': ' || coalesce(g.uniform, 'not set'));
  end loop;
  if n = 0 then return null; end if;

  if n = 1 then
    head := case when p_same_day then 'Game' else day_word || ' game' end;
    if array_length(opponents, 1) = 1 then head := head || ' against ' || opponents[1]; end if;
  else
    head := case when p_same_day then 'Games ' else day_word || ' games ' end
      || public.game_post_and(times);
    if coalesce(array_length(opponents, 1), 0) > 0 then
      head := head || ' against ' || public.game_post_and(opponents);
    end if;
  end if;
  lines := lines || head;

  -- Where: one line when every game is at the same place, else one per game.
  if (select count(distinct x) from unnest(places) x) = 1 then
    if places[1] <> '' then lines := lines || places[1]; end if;
  else
    lines := lines || per_place;
  end if;

  if n = 1 then lines := lines || coalesce(public.game_post_time_text(first_time), 'Time TBD'); end if;
  if first_arrive is not null then
    lines := lines || ('Arrive by ' || public.game_post_time_text(first_arrive));
  end if;

  -- What to wear: one line when every game matches, else one per game.
  if (select count(distinct x) from unnest(uniforms) x) = 1 then
    if uniforms[1] <> '' then lines := lines || uniforms[1]; end if;
  else
    lines := lines || per_uniform;
  end if;

  return left(array_to_string(lines, E'\n'), 1000);
end;
$$;

revoke execute on function public.game_day_message(uuid, date, boolean) from public, anon;
grant execute on function public.game_day_message(uuid, date, boolean) to authenticated;

/* When a team's post for a game day goes out (null when posts are off). */
create function public.game_post_send_at(p_team_id uuid, p_date date)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select case t.game_post_mode
    when 'hours' then
      ((p_date + coalesce(
        (select min(gm.start_time) from public.game gm join public.season s on s.id = gm.season_id
          where s.team_id = t.id and gm.game_date = p_date and gm.status = 'scheduled'),
        time '11:00'))::timestamp at time zone t.timezone)
        - make_interval(hours => t.game_post_hours)
    when 'days' then
      ((p_date - t.game_post_days) + t.game_post_time)::timestamp at time zone t.timezone
  end
  from public.team t where t.id = p_team_id;
$$;

revoke execute on function public.game_post_send_at(uuid, date) from public, anon;
grant execute on function public.game_post_send_at(uuid, date) to authenticated;

/*
 * The next game day's post for the app to show: the date, when it goes out, the text, and
 * when it went out if it already has. Coaches and managers only.
 */
create function public.next_game_day_post(p_team_id uuid)
returns table (game_date date, send_at timestamptz, message text, sent_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t public.team;
  d date;
  local_today date;
begin
  if not public.has_team_role(p_team_id, '{coach,manager}') then
    raise exception 'only coaches and managers can see game day posts'
      using errcode = 'insufficient_privilege';
  end if;
  select * into t from public.team where id = p_team_id;
  local_today := (now() at time zone t.timezone)::date;
  select min(gm.game_date) into d
  from public.game gm join public.season s on s.id = gm.season_id
  where s.team_id = p_team_id and gm.status = 'scheduled' and gm.game_date >= local_today;
  if d is null then return; end if;
  return query select
    d,
    public.game_post_send_at(p_team_id, d),
    public.game_day_message(
      p_team_id, d,
      coalesce((public.game_post_send_at(p_team_id, d) at time zone t.timezone)::date = d, true)
    ),
    (select l.sent_at from public.game_post_log l where l.team_id = p_team_id and l.game_date = d);
end;
$$;

revoke execute on function public.next_game_day_post(uuid) from public, anon;
grant execute on function public.next_game_day_post(uuid) to authenticated;

/* After a coach posts a game day by hand, the automatic post for that day is skipped. */
create function public.mark_game_day_posted(p_team_id uuid, p_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_team_role(p_team_id, '{coach,manager}') then
    raise exception 'only coaches and managers post game days' using errcode = 'insufficient_privilege';
  end if;
  insert into public.game_post_log (team_id, game_date, automatic)
  values (p_team_id, p_date, false)
  on conflict do nothing;
end;
$$;

revoke execute on function public.mark_game_day_posted(uuid, date) from public, anon;
grant execute on function public.mark_game_day_posted(uuid, date) to authenticated;

/*
 * Run by the scheduler every few minutes: post each team's game day once it's due and
 * before its first game starts. Teams need posts on, a GroupMe bot, and not be optioned.
 * Returns how many posts went out.
 */
create function public.send_due_game_posts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
  d date;
  first_start timestamptz;
  msg text;
  sent int := 0;
begin
  for t in
    select tm.id, tm.timezone, tm.game_post_mode, tm.game_post_days, b.bot_id
    from public.team tm
    join public.team_groupme b on b.team_id = tm.id
    where tm.game_post_mode <> 'off' and tm.optioned_at is null
  loop
    for d in
      select distinct gm.game_date
      from public.game gm join public.season s on s.id = gm.season_id
      where s.team_id = t.id and gm.status = 'scheduled'
        and gm.game_date between (now() at time zone t.timezone)::date
          and (now() at time zone t.timezone)::date + 4
        and not exists (
          select 1 from public.game_post_log l where l.team_id = t.id and l.game_date = gm.game_date
        )
    loop
      first_start := (
        select ((d + coalesce(min(gm.start_time), time '23:59'))::timestamp at time zone t.timezone)
        from public.game gm join public.season s on s.id = gm.season_id
        where s.team_id = t.id and gm.game_date = d and gm.status = 'scheduled'
      );
      if now() >= public.game_post_send_at(t.id, d) and now() < first_start then
        msg := public.game_day_message(
          t.id, d, (now() at time zone t.timezone)::date = d
        );
        if msg is not null then
          perform net.http_post(
            url := 'https://api.groupme.com/v3/bots/post',
            body := jsonb_build_object('bot_id', t.bot_id, 'text', msg),
            headers := '{"Content-Type": "application/json"}'::jsonb
          );
          insert into public.game_post_log (team_id, game_date) values (t.id, d)
          on conflict do nothing;
          sent := sent + 1;
        end if;
      end if;
    end loop;
  end loop;
  return sent;
end;
$$;

revoke execute on function public.send_due_game_posts() from public, anon, authenticated;

-- Every 10 minutes, where the scheduler is available (Supabase; not the local test database).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
    and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
    create extension if not exists pg_cron;
    perform cron.schedule('rallycap-game-day-posts', '*/10 * * * *',
      'select public.send_due_game_posts()');
  end if;
end;
$$;
