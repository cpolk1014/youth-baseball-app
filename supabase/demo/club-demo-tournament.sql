-- Fungo demo add-on: a tournament for the Bayou Bombers 10U, halfway through pool play.
--
-- Run AFTER club-demo.sql, in the same SQL Editor (live project). Running it again replaces
-- the last copy. Re-running club-demo.sql removes it (it rebuilds the teams), so run this
-- again after that. Everything in it is made up.
--
-- The Cajun Fall Classic (10U), at Acadiana Sports Complex, dated around the day you run it
-- (Central time):
--   yesterday  pool play rounds 1 and 2, all scored
--   today      pool play round 3, 5:00 and 7:00 PM, not played yet (our game is on Games,
--              with a map and forecast, ready for Auto-fill)
--   tomorrow   the bracket: all 8 teams, seeded by pool finish (quarterfinals, semis, final)
-- Pool A after two rounds: Lake Charles Lightning 2-0, Bombers 1-1, Acadiana Storm 1-1,
-- Houma Hurricanes 0-2, so "What time do we play tomorrow?" has real what-ifs to show.
-- The 10U's regular games today and tomorrow are removed (the tournament replaces them).

do $$
declare
  v_team constant uuid := 'de30c1ab-0000-4000-8000-000000000110';  -- Bayou Bombers 10U
  v_tourney constant uuid := 'de30c1ab-0000-4000-8000-000000000201';
  v_rules constant uuid := 'de30c1ab-0000-4000-8000-000000000202';
  v_our_game constant uuid := 'de30c1ab-0000-4000-8000-000000000203';
  v_today date := (now() at time zone 'America/Chicago')::date;
  v_season uuid;
  v_ids jsonb := '{}';
  v_name text;
  v_id uuid;
