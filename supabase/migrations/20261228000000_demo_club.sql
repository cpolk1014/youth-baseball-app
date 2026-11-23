-- The demo club: anyone can try Fungo as a club director without an account. "Try the demo"
-- signs them in as a guest (Supabase anonymous sign-in) and `start_demo_club` builds them their
-- own copy of the made-up Bayou Baseball Club (eight teams, 7U to 14U, a season of games and
-- lineups, club codes, awards, a library, and the 10U in depth). Everything in it is made up.
--
-- A guest is the club's director and head coach of all eight teams, so every screen works.
-- Guests and demo clubs stay apart from everyone else: a guest can't join or start a real
-- team or club, and nobody real can join a demo team or use a demo club's code. AI, payments
-- and notifications are turned off for guests in the app's server routes. Demo clubs and
-- guest accounts are removed after two days (`cleanup_demo_clubs`, hourly).
--
-- Built from supabase/demo/club-demo.sql (the Nov 20 director demo), without the parent.

alter table public.organization add column demo_until timestamptz;

-- Is this user a guest (Supabase anonymous sign-in)? The caller when no user is given.
create function public.is_guest(p_user uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select u.is_anonymous from auth.users u where u.id = coalesce(p_user, (select auth.uid()))),
    false);
$$;
revoke execute on function public.is_guest(uuid) from public, anon;
grant execute on function public.is_guest(uuid) to authenticated;

create function public.is_demo_team(p_team uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.team t join public.organization o on o.id = t.organization_id
    where t.id = p_team and o.demo_until is not null);
$$;
revoke execute on function public.is_demo_team(uuid) from public, anon, authenticated;

-- Guests only on demo teams, and demo teams only for guests.
create function public.demo_members_stay_apart()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_guest(new.user_id) <> public.is_demo_team(new.team_id) then
    raise exception 'Guests in the demo club can''t join real teams. Sign in with your email to start one.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger demo_members_stay_apart before insert or update of team_id, user_id
  on public.member for each row execute function public.demo_members_stay_apart();

create function public.demo_admins_stay_apart()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_guest(new.user_id) <> exists (
    select 1 from public.organization o where o.id = new.organization_id and o.demo_until is not null
  ) then
    raise exception 'Guests in the demo club can''t start a real club. Sign in with your email to start one.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger demo_admins_stay_apart before insert or update of organization_id, user_id
  on public.club_admin for each row execute function public.demo_admins_stay_apart();

-- A real team can't join a demo club (with one of its codes), and no team moves into one.
create function public.no_teams_into_demo_clubs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id and exists (
    select 1 from public.organization o where o.id = new.organization_id and o.demo_until is not null
  ) then
    raise exception 'That code isn''t right. Check it with your club.' using errcode = 'P0002';
  end if;
  return new;
end;
$$;
create trigger no_teams_into_demo_clubs before update of organization_id
  on public.team for each row execute function public.no_teams_into_demo_clubs();

/*
 * Build the calling guest their demo club (or return the one they have). Returns
 * {club, team}: the club, and the 10U to open first.
 */
create function public.start_demo_club()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_org uuid;
  v_bombers uuid;
  v_team_ids uuid[] := '{}';
  v_tz constant text := 'America/Chicago';
  v_today date := (now() at time zone 'America/Chicago')::date;
  v_dow integer;
  v_last_sat date;
  v_next_sat date;
  v_season_label text;
  v_codes text[] := '{}';
  v_code text;
  v_def record;
  v_team uuid;
  v_season uuid;
  v_players uuid[];
  v_pitchers uuid[];
  v_kid uuid;
  v_game uuid;
  v_lineup uuid;
  v_idx integer;
  v_i integer;
  v_j integer;
  v_w integer;
  v_result text;
  v_us integer;
  v_them integer;
  v_fielders text[];
  v_spots text[];
  v_others uuid[];
  v_pitcher uuid;
  v_date date;
  v_opponents text[] := array['Gulf Coast Gators', 'Acadiana Thunder', 'Lake Charles Lightning',
    'Houma Hurricanes', 'Baton Rouge Bandits', 'Lafayette Longhorns', 'Pelican State Prospects',
    'Cajun Crushers', 'Delta Diamond Dogs', 'Red River Rattlers'];
  v_first text[] := array['Mason', 'Eli', 'Jake', 'Carter', 'Owen', 'Luke', 'Brody', 'Wyatt',
    'Cole', 'Noah', 'Tucker', 'Jaxon', 'Hudson', 'Beau', 'Remy', 'Gage', 'Landry', 'Tate',
    'Colt', 'Rhett', 'Shep', 'Knox', 'Easton', 'Ryder'];
  v_last text[] := array['Reyes', 'Brooks', 'Morales', 'Hebert', 'Pitre', 'Hill', 'Simoneaux',
    'Duhon', 'Arceneaux', 'Guidry', 'Landry', 'Thibodeaux', 'Broussard', 'Fontenot', 'Mouton',
    'Boudreaux', 'LeBlanc', 'Richard', 'Savoie', 'Domingue', 'Breaux', 'Doucet', 'Hebert', 'Comeaux'];
  v_award uuid;
  v_awards uuid[] := '{}';
  v_hits integer;
  v_ab integer;
  v_combo_home uuid;
  v_entry uuid;
