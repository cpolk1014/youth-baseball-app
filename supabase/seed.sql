-- Local/dev seed data: one team, 12 players, one season with default rules, two games.
-- Never run against production. Fixed UUIDs keep it repeatable.
--
-- RLS hides teams from anyone who isn't a member. After signing up, make yourself the
-- coach (run in the SQL editor, which bypasses RLS):
--
--   insert into public.member (team_id, user_id, role)
--   select '00000000-0000-4000-8000-000000000001', id, 'coach'
--   from auth.users where email = 'you@example.com';

insert into public.team (id, name, age_group, colors, created_by) values
  ('00000000-0000-4000-8000-000000000001', 'Riverside Rattlers', '10U', '{navy,gold}', null);

-- fair_play_rules mirrors DEFAULT_RULE_CONFIG in src/lib/rules/config.ts.
insert into public.season (id, team_id, name, start_date, end_date, fair_play_rules) values (
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000001',
  'Fall 2026',
  '2026-09-05',
  '2026-11-15',
  '{
    "fieldPositions": ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"],
    "infieldPositions": ["P", "C", "1B", "2B", "3B", "SS"],
    "maxConsecutiveBench": 1,
    "benchRotation": true,
    "minInfieldInnings": 1,
    "maxInningsSamePosition": 2,
    "maxInningsPitched": 2,
    "catcherCannotPitch": true,
    "seasonBalanceThreshold": 3
  }'
);

-- First name + last initial only: players are minors.
insert into public.player
  (id, team_id, name, jersey_number, preferred_positions, can_pitch, can_catch)
values
  ('00000000-0000-4000-8000-000000001001', '00000000-0000-4000-8000-000000000001', 'Mason R.', 2, '{SS,P}', true, false),
  ('00000000-0000-4000-8000-000000001002', '00000000-0000-4000-8000-000000000001', 'Leo T.', 5, '{P,3B}', true, false),
  ('00000000-0000-4000-8000-000000001003', '00000000-0000-4000-8000-000000000001', 'Eli M.', 7, '{C}', false, true),
  ('00000000-0000-4000-8000-000000001004', '00000000-0000-4000-8000-000000000001', 'Owen K.', 9, '{P,1B}', true, false),
  ('00000000-0000-4000-8000-000000001005', '00000000-0000-4000-8000-000000000001', 'Jack D.', 11, '{C,3B}', false, true),
  ('00000000-0000-4000-8000-000000001006', '00000000-0000-4000-8000-000000000001', 'Theo B.', 12, '{2B,SS}', false, false),
  ('00000000-0000-4000-8000-000000001007', '00000000-0000-4000-8000-000000000001', 'Lucas W.', 14, '{CF,LF}', false, false),
  ('00000000-0000-4000-8000-000000001008', '00000000-0000-4000-8000-000000000001', 'Sam P.', 17, '{}', false, false),
  ('00000000-0000-4000-8000-000000001009', '00000000-0000-4000-8000-000000000001', 'Noah G.', 21, '{1B,RF}', true, true),
  ('00000000-0000-4000-8000-000000001010', '00000000-0000-4000-8000-000000000001', 'Ezra L.', 23, '{LF}', false, false),
  ('00000000-0000-4000-8000-000000001011', '00000000-0000-4000-8000-000000000001', 'Miles H.', 27, '{}', false, false),
  ('00000000-0000-4000-8000-000000001012', '00000000-0000-4000-8000-000000000001', 'Caleb S.', 33, '{2B,RF}', false, false);

insert into public.game (id, season_id, game_date, start_time, opponent, location, innings) values
  ('00000000-0000-4000-8000-000000010001', '00000000-0000-4000-8000-000000000101',
   '2026-10-24', '09:00', 'Lakeside Lightning', 'Memorial Park Field 2', 6),
  ('00000000-0000-4000-8000-000000010002', '00000000-0000-4000-8000-000000000101',
   '2026-10-25', '13:30', 'Northside Nationals', 'Northside Complex Field 4', 4);
