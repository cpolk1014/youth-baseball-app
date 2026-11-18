-- RallyCap demo: the Bayou Baseball Club (made-up), for showing RallyCap to a club director.
--
-- Run in the Supabase SQL Editor. Running it again first removes the last demo copy, then
-- builds a fresh one with dates relative to today (there's always a game this Saturday).
-- Every person, team and kid in it is made up. Remove it with club-demo-cleanup.sql.
--
-- BEFORE RUNNING: sign up on rallycap.team with each demo email below (any addresses you
-- control, e.g. you+club@…), then type them here. The parent is optional ('' to skip).

create temp table demo_people (role text primary key, email text);
insert into demo_people values
  ('director', 'DIRECTOR_EMAIL_HERE'),   -- signs in as the club director
  ('coach',    'COACH_EMAIL_HERE'),      -- head coach of every demo team (each shows its own coach name)
  ('parent',   'PARENT_EMAIL_HERE');     -- optional: Mason Reyes's parent on the 10U, with a Player pass

do $$
declare
  -- Fixed ids, so a re-run (and the cleanup) finds the last demo copy.
  v_org constant uuid := 'de30c1ab-0000-4000-8000-000000000001';
  v_team_ids constant uuid[] := array[
    'de30c1ab-0000-4000-8000-000000000108', 'de30c1ab-0000-4000-8000-000000000109',
    'de30c1ab-0000-4000-8000-000000000110', 'de30c1ab-0000-4000-8000-000000000111',
    'de30c1ab-0000-4000-8000-000000000112', 'de30c1ab-0000-4000-8000-000000000113'
  ]::uuid[];
  v_bombers constant uuid := 'de30c1ab-0000-4000-8000-000000000110';
  v_director uuid;
  v_coach uuid;
  v_parent uuid;
  v_dow integer := extract(dow from current_date)::integer;
  v_last_sat date;
  v_next_sat date;
  v_codes text[] := '{}';
  v_code text;
  -- Per team: age, name, coach's name, coach pitch, colors, results (W/L/T per past weekend,
  -- newest first; a blank means no game that weekend).
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
  v_athlete uuid;
  v_hits integer;
  v_ab integer;
  v_combo_home uuid;
  v_combo_road uuid;
  v_entry uuid;
