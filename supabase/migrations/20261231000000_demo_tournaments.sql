-- Every demo team plays in a tournament: the made-up Cajun Fall Classic (Bayou Select Baseball,
-- Acadiana Sports Complex), each team in its own age division. It runs yesterday, today and
-- tomorrow from the day the demo is built (Central time), from supabase/demo/
-- club-demo-tournament.sql:
--   yesterday  pool play rounds 1 and 2, scored
--   today      round 3, not played yet (our game is on Games, ready for Auto-fill)
--   tomorrow   the bracket: all 8 teams seeded by pool finish (quarterfinals, semis, final)
-- Pool A after two rounds: Lake Charles 2-0, us 1-1, Acadiana 1-1, Houma 0-2, so "What time do
-- we play tomorrow?" has real what-ifs. A team's regular games today and tomorrow give way.
--
-- start_demo_club now also fills tournaments once; a demo club built before this gets them
-- the next time it opens.

create function public.fill_demo_tournaments(p_org uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'America/Chicago')::date;
  v_team record;
  v_rules uuid;
  v_tourney uuid;
  v_game uuid;
  v_ids jsonb;
  v_name text;
  v_id uuid;
  v_others constant text[] := array['Acadiana Storm', 'Lake Charles Lightning', 'Houma Hurricanes',
    'Baton Rouge Bandits', 'Lafayette Mudcats', 'Gonzales Gators', 'Thibodaux Thunder'];
begin
  for v_team in
    select t.id, t.name, t.age_group, t.coach_pitch, s.id as season_id
    from public.team t
    join lateral (select s.id from public.season s where s.team_id = t.id
      order by s.start_date desc nulls last limit 1) s on true
    where t.organization_id = p_org
      and not exists (select 1 from public.tournament x where x.team_id = t.id)
  loop
    -- The tournament takes the weekend: no regular games today or tomorrow.
    delete from public.game g
    where g.season_id = v_team.season_id and g.status = 'scheduled'
      and g.game_date between v_today and v_today + 1;

    insert into public.tiebreak_rule_set (team_id, name, organization, rules, restart, notes)
    values (v_team.id, 'Cajun Classic tiebreak', 'Bayou Select Baseball',
      '[{"type": "head_to_head", "cap": null, "text": "Head to head (two teams tied only)"},
        {"type": "run_diff", "cap": 8, "text": "Run differential, max 8 runs per game"},
        {"type": "runs_allowed", "cap": null, "text": "Fewest runs allowed"},
        {"type": "coin_flip", "cap": null, "text": "Coin flip"}]'::jsonb,
      true, 'Pool play seeds the bracket. All teams advance.')
    returning id into v_rules;

    insert into public.tournament (team_id, season_id, name, organization, start_date, end_date,
      city, venues, division, places, tiebreak_set_id, seeding)
    values (v_team.id, v_team.season_id, 'Cajun Fall Classic', 'Bayou Select Baseball',
      v_today - 1, v_today + 1, 'Lafayette, LA', array['Acadiana Sports Complex'], v_team.age_group,
      '[{"name": "Acadiana Sports Complex", "address": "Lafayette, LA", "lat": 30.2241, "lng": -92.0198, "placeId": null}]'::jsonb,
      v_rules, 'pool')
    returning id into v_tourney;

    -- Eight teams in two pools: us and seven others.
    v_ids := '{}';
    foreach v_name in array (v_team.name || v_others) loop
      insert into public.tournament_team (tournament_id, name, hometown, class_label, is_us, source)
      values (v_tourney, v_name,
        case v_name when 'Acadiana Storm' then 'Lafayette, LA' when 'Lake Charles Lightning' then 'Lake Charles, LA'
          when 'Houma Hurricanes' then 'Houma, LA' when 'Baton Rouge Bandits' then 'Baton Rouge, LA'
          when 'Lafayette Mudcats' then 'Lafayette, LA' when 'Gonzales Gators' then 'Gonzales, LA'
          when 'Thibodaux Thunder' then 'Thibodaux, LA' else 'Baton Rouge, LA' end,
        'AA', v_name = v_team.name, 'screenshot')
      returning id into v_id;
      v_ids := v_ids || jsonb_build_object(v_name, v_id);
    end loop;

    -- Our pool game tonight: a team game too (Games, map, forecast, Auto-fill).
    insert into public.game (season_id, game_date, start_time, opponent, location, field, innings,
      field_players, status, location_address, location_lat, location_lng)
    values (v_team.season_id, v_today, '17:00', 'Houma Hurricanes', 'Acadiana Sports Complex',
      'Field 3', 6, case when v_team.coach_pitch then 10 else 9 end, 'scheduled', 'Lafayette, LA', 30.2241, -92.0198)
    returning id into v_game;

    -- Pool play: yesterday's two rounds are final; tonight's round 3 isn't played yet.
    insert into public.tournament_game (tournament_id, game_no, stage, pool, round, game_date, start_time,
      venue, field, home, away, home_team_id, away_team_id, score_home, score_away, reported_at, locked, game_id)
    select v_tourney, g.no, 'pool', g.pool, null, v_today + g.day, g.t::time, 'Acadiana Sports Complex', g.field,
      replace(g.home, 'US', v_team.name), replace(g.away, 'US', v_team.name),
      (v_ids ->> replace(g.home, 'US', v_team.name))::uuid, (v_ids ->> replace(g.away, 'US', v_team.name))::uuid,
      g.sh, g.sa,
      case when g.sh is null then null else now() - interval '20 hours' end, false,
      case when g.no = '9' then v_game end
    from (values
      -- no, pool, day, time, field, home, away, home score, away score ('US' is our team)
      ('1',  'A', -1, '17:30', 'Field 3', 'US',                     'Acadiana Storm',         7,    4),
      ('2',  'A', -1, '17:30', 'Field 4', 'Lake Charles Lightning', 'Houma Hurricanes',       9,    2),
      ('3',  'B', -1, '17:30', 'Field 1', 'Baton Rouge Bandits',    'Lafayette Mudcats',      3,    5),
      ('4',  'B', -1, '17:30', 'Field 2', 'Gonzales Gators',        'Thibodaux Thunder',      6,    5),
      ('5',  'A', -1, '19:30', 'Field 3', 'Lake Charles Lightning', 'US',                     6,    5),
      ('6',  'A', -1, '19:30', 'Field 4', 'Acadiana Storm',         'Houma Hurricanes',       8,    3),
      ('7',  'B', -1, '19:30', 'Field 1', 'Lafayette Mudcats',      'Gonzales Gators',        4,    2),
      ('8',  'B', -1, '19:30', 'Field 2', 'Thibodaux Thunder',      'Baton Rouge Bandits',    1,    8),
      ('9',  'A',  0, '17:00', 'Field 3', 'US',                     'Houma Hurricanes',       null, null),
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
  end loop;
end;
$$;
revoke execute on function public.fill_demo_tournaments(uuid) from public, anon, authenticated;

-- Build the club, then fill its Chatter and tournaments (each once).
create or replace function public.start_demo_club()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_built jsonb := public.build_demo_club();
  v_org uuid := (v_built ->> 'club')::uuid;
begin
  if not exists (select 1 from public.club_coach_post where organization_id = v_org) then
    perform public.fill_demo_chatter(v_org);
  end if;
  perform public.fill_demo_tournaments(v_org);
  return v_built;
end;
$$;