begin
  if v_me is null or not public.is_guest(v_me) then
    raise exception 'The demo club is for guests. Sign out to try it.' using errcode = '42501';
  end if;

  -- One demo club per guest: open the one they have.
  select o.id into v_org from public.organization o
    join public.club_admin a on a.organization_id = o.id
    where a.user_id = v_me and o.demo_until > now()
    order by o.created_at desc limit 1;
  if v_org is not null then
    select t.id into v_bombers from public.team t
      where t.organization_id = v_org and t.age_group = '10U' limit 1;
    return jsonb_build_object('club', v_org, 'team', v_bombers);
  end if;

  -- One build at a time, and a ceiling on how many an hour (Supabase also limits guest
  -- sign-ins per address).
  perform pg_advisory_xact_lock(hashtext('start_demo_club'));
  if (select count(*) from public.organization where demo_until is not null
      and created_at > now() - interval '1 hour') >= 300 then
    raise exception 'The demo is busy right now. Try again in a few minutes.' using errcode = 'P0429';
  end if;

  perform setseed(0.42);
  v_season_label := to_char(public.season_start(v_today), 'YYYY') || '-'
    || to_char(public.season_start(v_today) + interval '1 year', 'YY');

  -- Weekends: the last Saturday (before today) and the next one.
  v_dow := extract(dow from v_today)::integer;
  v_last_sat := v_today - (case when (v_dow + 1) % 7 = 0 then 7 else (v_dow + 1) % 7 end);
  v_next_sat := v_last_sat + 7;

  -- ── The club, its look, its director ──
  insert into public.organization (name, created_by, palette, colors, demo_until)
  values ('Bayou Baseball Club', v_me,
    array['#13294B', '#F2A900', '#C8102E', '#FFFFFF', '#5B7FA6'], array['#13294B', '#F2A900'],
    now() + interval '2 days')
  returning id into v_org;
  insert into public.club_admin (organization_id, user_id, role) values (v_org, v_me, 'director');

  -- Ten codes for the season: eight used by the teams below, two left for new teams.
  for v_code in select * from public.create_club_codes(v_org, 10, v_season_label) loop
    v_codes := v_codes || v_code;
  end loop;

  -- ── Eight teams, 7U to 14U ──
  v_idx := 0;
  for v_def in
    select * from (values
      ('7U',  'Bayou Bombers 7U',  'Blake Mouton',    true,  array['#F2A900', '#13294B'], 'W,W,L,W,,W,L,W'),
      ('8U',  'Bayou Bombers 8U',  'Ryan Hebert',     true,  array['#13294B', '#F2A900'], 'W,L,W,W,L,W,,W'),
      ('9U',  'Bayou Bombers 9U',  'Chris Fontenot',  false, array['#13294B', '#C8102E'], 'L,W,W,L,W,L,W,'),
      ('10U', 'Bayou Bombers 10U', 'Dave Reyes',      false, array['#13294B', '#F2A900'], 'W,W,W,L,W,W,W,W'),
      ('11U', 'Bayou Bombers 11U', 'Marcus Hill',     false, array['#5B7FA6', '#F2A900'], 'W,L,W,W,W,L,W,'),
      ('12U', 'Bayou Bombers 12U', 'Trey Boudreaux',  false, array['#C8102E', '#13294B'], 'L,L,W,L,W,L,,W'),
      ('13U', 'Bayou Bombers 13U', 'Jason Guidry',    false, array['#13294B', '#5B7FA6'], ',,,W,T,W,L,W'),
      ('14U', 'Bayou Bombers 14U', 'Keith Domingue',  false, array['#13294B', '#C8102E'], 'L,W,W,W,L,W,W,L')
    ) as t(age, name, coach_name, coach_pitch, colors, results)
  loop
    v_idx := v_idx + 1;
    -- Paid through the club's code (below), so no trial.
    insert into public.team (organization_id, name, age_group, colors, created_by, coach_pitch,
      timezone, arrive_minutes, free_until, free_kind)
    values (v_org, v_def.name, v_def.age, v_def.colors, v_me, v_def.coach_pitch, v_tz, 45,
      v_today - 1, 'trial')
    returning id into v_team;
    v_team_ids := v_team_ids || v_team;
    if v_def.age = '10U' then v_bombers := v_team; end if;
    -- The guest coaches every team (made its owner when the team was made), under each
    -- team's own coach name.
    update public.member set display_name = v_def.coach_name where team_id = v_team and user_id = v_me;
    update public.club_code set team_id = v_team, redeemed_by = v_me, redeemed_at = now() - interval '60 days'
      where organization_id = v_org and code = v_codes[v_idx];
    insert into public.season (team_id, name, start_date, end_date)
      values (v_team, 'Fall ' || extract(year from v_last_sat - 70)::int, v_last_sat - 70, v_next_sat + 28)
      returning id into v_season;

    -- 12 kids (11 on the 13U), each a made-up first name and last name.
    v_players := '{}';
    v_pitchers := '{}';
    for v_i in 1 .. (case when v_def.age = '13U' then 11 else 12 end) loop
      insert into public.player (team_id, name, jersey_number, preferred_positions, can_pitch, can_catch)
      values (
        v_team,
        -- The 10U has full names (Mason Reyes first); other teams first name and last initial.
        case when v_team = v_bombers then v_first[v_i] || ' ' || v_last[v_i]
             else v_first[((v_i - 1 + v_idx * 5) % array_length(v_first, 1)) + 1] || ' ' ||
                  left(v_last[((v_i + v_idx * 3) % array_length(v_last, 1)) + 1], 1) || '.' end,
        ((v_i * 7 + v_idx * 3) % 40) + 1,
        string_to_array((array['SS,P', 'C,1B', 'P,2B', '3B', 'CF,LF', '2B,SS', 'RF', 'LF,CF', '1B,P', 'C', 'RF,LF', '3B,SS'])[((v_i - 1) % 12) + 1], ',')::public.lineup_position[],
        v_i in (1, 3, 9, 5),
        v_i in (2, 10)
      ) returning id into v_kid;
      v_players := v_players || v_kid;
      if v_i in (1, 3, 9, 5) then v_pitchers := v_pitchers || v_kid; end if;
    end loop;

    -- Who plays where: 9 fielders, or 10 for coach pitch.
    v_fielders := case when v_def.coach_pitch
      then array['P','C','1B','2B','3B','SS','LF','LCF','RCF','RF']
      else array['P','C','1B','2B','3B','SS','LF','CF','RF'] end;

    -- Past games, one per weekend (newest first), each with a full lineup.
    v_w := 0;
    foreach v_result in array string_to_array(v_def.results, ',') loop
      v_date := v_last_sat - 7 * v_w;
      v_w := v_w + 1;
      continue when v_result = '';
      v_us := case v_result when 'W' then 5 + floor(random() * 7)::int when 'L' then 1 + floor(random() * 4)::int else 4 end;
      v_them := case v_result when 'W' then greatest(0, v_us - 1 - floor(random() * 5)::int) when 'L' then v_us + 1 + floor(random() * 5)::int else 4 end;
      insert into public.game (season_id, game_date, start_time, opponent, location, field, innings, field_players, status, score_us, score_them)
      values (v_season, v_date, '09:00', v_opponents[((v_w + v_idx) % array_length(v_opponents, 1)) + 1],
        case when v_w % 2 = 0 then 'Bayou Park' else 'Acadiana Sports Complex' end, 'Field ' || (1 + v_idx % 4),
        6, array_length(v_fielders, 1), 'final', v_us, v_them)
      returning id into v_game;
      insert into public.lineup (game_id, batting_order, created_at)
        values (v_game, v_players, (v_date - 1)::timestamptz + interval '20 hours') returning id into v_lineup;
      for v_i in 1 .. 6 loop
        -- Each pitcher throws two innings; everyone else rotates through the spots and the bench.
        v_pitcher := v_pitchers[(((v_i - 1) / 2 + v_w) % array_length(v_pitchers, 1)) + 1];
        if v_def.coach_pitch then v_pitcher := v_players[1 + (v_i + v_w) % array_length(v_players, 1)]; end if;
        insert into public.lineup_slot (lineup_id, inning, player_id, position) values (v_lineup, v_i, v_pitcher, 'P');
        v_others := array(select p from unnest(v_players) p where p <> v_pitcher);
        v_spots := v_fielders[2:];
        while array_length(v_spots, 1) < array_length(v_others, 1) loop v_spots := v_spots || 'BENCH'::text; end loop;
        for v_j in 1 .. array_length(v_others, 1) loop
          insert into public.lineup_slot (lineup_id, inning, player_id, position)
          values (v_lineup, v_i, v_others[v_j],
            v_spots[((v_j - 1 + (v_i - 1) * 3 + v_w) % array_length(v_spots, 1)) + 1]::public.lineup_position);
        end loop;
      end loop;

      -- The 10U adds each game's box score (made-up lines), for stats and hot streaks.
      if v_team = v_bombers then
        for v_j in 1 .. array_length(v_players, 1) loop
          v_ab := 2 + (random() < 0.6)::int;
          -- Luke Hill (#6 in the order) is hot over the last two weeks.
          v_hits := case when v_j = 6 and v_w <= 2 then v_ab
                         when v_j = 6 then (random() < 0.15)::int
                         else (random() < 0.32)::int + (random() < 0.32 and v_ab = 3)::int end;
          insert into public.player_game_stat (player_id, game_id, season_id, game_date, opponent, our_runs, their_runs, team_name, box_name, batting, pitching, errors, positions, source)
          values (v_players[v_j], v_game, v_season, v_date, 'x', v_us, v_them, v_def.name, null,
            jsonb_build_object('ab', v_ab, 'h', v_hits, 'r', (random() < 0.35)::int, 'rbi', (v_hits > 0 and random() < 0.5)::int,
              'bb', (random() < 0.18)::int, 'so', (v_hits < v_ab and random() < 0.3)::int,
              'doubles', (v_hits > 0 and random() < 0.25)::int, 'triples', 0, 'hr', (v_hits > 0 and random() < 0.06)::int,
              'sb', (random() < 0.2)::int, 'cs', 0, 'hbp', 0, 'sac', 0, 'sf', 0),
            case when v_players[v_j] = any (v_pitchers) then
              jsonb_build_object('outs', 6, 'h', floor(random() * 4)::int, 'r', floor(random() * 3)::int,
                'er', floor(random() * 2)::int, 'bb', floor(random() * 3)::int, 'so', 2 + floor(random() * 4)::int,
                'pitches', 28 + floor(random() * 22)::int, 'strikes', 18 + floor(random() * 10)::int, 'bf', 9 + floor(random() * 4)::int)
            end,
            (random() < 0.1)::int, '{}', 'coach');
        end loop;
      end if;
    end loop;

    -- Coming up: this Saturday and next (no lineup yet, so auto-fill can be tried).
    -- With map pins (Baton Rouge and Lafayette), so Where shows a map and the forecast shows.
    insert into public.game (season_id, game_date, start_time, opponent, location, field, innings, field_players, status,
      location_address, location_lat, location_lng)
    values
      (v_season, v_next_sat, (array['08:30','09:00','11:00','13:00','09:30','11:30','14:00','16:00'])[v_idx]::time,
        v_opponents[((v_idx + 3) % array_length(v_opponents, 1)) + 1], 'Bayou Park', 'Field ' || (1 + v_idx % 4), 6, array_length(v_fielders, 1), 'scheduled',
        'Baton Rouge, LA', 30.4515, -91.1871),
      (v_season, v_next_sat + 7, '10:00', v_opponents[((v_idx + 6) % array_length(v_opponents, 1)) + 1],
        'Acadiana Sports Complex', 'Field 2', 6, array_length(v_fielders, 1), 'scheduled',
        'Lafayette, LA', 30.2241, -92.0198);
  end loop;

  -- ── The 10U in depth ──
  -- Uniforms, worn this Saturday.
  insert into public.uniform_combo (team_id, name, shirt, pants, hat, belt, socks)
    values (v_bombers, 'Home whites', 'White, navy script', 'Gray', 'Navy', 'Navy', 'Navy') returning id into v_combo_home;
  insert into public.uniform_combo (team_id, name, shirt, pants, hat, belt, socks)
    values (v_bombers, 'Gold Sundays', 'Gold', 'White', 'Navy', 'Navy', 'Navy');
  update public.game g set uniform_combo_id = v_combo_home
    from public.season s where s.id = g.season_id and s.team_id = v_bombers and g.game_date = v_next_sat;

  -- Practices: Tuesdays and Thursdays, two weeks back and three ahead, with plans.
  select id into v_season from public.season where team_id = v_bombers;
  for v_i in -2 .. 2 loop
    for v_j in 0 .. 1 loop
      v_date := v_next_sat - 4 + 7 * v_i + 2 * v_j;  -- Tuesday, then Thursday
      insert into public.practice (season_id, practice_date, start_time, end_time, location, field, focus, plan, plays)
      values (v_season, v_date, '17:30', '19:00', 'Bayou Park', 'Field 3',
        (array['Infield', 'Hitting', 'Throwing', 'Baserunning'])[((v_i + 2) * 2 + v_j) % 4 + 1],
        jsonb_build_array(
          jsonb_build_object('id', gen_random_uuid(), 'title', 'Warm-up: Dynamic Dash', 'minutes', 10, 'notes', 'Jog to the fence and back, high knees, butt kicks, karaoke.'),
          jsonb_build_object('id', gen_random_uuid(), 'title', 'Throwing progression', 'minutes', 15, 'notes', 'Partners at 30, 45, then 60 feet. Step, point, throw, follow through.'),
          jsonb_build_object('id', gen_random_uuid(), 'title', 'Station rotation', 'minutes', 45, 'notes', 'Four stations, 11 minutes each: ground balls, tee work, fly balls, baserunning. Whistle and rotate.'),
          jsonb_build_object('id', gen_random_uuid(), 'title', 'Situations: cutoffs', 'minutes', 15, 'notes', 'Runner on second, single to right: everyone to their spot. Walk it, then run it.'),
          jsonb_build_object('id', gen_random_uuid(), 'title', 'Team huddle', 'minutes', 5, 'notes', 'Name one teammate who did something great today.')),
        array['single-right-r2', 'grounder-short']);
    end loop;
  end loop;

  -- Team money: tournament fees split 12 ways, most families paid, one overdue.
  select array_agg(id order by jersey_number) into v_players from public.player where team_id = v_bombers;
  insert into public.finance_entry (season_id, type, title, amount_cents, entry_date, category, due_dates, created_by)
    values (v_season, 'bat_around', 'Fall tournament fees', 120000, v_last_sat - 40, 'Tournaments',
      array[v_last_sat - 20, v_next_sat + 10], v_me) returning id into v_entry;
  insert into public.finance_share (entry_id, player_id, amount_cents) select v_entry, p, 10000 from unnest(v_players) p;
  for v_i in 1 .. 11 loop
    insert into public.finance_entry (season_id, type, title, amount_cents, entry_date, method, created_by)
      values (v_season, 'safe_at_home', 'Payment', case when v_i <= 9 then 10000 else 5000 end, v_last_sat - 30 + v_i, 'Venmo', v_me)
      returning id into v_entry;
    insert into public.finance_share (entry_id, player_id, amount_cents) values (v_entry, v_players[v_i], case when v_i <= 9 then 10000 else 5000 end);
  end loop;
  insert into public.finance_entry (season_id, type, title, amount_cents, entry_date, category, payee, created_by)
    values (v_season, 'walkoff', 'Bayou Classic entry fee', 45000, v_last_sat - 25, 'Tournaments', 'Bayou Classic', v_me);
  insert into public.finance_entry (season_id, type, title, amount_cents, entry_date, category, created_by)
    values (v_season, 'grand_slam', 'Boston butt sale', 82000, v_last_sat - 35, 'Fundraiser', v_me);

  -- ── Club library: practice plans and a homework play set ──
  insert into public.club_practice_plan (organization_id, title, focus, items) values
    (v_org, 'Bayou infield day', 'Infield', jsonb_build_array(
      jsonb_build_object('title', 'Ground ball ladder', 'minutes', 15, 'notes', 'Short hops, then backhands, then slow rollers.'),
      jsonb_build_object('title', 'Double play feeds', 'minutes', 15, 'notes', 'Shortstop and second base feeds, then turns.'),
      jsonb_build_object('title', 'Situations', 'minutes', 20, 'notes', 'Runner on first, nobody out: where does everyone go?'))),
    (v_org, 'Club hitting night', 'Hitting', jsonb_build_array(
      jsonb_build_object('title', 'Tee stations', 'minutes', 20, 'notes', 'Inside, middle, outside tees.'),
      jsonb_build_object('title', 'Soft toss', 'minutes', 15, 'notes', 'Front toss into the net, 10 swings each.'),
      jsonb_build_object('title', 'Live BP', 'minutes', 25, 'notes', 'Coach pitch, 6 swings each, run out the last one.')));
  insert into public.club_play_set (organization_id, title, play_ids)
    values (v_org, 'Bayou cutoffs and relays', array['single-right-r2', 'single-center-r2', 'double-left-line', 'r3-throw-home']);
  insert into public.uniform_combo (organization_id, name, shirt, pants, hat, belt, socks)
    values (v_org, 'Club navy', 'Navy, gold script', 'Gray', 'Navy', 'Navy', 'Navy');

  -- ── Club awards: live, due in 9 days, some teams done ──
  for v_def in
    select * from (values
      ('Team MVP', 'The player who carried us all season.', '🏆', 1),
      ('Best Teammate', 'First to pick a teammate up.', '🤝', 2),
      ('Most Improved', 'Grew the most from August to now.', '📈', 3),
      ('Hustle Award', 'Ran out every ground ball.', '🔥', 4)
    ) as a(name, description, emoji, sort)
  loop
    insert into public.club_award (organization_id, season_label, name, description, emoji, sort, live_at, due_on)
      values (v_org, v_season_label, v_def.name, v_def.description, v_def.emoji, v_def.sort, now() - interval '3 days', v_today + 9)
      returning id into v_award;
    v_awards := v_awards || v_award;
  end loop;
  -- 7U through 11U have picked every award; 12U two of four; 13U and 14U none yet.
  for v_idx in 1 .. 6 loop
    for v_i in 1 .. (case when v_idx = 6 then 2 else 4 end) loop
      select array_agg(id order by jersey_number) into v_players from public.player where team_id = v_team_ids[v_idx];
      insert into public.club_award_pick (award_id, team_id, player_id, note, picked_by, picked_at)
        values (v_awards[v_i], v_team_ids[v_idx], v_players[((v_i * 3 + v_idx) % array_length(v_players, 1)) + 1],
          (array['Led the team in hits and never complained about a position.', 'Always the first one to the fence.',
                 'Went from scared of the ball to our starting third baseman.', 'Sprinted to first on every walk.'])[v_i],
          v_me, now() - (v_i || ' days')::interval);
    end loop;
  end loop;

  return jsonb_build_object('club', v_org, 'team', v_bombers);
end;
$$;
revoke execute on function public.start_demo_club() from public, anon;
grant execute on function public.start_demo_club() to authenticated;

-- Demo clubs and guests are gone two days after they start (hourly).
create function public.cleanup_demo_clubs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_orgs uuid[] := array(select id from public.organization
    where demo_until is not null and demo_until < now());
  v_teams uuid[];
begin
  v_teams := array(select id from public.team where organization_id = any (v_orgs));
  delete from public.player_game_stat where player_id in (
    select id from public.player where team_id = any (v_teams));
  delete from public.team where id = any (v_teams);
  delete from public.organization where id = any (v_orgs);
  -- Guests whose demo has ended (Supabase keeps anonymous accounts until they're deleted).
  delete from auth.users u where u.is_anonymous and u.created_at < now() - interval '2 days'
    and not exists (
      select 1 from public.club_admin a join public.organization o on o.id = a.organization_id
      where a.user_id = u.id and o.demo_until > now());
  return coalesce(array_length(v_orgs, 1), 0);
end;
$$;
revoke execute on function public.cleanup_demo_clubs() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule('fungo-cleanup-demo-clubs', '23 * * * *',
      'select public.cleanup_demo_clubs()');
  end if;
end;
$$;