begin
  perform setseed(0.42);

  select u.id into v_director from auth.users u join demo_people d on lower(u.email) = lower(trim(d.email)) where d.role = 'director';
  select u.id into v_coach from auth.users u join demo_people d on lower(u.email) = lower(trim(d.email)) where d.role = 'coach';
  select u.id into v_parent from auth.users u join demo_people d on lower(u.email) = lower(trim(d.email)) where d.role = 'parent';
  if v_director is null then
    raise exception 'No RallyCap account for the director email yet. Sign up with it on rallycap.team first.';
  end if;
  if v_coach is null then
    raise exception 'No RallyCap account for the coach email yet. Sign up with it on rallycap.team first.';
  end if;

  -- ── Start over: remove the last demo copy ──
  delete from public.pitch_session where athlete_id in (
    select a.id from public.athlete a join public.athlete_guardian g on g.athlete_id = a.id
    where g.user_id = v_parent and a.name = 'Mason Reyes');
  delete from public.athlete where id in (
    select a.id from public.athlete a join public.athlete_guardian g on g.athlete_id = a.id
    where g.user_id = v_parent and a.name = 'Mason Reyes');
  delete from public.player_game_stat where player_id in (
    select id from public.player where team_id = any (v_team_ids));
  delete from public.team where id = any (v_team_ids);
  delete from public.organization where id = v_org;

  -- Weekends: the last Saturday (before today) and the next one.
  v_last_sat := current_date - (case when (v_dow + 1) % 7 = 0 then 7 else (v_dow + 1) % 7 end);
  v_next_sat := v_last_sat + 7;

  -- ── The club, its look, its director ──
  insert into public.organization (id, name, created_by, palette, colors)
  values (v_org, 'Bayou Baseball Club', v_director,
    array['#13294B', '#F2A900', '#C8102E', '#FFFFFF', '#5B7FA6'], array['#13294B', '#F2A900']);
  insert into public.club_admin (organization_id, user_id, role) values (v_org, v_director, 'director');

  -- Eight codes for 2026-27: six used by the teams below, two left for new teams.
  for v_code in select * from public.create_club_codes(v_org, 8, '2026-27') loop
    v_codes := v_codes || v_code;
  end loop;

  -- ── Six teams ──
  v_idx := 0;
  for v_def in
    select * from (values
      ('8U',  'Bayou Bombers 8U',  'Ryan Hebert',     true,  array['#13294B', '#F2A900'], 'W,L,W,W,L,W,,W'),
      ('9U',  'Bayou Bombers 9U',  'Chris Fontenot',  false, array['#13294B', '#C8102E'], 'L,W,W,L,W,L,W,'),
      ('10U', 'Bayou Bombers 10U', 'Dave Reyes',      false, array['#13294B', '#F2A900'], 'W,W,W,L,W,W,W,W'),
      ('11U', 'Bayou Bombers 11U', 'Marcus Hill',     false, array['#5B7FA6', '#F2A900'], 'W,L,W,W,W,L,W,'),
      ('12U', 'Bayou Bombers 12U', 'Trey Boudreaux',  false, array['#C8102E', '#13294B'], 'L,L,W,L,W,L,,W'),
      ('13U', 'Bayou Bombers 13U', 'Jason Guidry',    false, array['#13294B', '#5B7FA6'], ',,,W,T,W,L,W')
    ) as t(age, name, coach_name, coach_pitch, colors, results)
  loop
    v_idx := v_idx + 1;
    v_team := v_team_ids[v_idx];
    insert into public.team (id, organization_id, name, age_group, colors, created_by, coach_pitch, timezone, arrive_minutes)
    values (v_team, v_org, v_def.name, v_def.age, v_def.colors, v_coach, v_def.coach_pitch, 'America/Chicago', 45);
    insert into public.member (team_id, user_id, role, display_name) values (v_team, v_coach, 'owner', v_def.coach_name);
    update public.club_code set team_id = v_team, redeemed_by = v_coach, redeemed_at = now() - interval '60 days'
      where organization_id = v_org and code = v_codes[v_idx];
    insert into public.season (team_id, name, start_date, end_date)
      values (v_team, 'Fall 2026', v_last_sat - 70, v_next_sat + 28) returning id into v_season;

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

    -- Who plays where: 9 fielders, or 10 for the coach-pitch 8U.
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
          insert into public.player_game_stat (player_id, game_id, game_date, opponent, our_runs, their_runs, team_name, box_name, batting, pitching, errors, positions, source)
          values (v_players[v_j], v_game, v_date, 'x', v_us, v_them, v_def.name, null,
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

    -- Coming up: this Saturday and next (no lineup yet, so auto-fill can be shown live).
    insert into public.game (season_id, game_date, start_time, opponent, location, field, innings, field_players, status)
    values
      (v_season, v_next_sat, (array['09:00','11:00','13:00','09:30','11:30','14:00'])[v_idx]::time,
        v_opponents[((v_idx + 3) % array_length(v_opponents, 1)) + 1], 'Bayou Park', 'Field ' || (1 + v_idx % 4), 6, array_length(v_fielders, 1), 'scheduled'),
      (v_season, v_next_sat + 7, '10:00', v_opponents[((v_idx + 6) % array_length(v_opponents, 1)) + 1],
        'Acadiana Sports Complex', 'Field 2', 6, array_length(v_fielders, 1), 'scheduled');
  end loop;

  -- ── The 10U in depth ──
  -- Uniforms, worn this Saturday.
  insert into public.uniform_combo (team_id, name, shirt, pants, hat, belt, socks)
    values (v_bombers, 'Home whites', 'White, navy script', 'Gray', 'Navy', 'Navy', 'Navy') returning id into v_combo_home;
  insert into public.uniform_combo (team_id, name, shirt, pants, hat, belt, socks)
    values (v_bombers, 'Gold Sundays', 'Gold', 'White', 'Navy', 'Navy', 'Navy') returning id into v_combo_road;
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
      array[v_last_sat - 20, v_next_sat + 10], v_coach) returning id into v_entry;
  insert into public.finance_share (entry_id, player_id, amount_cents) select v_entry, p, 10000 from unnest(v_players) p;
  for v_i in 1 .. 11 loop
    insert into public.finance_entry (season_id, type, title, amount_cents, entry_date, method, created_by)
      values (v_season, 'safe_at_home', 'Payment', case when v_i <= 9 then 10000 else 5000 end, v_last_sat - 30 + v_i, 'Venmo', v_coach)
      returning id into v_entry;
    insert into public.finance_share (entry_id, player_id, amount_cents) values (v_entry, v_players[v_i], case when v_i <= 9 then 10000 else 5000 end);
  end loop;
  insert into public.finance_entry (season_id, type, title, amount_cents, entry_date, category, payee, created_by)
    values (v_season, 'walkoff', 'Bayou Classic entry fee', 45000, v_last_sat - 25, 'Tournaments', 'Bayou Classic', v_coach);
  insert into public.finance_entry (season_id, type, title, amount_cents, entry_date, category, created_by)
    values (v_season, 'grand_slam', 'Boston butt sale', 82000, v_last_sat - 35, 'Fundraiser', v_coach);

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
      values (v_org, '2026-27', v_def.name, v_def.description, v_def.emoji, v_def.sort, now() - interval '3 days', current_date + 9)
      returning id into v_award;
    v_awards := v_awards || v_award;
  end loop;
  -- 8U, 9U and 10U have picked every award; 11U two of four; 12U and 13U none yet.
  for v_idx in 1 .. 4 loop
    for v_i in 1 .. (case when v_idx = 4 then 2 else 4 end) loop
      select array_agg(id order by jersey_number) into v_players from public.player where team_id = v_team_ids[v_idx];
      insert into public.club_award_pick (award_id, team_id, player_id, note, picked_by, picked_at)
        values (v_awards[v_i], v_team_ids[v_idx], v_players[((v_i * 3 + v_idx) % array_length(v_players, 1)) + 1],
          (array['Led the team in hits and never complained about a position.', 'Always the first one to the fence.',
                 'Went from scared of the ball to our starting third baseman.', 'Sprinted to first on every walk.'])[v_i],
          v_coach, now() - (v_i || ' days')::interval);
    end loop;
  end loop;

  -- ── Optional: a parent on the 10U, with a Player pass and a pitch count ──
  if v_parent is not null then
    insert into public.member (team_id, user_id, role, display_name) values (v_bombers, v_parent, 'parent', 'Ana Reyes');
    select id into v_kid from public.player where team_id = v_bombers and name = 'Mason Reyes';
    insert into public.player_guardian (player_id, user_id) values (v_kid, v_parent);
    select athlete_id into v_athlete from public.player where id = v_kid;
    perform public.grant_family_pass(v_parent, 1, array[v_athlete]);
    insert into public.pitch_session (athlete_id, kind, session_date, pitches, strikes, label, created_by) values
      (v_athlete, 'lesson', v_last_sat - 2, 35, 22, 'Coach Ray', v_parent),
      (v_athlete, 'bullpen', v_last_sat - 4, 25, null, null, v_parent),
      (v_athlete, 'other_team', v_last_sat - 6, 41, 26, 'Acadiana Thunder (subbed)', v_parent);
  end if;
end;
$$;

-- What was made.
select t.age_group, t.name, (select count(*) from public.player p where p.team_id = t.id) as kids,
  (select count(*) from public.game g join public.season s on s.id = g.season_id where s.team_id = t.id and g.status = 'final') as games_played,
  c.code
from public.team t join public.club_code c on c.team_id = t.id
where t.organization_id = 'de30c1ab-0000-4000-8000-000000000001'
order by t.age_group;