begin
  select id into v_season from public.season where team_id = v_team;
  if v_season is null then
    raise exception 'The Bayou Bombers 10U isn''t there. Run club-demo.sql first.';
  end if;

  -- Start over.
  delete from public.tournament where id = v_tourney;
  delete from public.tiebreak_rule_set where id = v_rules;
  delete from public.game where id = v_our_game;
  -- The tournament takes the 10U's weekend: no regular games today or tomorrow.
  delete from public.game g
  where g.season_id = v_season and g.status = 'scheduled'
    and g.game_date between v_today and v_today + 1;

  insert into public.tiebreak_rule_set (id, team_id, name, organization, rules, restart, notes)
  values (v_rules, v_team, 'Cajun Classic tiebreak', 'Bayou Select Baseball',
    '[{"type": "head_to_head", "cap": null, "text": "Head to head (two teams tied only)"},
      {"type": "run_diff", "cap": 8, "text": "Run differential, max 8 runs per game"},
      {"type": "runs_allowed", "cap": null, "text": "Fewest runs allowed"},
      {"type": "coin_flip", "cap": null, "text": "Coin flip"}]'::jsonb,
    true, 'Pool play seeds the bracket. All teams advance.');

  insert into public.tournament (id, team_id, season_id, name, organization, start_date, end_date,
    city, venues, division, places, tiebreak_set_id, seeding)
  values (v_tourney, v_team, v_season, 'Cajun Fall Classic', 'Bayou Select Baseball',
    v_today - 1, v_today + 1, 'Lafayette, LA', array['Acadiana Sports Complex'], '10U',
    '[{"name": "Acadiana Sports Complex", "address": "Lafayette, LA", "lat": 30.2241, "lng": -92.0198, "placeId": null}]'::jsonb,
    v_rules, 'pool');

  -- Eight teams, two pools.
  for v_name in select unnest(array['Bayou Bombers 10U', 'Acadiana Storm', 'Lake Charles Lightning',
      'Houma Hurricanes', 'Baton Rouge Bandits', 'Lafayette Mudcats', 'Gonzales Gators', 'Thibodaux Thunder'])
  loop
    insert into public.tournament_team (tournament_id, name, hometown, class_label, is_us, source)
    values (v_tourney, v_name,
      case v_name when 'Bayou Bombers 10U' then 'Baton Rouge, LA' when 'Acadiana Storm' then 'Lafayette, LA'
        when 'Lake Charles Lightning' then 'Lake Charles, LA' when 'Houma Hurricanes' then 'Houma, LA'
        when 'Baton Rouge Bandits' then 'Baton Rouge, LA' when 'Lafayette Mudcats' then 'Lafayette, LA'
        when 'Gonzales Gators' then 'Gonzales, LA' else 'Thibodaux, LA' end,
      'AA', v_name = 'Bayou Bombers 10U', 'screenshot')
    returning id into v_id;
    v_ids := v_ids || jsonb_build_object(v_name, v_id);
  end loop;

  -- Our pool game tonight: a team game too (Games, map, forecast, Auto-fill).
  insert into public.game (id, season_id, game_date, start_time, opponent, location, field, innings,
    field_players, status, location_address, location_lat, location_lng)
  values (v_our_game, v_season, v_today, '17:00', 'Houma Hurricanes', 'Acadiana Sports Complex',
    'Field 3', 6, 9, 'scheduled', 'Lafayette, LA', 30.2241, -92.0198);

  -- Pool play: yesterday's two rounds are final; tonight's round 3 isn't played yet.
  insert into public.tournament_game (tournament_id, game_no, stage, pool, round, game_date, start_time,
    venue, field, home, away, home_team_id, away_team_id, score_home, score_away, reported_at, locked, game_id)
  select v_tourney, g.no, 'pool', g.pool, null, v_today + g.day, g.t::time, 'Acadiana Sports Complex', g.field,
    g.home, g.away, (v_ids ->> g.home)::uuid, (v_ids ->> g.away)::uuid, g.sh, g.sa,
    case when g.sh is null then null else now() - interval '20 hours' end, false,
    case when g.no = '9' then v_our_game end
  from (values
    -- no, pool, day, time, field, home, away, home score, away score
    ('1',  'A', -1, '17:30', 'Field 3', 'Bayou Bombers 10U',      'Acadiana Storm',         7,    4),
    ('2',  'A', -1, '17:30', 'Field 4', 'Lake Charles Lightning', 'Houma Hurricanes',       9,    2),
    ('3',  'B', -1, '17:30', 'Field 1', 'Baton Rouge Bandits',    'Lafayette Mudcats',      3,    5),
    ('4',  'B', -1, '17:30', 'Field 2', 'Gonzales Gators',        'Thibodaux Thunder',      6,    5),
    ('5',  'A', -1, '19:30', 'Field 3', 'Lake Charles Lightning', 'Bayou Bombers 10U',      6,    5),
    ('6',  'A', -1, '19:30', 'Field 4', 'Acadiana Storm',         'Houma Hurricanes',       8,    3),
    ('7',  'B', -1, '19:30', 'Field 1', 'Lafayette Mudcats',      'Gonzales Gators',        4,    2),
    ('8',  'B', -1, '19:30', 'Field 2', 'Thibodaux Thunder',      'Baton Rouge Bandits',    1,    8),
    ('9',  'A',  0, '17:00', 'Field 3', 'Bayou Bombers 10U',      'Houma Hurricanes',       null, null),
    ('10', 'A',  0, '17:00', 'Field 4', 'Acadiana Storm',         'Lake Charles Lightning', null, null),
    ('11', 'B',  0, '19:00', 'Field 1', 'Lafayette Mudcats',      'Thibodaux Thunder',      null, null),
    ('12', 'B',  0, '19:00', 'Field 2', 'Baton Rouge Bandits',    'Gonzales Gators',        null, null)
  ) as g(no, pool, day, t, field, home, away, sh, sa);

  -- Tomorrow's bracket (its own game numbers), every team in, placeholders until seeds lock.
  insert into public.tournament_game (tournament_id, game_no, stage, pool, round, game_date, start_time,
    venue, field, home, away)
  select v_tourney, b.no, 'bracket', null, b.round, v_today + 1, b.t::time, 'Acadiana Sports Complex',
    b.field, b.home, b.away
  from (values
    ('1', 'Quarterfinal', '08:00', 'Field 3', '1st Pool A',    '4th Pool B'),
    ('2', 'Quarterfinal', '08:00', 'Field 4', '2nd Pool B',    '3rd Pool A'),
    ('3', 'Quarterfinal', '10:00', 'Field 3', '1st Pool B',    '4th Pool A'),
    ('4', 'Quarterfinal', '10:00', 'Field 4', '2nd Pool A',    '3rd Pool B'),
    ('5', 'Semifinal',    '12:30', 'Field 3', 'Winner Game 1', 'Winner Game 2'),
    ('6', 'Semifinal',    '14:30', 'Field 3', 'Winner Game 3', 'Winner Game 4'),
    ('7', 'Championship', '17:00', 'Field 3', 'Winner Game 5', 'Winner Game 6')
  ) as b(no, round, t, field, home, away);
end $$;

-- What's there now.
select g.stage, g.game_no, g.pool, g.round, g.game_date, to_char(g.start_time, 'HH12:MI AM') as starts,
  g.home, g.score_home, g.score_away, g.away
from public.tournament_game g
where g.tournament_id = 'de30c1ab-0000-4000-8000-000000000201'
order by g.stage desc, g.game_date, g.start_time, g.game_no::int;
