-- RLS and integrity tests. Run with: npm run test:db
\set ON_ERROR_STOP on
\set QUIET on
insert into auth.users values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'coach@example.test'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'parent@example.test'),
  ('aaaaaaaa-0000-4000-8000-000000000003', 'outsider@example.test');
insert into public.member (team_id, user_id, role) values
  ('00000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'coach'),
  ('00000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000002', 'parent');

create function pg_temp.expect(cond boolean, label text) returns void language plpgsql as
  $$ begin if not cond then raise exception 'FAIL: %', label using errcode = 'T0001'; end if;
     raise notice 'ok: %', label; end $$;
grant execute on function pg_temp.expect(boolean, text) to anon, authenticated;

-- ── Signed out ──
set role anon;
select pg_temp.expect((select count(*) from public.team) = 0, 'anon sees no teams');
select pg_temp.expect((select count(*) from public.player) = 0, 'anon sees no players');
reset role;

-- ── Coach ──
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
select pg_temp.expect((select count(*) from public.team) = 1, 'coach sees their team');
select pg_temp.expect((select count(*) from public.player) = 12, 'coach sees 12 players');
select pg_temp.expect((select count(*) from public.game) = 2, 'coach sees 2 games');
select pg_temp.expect((select count(*) from public.member) = 2, 'coach sees both members');

insert into public.lineup (id, game_id, batting_order) values
  ('bbbbbbbb-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000010002',
   array['00000000-0000-4000-8000-000000001001', '00000000-0000-4000-8000-000000001002']::uuid[]);
insert into public.lineup_slot (lineup_id, inning, player_id, position) values
  ('bbbbbbbb-0000-4000-8000-000000000001', 1, '00000000-0000-4000-8000-000000001001', 'P'),
  ('bbbbbbbb-0000-4000-8000-000000000001', 2, '00000000-0000-4000-8000-000000001001', 'P'),
  ('bbbbbbbb-0000-4000-8000-000000000001', 1, '00000000-0000-4000-8000-000000001002', 'BENCH'),
  ('bbbbbbbb-0000-4000-8000-000000000001', 2, '00000000-0000-4000-8000-000000001002', 'SS');
select pg_temp.expect(true, 'coach saves a lineup with slots');

do $$ begin
  insert into public.lineup_slot values ('bbbbbbbb-0000-4000-8000-000000000001', 5, '00000000-0000-4000-8000-000000001003', 'LF');
  raise exception 'should have failed' using errcode = 'T0001';
exception when raise_exception then raise notice 'ok: inning 5 rejected in a 4-inning game (%)', sqlerrm;
end $$;

do $$ begin
  insert into public.lineup_slot values ('bbbbbbbb-0000-4000-8000-000000000001', 3, '00000000-0000-4000-8000-000000001001', 'P'),
                                        ('bbbbbbbb-0000-4000-8000-000000000001', 3, '00000000-0000-4000-8000-000000001001', 'SS');
  raise exception 'should have failed' using errcode = 'T0001';
exception when unique_violation then raise notice 'ok: one slot per player per inning';
end $$;

do $$ begin
  insert into public.player (team_id, name) values ('00000000-0000-4000-8000-000000000001', '  ');
  raise exception 'should have failed' using errcode = 'T0001';
exception when check_violation then raise notice 'ok: blank player name rejected';
end $$;

do $$ begin
  insert into public.player (team_id, name, preferred_positions) values ('00000000-0000-4000-8000-000000000001', 'X', '{BENCH}');
  raise exception 'should have failed' using errcode = 'T0001';
exception when check_violation then raise notice 'ok: BENCH is not a preferred position';
end $$;

-- Second version of the lineup; game becomes final. Participation uses version 2 only.
insert into public.lineup (id, game_id, batting_order, version) values
  ('bbbbbbbb-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000010002', '{}', 2);
insert into public.lineup_slot values
  ('bbbbbbbb-0000-4000-8000-000000000002', 1, '00000000-0000-4000-8000-000000001001', 'SS'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 2, '00000000-0000-4000-8000-000000001001', 'SS'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 3, '00000000-0000-4000-8000-000000001001', 'BENCH');
select pg_temp.expect((select count(*) from public.player_participation) = 0, 'no participation until the game is final');
update public.game set status = 'final' where id = '00000000-0000-4000-8000-000000010002';
select pg_temp.expect(
  (select jsonb_object_agg(position, innings) from public.player_participation
   where player_id = '00000000-0000-4000-8000-000000001001') = '{"SS": 2, "BENCH": 1}',
  'participation derived from the current lineup version of final games');
reset role;

-- ── Parent: read-only ──
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000002', false);
select pg_temp.expect((select count(*) from public.player) = 12, 'parent can read the roster');
select pg_temp.expect((select count(*) from public.lineup_slot) = 7, 'parent can read lineups');
select pg_temp.expect((select count(*) from public.player_participation) = 2, 'parent can read participation');
do $$ begin
  insert into public.player (team_id, name) values ('00000000-0000-4000-8000-000000000001', 'Sneaky');
  raise exception 'should have failed' using errcode = 'T0001';
exception when insufficient_privilege then raise notice 'ok: parent cannot add players';
end $$;
update public.player set name = 'Changed' where team_id = '00000000-0000-4000-8000-000000000001';
select pg_temp.expect((select count(*) from public.player where name = 'Changed') = 0, 'parent cannot edit players');
do $$ begin
  insert into public.member (team_id, user_id, role) values ('00000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000002', 'coach');
  raise exception 'should have failed' using errcode = 'T0001';
exception when insufficient_privilege then raise notice 'ok: parent cannot promote themself to coach';
end $$;
reset role;

-- ── Outsider ──
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000003', false);
select pg_temp.expect((select count(*) from public.team) = 0, 'outsider sees no teams');
select pg_temp.expect((select count(*) from public.player) = 0, 'outsider sees no players');
select pg_temp.expect((select count(*) from public.lineup_slot) = 0, 'outsider sees no lineups');
select pg_temp.expect((select count(*) from public.player_participation) = 0, 'outsider sees no participation');
do $$ begin
  insert into public.member (team_id, user_id, role) values ('00000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000003', 'coach');
  raise exception 'should have failed' using errcode = 'T0001';
exception when insufficient_privilege then raise notice 'ok: outsider cannot join a team';
end $$;
delete from public.team;
update public.season set name = 'hacked';
reset role;
select pg_temp.expect((select count(*) from public.team) = 1 and (select name from public.season) = 'Fall 2026', 'outsider cannot delete or edit another team');

-- Outsider creates their own team (insert ... returning, as supabase-js does).
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000003', false);
insert into public.team (id, name, age_group) values ('cccccccc-0000-4000-8000-000000000001', 'Other Team', '12U') returning id;
select pg_temp.expect((select count(*) from public.team) = 1 and (select name from public.team) = 'Other Team', 'new team creator sees only their own team');
select pg_temp.expect((select role from public.member where team_id = 'cccccccc-0000-4000-8000-000000000001') = 'coach', 'creator becomes coach');
insert into public.season (id, team_id, name) values ('cccccccc-0000-4000-8000-000000000101', 'cccccccc-0000-4000-8000-000000000001', 'S');
insert into public.game (id, season_id, game_date, opponent) values ('cccccccc-0000-4000-8000-000000010001', 'cccccccc-0000-4000-8000-000000000101', '2026-11-01', 'X');
insert into public.lineup (id, game_id) values ('cccccccc-0000-4000-8000-0000000a0001', 'cccccccc-0000-4000-8000-000000010001');
do $$ begin
  insert into public.lineup_slot values ('cccccccc-0000-4000-8000-0000000a0001', 1, '00000000-0000-4000-8000-000000001001', 'P');
  raise exception 'should have failed' using errcode = 'T0001';
exception when raise_exception then raise notice 'ok: cannot put another team''s player in your lineup';
end $$;
do $$ begin
  insert into public.lineup (game_id, batting_order, version) values ('cccccccc-0000-4000-8000-000000010001', '{00000000-0000-4000-8000-000000001001}', 2);
  raise exception 'should have failed' using errcode = 'T0001';
exception when raise_exception then raise notice 'ok: cannot bat another team''s player';
end $$;
do $$ begin
  insert into public.game (season_id, game_date, opponent) values ('00000000-0000-4000-8000-000000000101', '2026-11-01', 'X');
  raise exception 'should have failed' using errcode = 'T0001';
exception when insufficient_privilege then raise notice 'ok: cannot add games to another team''s season';
end $$;
reset role;
\echo ALL RLS TESTS PASSED
