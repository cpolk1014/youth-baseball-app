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
  $$ begin if cond is not true then raise exception 'FAIL: %', label using errcode = 'T0001'; end if;
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
select pg_temp.expect((select role from public.member where team_id = 'cccccccc-0000-4000-8000-000000000001') = 'owner', 'creator becomes the owner');
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

-- ── save_lineup ──
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
update public.game set status = 'scheduled' where id = '00000000-0000-4000-8000-000000010001';
select public.save_lineup(
  '00000000-0000-4000-8000-000000010001',
  array['00000000-0000-4000-8000-000000001001', '00000000-0000-4000-8000-000000001002']::uuid[],
  '[{"inning": 1, "player_id": "00000000-0000-4000-8000-000000001001", "position": "P"},
    {"inning": 1, "player_id": "00000000-0000-4000-8000-000000001002", "position": "BENCH"}]'
) is not null as saved \gset
select pg_temp.expect(
  (select count(*) from public.lineup where game_id = '00000000-0000-4000-8000-000000010001') = 1
  and (select count(*) from public.lineup_slot ls join public.lineup l on l.id = ls.lineup_id
       where l.game_id = '00000000-0000-4000-8000-000000010001') = 2,
  'coach saves a new lineup with slots in one call');
select public.save_lineup(
  '00000000-0000-4000-8000-000000010001',
  array['00000000-0000-4000-8000-000000001002']::uuid[],
  '[{"inning": 2, "player_id": "00000000-0000-4000-8000-000000001002", "position": "SS"}]'
) is not null as saved \gset
select pg_temp.expect(
  (select count(*) from public.lineup where game_id = '00000000-0000-4000-8000-000000010001') = 1
  and (select array_agg(position::text) from public.lineup_slot ls join public.lineup l on l.id = ls.lineup_id
       where l.game_id = '00000000-0000-4000-8000-000000010001') = '{SS}'
  and (select batting_order from public.lineup where game_id = '00000000-0000-4000-8000-000000010001')
      = '{00000000-0000-4000-8000-000000001002}',
  'saving again replaces the lineup in place');
do $$ begin
  perform public.save_lineup('00000000-0000-4000-8000-000000010001', '{}',
    '[{"inning": 1, "player_id": "cccccccc-0000-4000-8000-000000000999", "position": "P"}]');
  raise exception 'should have failed' using errcode = 'T0001';
exception when foreign_key_violation or raise_exception then raise notice 'ok: save_lineup rejects players from elsewhere';
end $$;
select pg_temp.expect(
  (select count(*) from public.lineup_slot ls join public.lineup l on l.id = ls.lineup_id
   where l.game_id = '00000000-0000-4000-8000-000000010001') = 1,
  'a failed save leaves the previous lineup untouched');
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000002', false);
do $$ begin
  perform public.save_lineup('00000000-0000-4000-8000-000000010001', '{}', '[]');
  raise exception 'should have failed' using errcode = 'T0001';
exception when insufficient_privilege then raise notice 'ok: parent cannot save lineups';
end $$;
reset role;

set role anon;
do $$ begin
  perform public.save_lineup('00000000-0000-4000-8000-000000010001', '{}', '[]');
  raise exception 'should have failed' using errcode = 'T0001';
exception when insufficient_privilege then raise notice 'ok: signed-out users cannot call save_lineup';
end $$;
reset role;

-- ── coach pitch, field players, not batting ──
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
update public.team set coach_pitch = true where id = '00000000-0000-4000-8000-000000000001';
select pg_temp.expect((select coach_pitch from public.team where id = '00000000-0000-4000-8000-000000000001'), 'coach can turn on coach''s pitch');
update public.game set field_players = 10 where id = '00000000-0000-4000-8000-000000010001';
select pg_temp.expect((select field_players from public.game where id = '00000000-0000-4000-8000-000000010001') = 10, 'a game can have 10 field players');
do $$ begin
  update public.game set field_players = 11 where id = '00000000-0000-4000-8000-000000010001';
  raise exception 'should have failed' using errcode = 'T0001';
exception when check_violation then raise notice 'ok: field players must be 9 or 10';
end $$;
select public.save_lineup(
  '00000000-0000-4000-8000-000000010001',
  array['00000000-0000-4000-8000-000000001001']::uuid[],
  '[{"inning": 1, "player_id": "00000000-0000-4000-8000-000000001002", "position": "LCF"}]',
  array['00000000-0000-4000-8000-000000001002']::uuid[]
) is not null as saved \gset
select pg_temp.expect(
  (select not_batting from public.lineup where game_id = '00000000-0000-4000-8000-000000010001')
    = '{00000000-0000-4000-8000-000000001002}',
  'save_lineup stores players sitting out of the batting order');
do $$ begin
  perform public.save_lineup('00000000-0000-4000-8000-000000010001',
    array['00000000-0000-4000-8000-000000001001']::uuid[], '[]',
    array['00000000-0000-4000-8000-000000001001']::uuid[]);
  raise exception 'should have failed' using errcode = 'T0001';
exception when raise_exception then raise notice 'ok: a player cannot be both batting and not batting';
end $$;
do $$ begin
  perform public.save_lineup('00000000-0000-4000-8000-000000010001', '{}', '[]',
    array['cccccccc-0000-4000-8000-000000000999']::uuid[]);
  raise exception 'should have failed' using errcode = 'T0001';
exception when raise_exception then raise notice 'ok: not-batting players must be on the team';
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000002', false);
update public.team set coach_pitch = false where id = '00000000-0000-4000-8000-000000000001';
reset role;
select pg_temp.expect((select coach_pitch from public.team where id = '00000000-0000-4000-8000-000000000001'), 'parent cannot change coach''s pitch');

-- ── absent players ──
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
select public.save_lineup(
  '00000000-0000-4000-8000-000000010001',
  array['00000000-0000-4000-8000-000000001001']::uuid[],
  '[{"inning": 1, "player_id": "00000000-0000-4000-8000-000000001001", "position": "P"}]',
  '{}',
  array['00000000-0000-4000-8000-000000001003']::uuid[]
) is not null as saved \gset
select pg_temp.expect(
  (select absent from public.lineup where game_id = '00000000-0000-4000-8000-000000010001')
    = '{00000000-0000-4000-8000-000000001003}',
  'save_lineup stores absent players');
do $$ begin
  perform public.save_lineup('00000000-0000-4000-8000-000000010001',
    array['00000000-0000-4000-8000-000000001003']::uuid[], '[]', '{}',
    array['00000000-0000-4000-8000-000000001003']::uuid[]);
  raise exception 'should have failed' using errcode = 'T0001';
exception when raise_exception then raise notice 'ok: an absent player cannot bat';
end $$;
do $$ begin
  perform public.save_lineup('00000000-0000-4000-8000-000000010001', '{}',
    '[{"inning": 1, "player_id": "00000000-0000-4000-8000-000000001003", "position": "C"}]', '{}',
    array['00000000-0000-4000-8000-000000001003']::uuid[]);
  raise exception 'should have failed' using errcode = 'T0001';
exception when raise_exception then raise notice 'ok: an absent player cannot have a position';
end $$;
select public.save_lineup(
  '00000000-0000-4000-8000-000000010001',
  array['00000000-0000-4000-8000-000000001003']::uuid[],
  '[{"inning": 1, "player_id": "00000000-0000-4000-8000-000000001003", "position": "C"}]'
) is not null as saved \gset
select pg_temp.expect(
  (select absent from public.lineup where game_id = '00000000-0000-4000-8000-000000010001') = '{}',
  'marking a player present again lets them bat and field');
reset role;

-- ── invites ──
insert into auth.users values ('aaaaaaaa-0000-4000-8000-000000000004', 'newparent@example.test'),
                              ('aaaaaaaa-0000-4000-8000-000000000005', 'newcoach@example.test');
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
insert into public.invite (team_id, role, token) values
  ('00000000-0000-4000-8000-000000000001', 'parent', 'parent-token-0123456789abcdef0123456789'),
  ('00000000-0000-4000-8000-000000000001', 'coach', 'coach-token-0123456789abcdef01234567890');
update public.invite set max_uses = 1 where token like 'coach-token%';
select pg_temp.expect((select count(*) from public.invite) = 2, 'coach creates invite links');
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000002', false);
select pg_temp.expect((select count(*) from public.invite) = 0, 'parents cannot see invite links');
do $$ begin
  insert into public.invite (team_id, role, token) values ('00000000-0000-4000-8000-000000000001', 'coach', 'sneaky-token-0123456789abcdef012345678');
  raise exception 'should have failed' using errcode = 'T0001';
exception when insufficient_privilege then raise notice 'ok: parents cannot create invites';
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000004', false);
select pg_temp.expect((select count(*) from public.team) = 0, 'before joining, the team is hidden');
select pg_temp.expect(
  (select team_name = 'Riverside Rattlers' and role = 'parent' and valid and not already_member
   from public.invite_preview('parent-token-0123456789abcdef0123456789')),
  'invite preview shows team name and role');
select pg_temp.expect((select count(*) from public.invite_preview('wrong-token')) = 0, 'unknown tokens reveal nothing');
select public.accept_invite('parent-token-0123456789abcdef0123456789', '  Sam''s mom ') is not null as joined \gset
select pg_temp.expect((select count(*) from public.player) = 12, 'after joining, the parent sees the roster');
select pg_temp.expect(
  (select role = 'parent' and display_name = 'Sam''s mom' from public.member where user_id = 'aaaaaaaa-0000-4000-8000-000000000004'),
  'joined as parent with their name');
select public.accept_invite('parent-token-0123456789abcdef0123456789', 'again') is not null as joined \gset
select pg_temp.expect((select count(*) from public.member where user_id = 'aaaaaaaa-0000-4000-8000-000000000004') = 1, 'accepting twice does not duplicate');
do $$ begin
  insert into public.player (team_id, name) values ('00000000-0000-4000-8000-000000000001', 'Nope');
  raise exception 'should have failed' using errcode = 'T0001';
exception when insufficient_privilege then raise notice 'ok: a joined parent still cannot edit';
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000005', false);
select public.accept_invite('coach-token-0123456789abcdef01234567890', 'Coach Dave') is not null as joined \gset
select pg_temp.expect((select role from public.member where user_id = 'aaaaaaaa-0000-4000-8000-000000000005') = 'coach', 'coach link makes a coach');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000003', false);
do $$ begin
  perform public.accept_invite('coach-token-0123456789abcdef01234567890', 'Sneaky');
  raise exception 'should have failed' using errcode = 'T0001';
exception when no_data_found then raise notice 'ok: a single-use coach link cannot be reused';
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
update public.invite set revoked_at = now() where token like 'parent-token%';
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000003', false);
select pg_temp.expect(not (select valid from public.invite_preview('parent-token-0123456789abcdef0123456789')), 'revoked links show as invalid');
do $$ begin
  perform public.accept_invite('parent-token-0123456789abcdef0123456789', 'Late');
  raise exception 'should have failed' using errcode = 'T0001';
exception when no_data_found then raise notice 'ok: revoked links cannot be used';
end $$;
reset role;

set role anon;
do $$ begin
  perform public.accept_invite('parent-token-0123456789abcdef0123456789', 'x');
  raise exception 'should have failed' using errcode = 'T0001';
exception when insufficient_privilege then raise notice 'ok: signed-out users cannot accept invites';
end $$;
reset role;

-- ── keep a coach ──
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
delete from public.member where user_id = 'aaaaaaaa-0000-4000-8000-000000000005';
select pg_temp.expect((select count(*) from public.member where role = 'coach' and team_id = '00000000-0000-4000-8000-000000000001') = 1, 'coach removes the other coach');
do $$ begin
  update public.member set role = 'parent' where user_id = 'aaaaaaaa-0000-4000-8000-000000000001' and team_id = '00000000-0000-4000-8000-000000000001';
  raise exception 'should have failed' using errcode = 'T0001';
exception when raise_exception then raise notice 'ok: the last coach cannot demote themself';
end $$;
do $$ begin
  delete from public.member where user_id = 'aaaaaaaa-0000-4000-8000-000000000001' and team_id = '00000000-0000-4000-8000-000000000001';
  raise exception 'should have failed' using errcode = 'T0001';
exception when raise_exception then raise notice 'ok: the last coach cannot leave';
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000003', false);
delete from public.team where id = 'cccccccc-0000-4000-8000-000000000001';
select pg_temp.expect((select count(*) from public.team) = 1, 'an active team cannot be deleted');
update public.team set optioned_at = now() where id = 'cccccccc-0000-4000-8000-000000000001';
select pg_temp.expect((select optioned_at is not null from public.team), 'coach options their team');
delete from public.team where id = 'cccccccc-0000-4000-8000-000000000001';
select pg_temp.expect((select count(*) from public.team) = 0, 'a coach can delete an optioned team');
reset role;

-- ── delete team (as the app does: delete ... returning id) ──
insert into public.team (id, name, age_group, created_by, optioned_at) values ('dddddddd-0000-4000-8000-000000000001', 'Delete Me', '9U', null, now());
insert into public.member (team_id, user_id, role) values ('dddddddd-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000005', 'coach'),
                                                          ('dddddddd-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000004', 'parent');
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000004', false);
do $$ declare n int; begin
  with d as (delete from public.team where id = 'dddddddd-0000-4000-8000-000000000001' returning id)
  select count(*) into n from d;
  perform pg_temp.expect(n = 0, 'a parent cannot delete the team');
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000005', false);
do $$ declare n int; begin
  with d as (delete from public.team where id = 'dddddddd-0000-4000-8000-000000000001' returning id)
  select count(*) into n from d;
  perform pg_temp.expect(n = 1, 'a coach (not the creator) deletes the team and gets its id back');
end $$;
reset role;
select pg_temp.expect(
  (select count(*) from public.member where team_id = 'dddddddd-0000-4000-8000-000000000001') = 0,
  'deleting a team removes its members');

-- ── option / call up ──
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000002', false);
update public.team set optioned_at = now() where id = '00000000-0000-4000-8000-000000000001';
reset role;
select pg_temp.expect((select optioned_at is null from public.team where id = '00000000-0000-4000-8000-000000000001'), 'a parent cannot option the team');
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
update public.team set optioned_at = now() where id = '00000000-0000-4000-8000-000000000001';
select pg_temp.expect((select count(*) from public.player) = 12, 'an optioned team is still readable');
update public.team set optioned_at = null where id = '00000000-0000-4000-8000-000000000001';
select pg_temp.expect((select optioned_at is null from public.team where id = '00000000-0000-4000-8000-000000000001'), 'coach calls the team back up');
reset role;

-- ── practices ──
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
insert into public.practice (id, season_id, practice_date, start_time, end_time, location, focus, plan) values
  ('eeeeeeee-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101', '2026-11-03', '18:00', '19:30', 'Field 3', 'Infield',
   '[{"id": "a", "title": "Dynamic warm-up", "minutes": 10}]');
select pg_temp.expect((select count(*) from public.practice) = 1, 'coach schedules a practice with a plan');
do $$ begin
  insert into public.practice (season_id, practice_date, start_time, end_time) values ('00000000-0000-4000-8000-000000000101', '2026-11-04', '19:00', '18:00');
  raise exception 'should have failed' using errcode = 'T0001';
exception when check_violation then raise notice 'ok: a practice cannot end before it starts';
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000004', false);
select pg_temp.expect((select focus from public.practice) = 'Infield', 'parents can see practices');
update public.practice set focus = 'Nap time';
select pg_temp.expect((select focus from public.practice) = 'Infield', 'parents cannot edit practices');
do $$ begin
  insert into public.practice (season_id, practice_date) values ('00000000-0000-4000-8000-000000000101', '2026-11-05');
  raise exception 'should have failed' using errcode = 'T0001';
exception when insufficient_privilege then raise notice 'ok: parents cannot add practices';
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000003', false);
select pg_temp.expect((select count(*) from public.practice) = 0, 'outsiders cannot see practices');
reset role;
-- ── plays: practice situations, assignments, quiz results ──
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
update public.practice set plays = '{steal-second,rundown}';
select pg_temp.expect((select plays from public.practice) = '{steal-second,rundown}', 'coach adds plays to a practice');
insert into public.play_assignment (id, team_id, title, play_ids, due_date) values
  ('ffffffff-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Bunt defense', '{bunt-pitcher,bunt-catcher}', '2026-11-10');
select pg_temp.expect((select created_by from public.play_assignment) = 'aaaaaaaa-0000-4000-8000-000000000001', 'assignment records who made it');
do $$ begin
  insert into public.play_assignment (team_id, title, play_ids) values ('00000000-0000-4000-8000-000000000001', 'Empty', '{}');
  raise exception 'should have failed' using errcode = 'T0001';
exception when check_violation then raise notice 'ok: an assignment needs at least one play';
end $$;
insert into public.quiz_result (assignment_id, correct, total) values ('ffffffff-0000-4000-8000-000000000001', 4, 5);
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000004', false);
select pg_temp.expect((select count(*) from public.play_assignment) = 1, 'parents see assignments');
select pg_temp.expect((select count(*) from public.quiz_result) = 0, 'parents do not see other families'' results');
insert into public.quiz_result (assignment_id, player_id, correct, total) values
  ('ffffffff-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001001', 5, 5);
select pg_temp.expect((select count(*) from public.quiz_result) = 1, 'parents record and see their own result');
do $$ begin
  insert into public.quiz_result (assignment_id, user_id, correct, total) values
    ('ffffffff-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 5, 5);
  raise exception 'should have failed' using errcode = 'T0001';
exception when insufficient_privilege then raise notice 'ok: parents cannot record results as someone else';
end $$;
do $$ begin
  insert into public.quiz_result (assignment_id, correct, total) values ('ffffffff-0000-4000-8000-000000000001', 6, 5);
  raise exception 'should have failed' using errcode = 'T0001';
exception when check_violation then raise notice 'ok: score cannot beat the total';
end $$;
do $$ begin
  insert into public.play_assignment (team_id, title, play_ids) values ('00000000-0000-4000-8000-000000000001', 'Mine', '{rundown}');
  raise exception 'should have failed' using errcode = 'T0001';
exception when insufficient_privilege then raise notice 'ok: parents cannot assign plays';
end $$;
update public.practice set plays = '{}';
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
select pg_temp.expect((select plays from public.practice) = '{steal-second,rundown}', 'parents cannot change practice plays');
select pg_temp.expect((select count(*) from public.quiz_result) = 2, 'coach sees every family''s result');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000003', false);
select pg_temp.expect((select count(*) from public.play_assignment) = 0, 'outsiders cannot see assignments');
do $$ begin
  insert into public.quiz_result (assignment_id, correct, total) values ('ffffffff-0000-4000-8000-000000000001', 1, 1);
  raise exception 'should have failed' using errcode = 'T0001';
exception when insufficient_privilege then raise notice 'ok: outsiders cannot record results';
end $$;
reset role;
-- ── parent ↔ player links ──
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000004', false);
insert into public.player_guardian (player_id, user_id) values
  ('00000000-0000-4000-8000-000000001001', 'aaaaaaaa-0000-4000-8000-000000000004'),
  ('00000000-0000-4000-8000-000000001002', 'aaaaaaaa-0000-4000-8000-000000000004');
select pg_temp.expect((select count(*) from public.player_guardian) = 2, 'a parent links themselves to two kids');
do $$ begin
  insert into public.player_guardian (player_id, user_id) values
    ('00000000-0000-4000-8000-000000001003', 'aaaaaaaa-0000-4000-8000-000000000002');
  raise exception 'should have failed' using errcode = 'T0001';
exception when insufficient_privilege then raise notice 'ok: parents cannot link other people';
end $$;
delete from public.player_guardian where player_id = '00000000-0000-4000-8000-000000001002';
select pg_temp.expect((select count(*) from public.player_guardian) = 1, 'a parent unlinks themselves');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
insert into public.player_guardian (player_id, user_id) values
  ('00000000-0000-4000-8000-000000001003', 'aaaaaaaa-0000-4000-8000-000000000002');
select pg_temp.expect((select count(*) from public.player_guardian) = 2, 'coach links a parent and sees every link');
do $$ begin
  insert into public.player_guardian (player_id, user_id) values
    ('00000000-0000-4000-8000-000000001003', 'aaaaaaaa-0000-4000-8000-000000000003');
  raise exception 'should have failed' using errcode = 'T0001';
exception when insufficient_privilege then raise notice 'ok: coach cannot link someone off the team';
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000002', false);
select pg_temp.expect((select count(*) from public.player_guardian) = 1, 'parents see only their own links');
delete from public.player_guardian where user_id = 'aaaaaaaa-0000-4000-8000-000000000004';
reset role;
select pg_temp.expect((select count(*) from public.player_guardian where user_id = 'aaaaaaaa-0000-4000-8000-000000000004') = 1, 'parents cannot unlink other families');
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000003', false);
select pg_temp.expect((select count(*) from public.player_guardian) = 0, 'outsiders see no links');
do $$ begin
  insert into public.player_guardian (player_id, user_id) values
    ('00000000-0000-4000-8000-000000001001', 'aaaaaaaa-0000-4000-8000-000000000003');
  raise exception 'should have failed' using errcode = 'T0001';
exception when insufficient_privilege then raise notice 'ok: outsiders cannot link themselves to a kid';
end $$;
reset role;
delete from public.member where user_id = 'aaaaaaaa-0000-4000-8000-000000000004' and team_id = '00000000-0000-4000-8000-000000000001';
select pg_temp.expect((select count(*) from public.player_guardian where user_id = 'aaaaaaaa-0000-4000-8000-000000000004') = 0, 'leaving the team drops a parent''s links');
-- ── team money ──
insert into auth.users values
  ('aaaaaaaa-0000-4000-8000-000000000006', 'treasurer@example.test'),
  ('aaaaaaaa-0000-4000-8000-000000000007', 'manager@example.test');
insert into public.member (team_id, user_id, role) values
  ('00000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000006', 'treasurer'),
  ('00000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000007', 'manager');
insert into public.team (id, name, age_group) values ('99999999-0000-4000-8000-000000000001', 'Elsewhere', '12U');
insert into public.player (id, team_id, name) values ('99999999-0000-4000-8000-000000001001', '99999999-0000-4000-8000-000000000001', 'Not ours');
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
select public.save_finance_entry(
  '{"id": "f0000000-0000-4000-8000-000000000001", "season_id": "00000000-0000-4000-8000-000000000101", "type": "bat_around", "title": "Pigeon Forge", "amount_cents": 3001, "entry_date": "2027-01-01", "due_dates": ["2027-01-15", "2027-02-15"]}',
  '[{"player_id": "00000000-0000-4000-8000-000000001001", "amount_cents": 1000}, {"player_id": "00000000-0000-4000-8000-000000001002", "amount_cents": 1000}, {"player_id": "00000000-0000-4000-8000-000000001003", "amount_cents": 1001}]');
select pg_temp.expect((select count(*) from public.finance_share) = 3, 'coach saves a Bat Around with a share per player');
select pg_temp.expect((select due_dates from public.finance_entry) = '{2027-01-15,2027-02-15}', 'installment due dates are saved');
select public.save_finance_entry(
  '{"id": "f0000000-0000-4000-8000-000000000001", "season_id": "00000000-0000-4000-8000-000000000101", "type": "bat_around", "title": "Pigeon Forge", "amount_cents": 2000, "entry_date": "2027-01-01"}',
  '[{"player_id": "00000000-0000-4000-8000-000000001001", "amount_cents": 1000}, {"player_id": "00000000-0000-4000-8000-000000001003", "amount_cents": 1000}]');
select pg_temp.expect((select count(*) from public.finance_share) = 2 and (select amount_cents from public.finance_entry) = 2000, 'saving again replaces the shares');
select public.save_finance_entry(
  '{"id": "f0000000-0000-4000-8000-000000000002", "season_id": "00000000-0000-4000-8000-000000000101", "type": "cleanup", "title": "Late fee", "amount_cents": 500, "entry_date": "2027-01-02"}',
  '[{"player_id": "00000000-0000-4000-8000-000000001003", "amount_cents": 500}]');
select public.save_finance_entry(
  '{"id": "f0000000-0000-4000-8000-000000000003", "season_id": "00000000-0000-4000-8000-000000000101", "type": "safe_at_home", "title": "Venmo", "amount_cents": 1000, "entry_date": "2027-01-03", "method": "Venmo"}',
  '[{"player_id": "00000000-0000-4000-8000-000000001001", "amount_cents": 1000}]');
select public.save_finance_entry(
  '{"id": "f0000000-0000-4000-8000-000000000004", "season_id": "00000000-0000-4000-8000-000000000101", "type": "walkoff", "title": "Umpires", "amount_cents": 1100, "entry_date": "2027-01-04", "payee": "Ump crew"}', '[]');
select public.save_finance_entry(
  '{"id": "f0000000-0000-4000-8000-000000000005", "season_id": "00000000-0000-4000-8000-000000000101", "type": "grand_slam", "title": "Fundraiser", "amount_cents": 5000, "entry_date": "2027-01-05"}', '[]');
select public.save_finance_entry(
  '{"id": "f0000000-0000-4000-8000-000000000006", "season_id": "00000000-0000-4000-8000-000000000101", "type": "walkoff", "title": "Swag bags", "amount_cents": 800, "entry_date": "2027-03-01", "estimate": true}', '[]');
do $$ begin
  perform public.save_finance_entry(
    '{"id": "f0000000-0000-4000-8000-000000000009", "season_id": "00000000-0000-4000-8000-000000000101", "type": "bat_around", "title": "Bad", "amount_cents": 3000, "entry_date": "2027-01-01"}',
    '[{"player_id": "00000000-0000-4000-8000-000000001001", "amount_cents": 1000}]');
  raise exception 'should have failed' using errcode = 'T0001';
exception when check_violation then raise notice 'ok: shares must add up to the amount';
end $$;
do $$ begin
  perform public.save_finance_entry(
    '{"id": "f0000000-0000-4000-8000-000000000009", "season_id": "00000000-0000-4000-8000-000000000101", "type": "cleanup", "title": "Bad", "amount_cents": 2000, "entry_date": "2027-01-01"}',
    '[{"player_id": "00000000-0000-4000-8000-000000001001", "amount_cents": 1000}, {"player_id": "00000000-0000-4000-8000-000000001002", "amount_cents": 1000}]');
  raise exception 'should have failed' using errcode = 'T0001';
exception when check_violation then raise notice 'ok: a Cleanup is for one player';
end $$;
do $$ begin
  perform public.save_finance_entry(
    '{"id": "f0000000-0000-4000-8000-000000000009", "season_id": "00000000-0000-4000-8000-000000000101", "type": "cleanup", "title": "Bad", "amount_cents": 1000, "entry_date": "2027-01-01"}',
    '[{"player_id": "99999999-0000-4000-8000-000000001001", "amount_cents": 1000}]');
  raise exception 'should have failed' using errcode = 'T0001';
exception when check_violation then raise notice 'ok: shares must be for this team''s players';
end $$;
select pg_temp.expect((select count(*) from public.finance_entry where id = 'f0000000-0000-4000-8000-000000000009') = 0, 'a rejected entry is not saved');
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000006', false);
select public.save_finance_entry(
  '{"id": "f0000000-0000-4000-8000-000000000007", "season_id": "00000000-0000-4000-8000-000000000101", "type": "rain_check", "title": "Credit", "amount_cents": 200, "entry_date": "2027-01-06"}',
  '[{"player_id": "00000000-0000-4000-8000-000000001001", "amount_cents": 200}]');
select pg_temp.expect((select count(*) from public.finance_entry) = 7, 'treasurer adds entries and sees them all');
reset role;

-- Parent of player 1003: sees Walkoffs and their kid's entries, only their kid's shares.
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000002', false);
select pg_temp.expect(
  (select array_agg(title order by title) from public.finance_entry) = '{"Late fee","Pigeon Forge","Swag bags",Umpires}',
  'parents see Walkoffs and entries tagged to their kid only');
select pg_temp.expect(
  (select array_agg(distinct player_id) from public.finance_share) = '{00000000-0000-4000-8000-000000001003}',
  'parents see only their kid''s shares');
select pg_temp.expect((select amount_cents from public.finance_entry where title = 'Pigeon Forge') = 2000, 'parents see a Bat Around''s team total');
select pg_temp.expect(
  public.finance_summary('00000000-0000-4000-8000-000000000101') = jsonb_build_object(
    'batAroundCents', 2000, 'cleanupCents', 500, 'grandSlamCents', 5000, 'totalInCents', 7500,
    'rainCheckCents', 200, 'walkoffCents', 1100, 'totalOutCents', 1300, 'leftOverCents', 6200,
    'billedCents', 2300, 'collectedCents', 1000, 'cashOnHandCents', 4900,
    'plannedOutCents', 800, 'expectedInCents', 0),
  'parents get team totals from the summary');
do $$ begin
  perform public.save_finance_entry(
    '{"id": "f0000000-0000-4000-8000-000000000008", "season_id": "00000000-0000-4000-8000-000000000101", "type": "walkoff", "title": "Mine", "amount_cents": 100, "entry_date": "2027-01-01"}', '[]');
  raise exception 'should have failed' using errcode = 'T0001';
exception when insufficient_privilege then raise notice 'ok: parents cannot add money';
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000007', false);
select pg_temp.expect((select count(*) from public.finance_entry) = 2, 'managers see only Walkoffs (no kids linked)');
update public.finance_entry set amount_cents = 1;
select pg_temp.expect((select sum(amount_cents) from public.finance_entry) = 1900, 'managers cannot edit money');
do $$ begin
  perform public.save_finance_entry(
    '{"id": "f0000000-0000-4000-8000-000000000008", "season_id": "00000000-0000-4000-8000-000000000101", "type": "walkoff", "title": "Mine", "amount_cents": 100, "entry_date": "2027-01-01"}', '[]');
  raise exception 'should have failed' using errcode = 'T0001';
exception when insufficient_privilege then raise notice 'ok: managers cannot add money';
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000003', false);
select pg_temp.expect((select count(*) from public.finance_entry) = 0, 'outsiders see no money');
do $$ begin
  perform public.finance_summary('00000000-0000-4000-8000-000000000101');
  raise exception 'should have failed' using errcode = 'T0001';
exception when insufficient_privilege then raise notice 'ok: outsiders cannot read the team summary';
end $$;
reset role;
-- ── team owner ──
-- User 3 creates a team in the app and becomes its Owner. Add user 1 as a coach there.
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000003', false);
insert into public.team (id, name, age_group) values ('0e000000-0000-4000-8000-000000000001', 'Owned', '11U');
reset role;
select pg_temp.expect(
  (select role from public.member where team_id = '0e000000-0000-4000-8000-000000000001') = 'owner',
  'a team created in the app makes its creator the owner');
insert into public.member (team_id, user_id, role) values
  ('0e000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'coach');
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000003', false);
insert into public.invite (team_id, role, token, created_by) values
  ('0e000000-0000-4000-8000-000000000001', 'parent', 'owner-token-0123456789abcdef0123456789a', 'aaaaaaaa-0000-4000-8000-000000000003');
select pg_temp.expect((select count(*) from public.invite where team_id = '0e000000-0000-4000-8000-000000000001') = 1, 'the owner can do what coaches do');
do $$ begin
  delete from public.member where team_id = '0e000000-0000-4000-8000-000000000001' and user_id = 'aaaaaaaa-0000-4000-8000-000000000003';
  raise exception 'should have failed' using errcode = 'T0001';
exception when check_violation then raise notice 'ok: the owner cannot leave';
end $$;
do $$ begin
  insert into public.invite (team_id, role, token, created_by) values
    ('0e000000-0000-4000-8000-000000000001', 'owner', 'owner-token-ffff456789abcdef0123456789a', 'aaaaaaaa-0000-4000-8000-000000000003');
  raise exception 'should have failed' using errcode = 'T0001';
exception when check_violation then raise notice 'ok: invite links cannot make an owner';
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
do $$ begin
  delete from public.member where team_id = '0e000000-0000-4000-8000-000000000001' and user_id = 'aaaaaaaa-0000-4000-8000-000000000003';
  raise exception 'should have failed' using errcode = 'T0001';
exception when check_violation then raise notice 'ok: coaches cannot remove the owner';
end $$;
do $$ begin
  update public.member set role = 'parent' where team_id = '0e000000-0000-4000-8000-000000000001' and user_id = 'aaaaaaaa-0000-4000-8000-000000000003';
  raise exception 'should have failed' using errcode = 'T0001';
exception when check_violation then raise notice 'ok: coaches cannot demote the owner';
end $$;
do $$ begin
  update public.member set role = 'owner' where team_id = '0e000000-0000-4000-8000-000000000001' and user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
  raise exception 'should have failed' using errcode = 'T0001';
exception when check_violation then raise notice 'ok: nobody can be made owner';
end $$;
do $$ begin
  insert into public.member (team_id, user_id, role) values
    ('00000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'owner');
  raise exception 'should have failed' using errcode = 'T0001';
exception when check_violation then raise notice 'ok: only the creator can be added as owner';
end $$;
reset role;
select pg_temp.expect(
  (select role from public.member where team_id = '0e000000-0000-4000-8000-000000000001' and user_id = 'aaaaaaaa-0000-4000-8000-000000000003') = 'owner',
  'the owner is still the owner');
delete from public.team where id = '0e000000-0000-4000-8000-000000000001';
select pg_temp.expect((select count(*) from public.member where team_id = '0e000000-0000-4000-8000-000000000001') = 0, 'deleting the team still removes the owner');
-- ── walkoff receipts ──
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000006', false);
insert into storage.objects (bucket_id, name) values
  ('receipts', '00000000-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000004/r1.jpg');
select public.save_finance_entry(
  '{"id": "f0000000-0000-4000-8000-000000000004", "season_id": "00000000-0000-4000-8000-000000000101", "type": "walkoff", "title": "Umpires", "amount_cents": 1100, "entry_date": "2027-01-04", "payee": "Ump crew", "receipt_path": "00000000-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000004/r1.jpg"}', '[]');
select pg_temp.expect(
  (select receipt_path from public.finance_entry where id = 'f0000000-0000-4000-8000-000000000004') like '%/r1.jpg',
  'treasurer uploads a receipt and tags it to a Walkoff');
do $$ begin
  perform public.save_finance_entry(
    '{"id": "f0000000-0000-4000-8000-000000000005", "season_id": "00000000-0000-4000-8000-000000000101", "type": "grand_slam", "title": "Fundraiser", "amount_cents": 5000, "entry_date": "2027-01-05", "receipt_path": "x/y/z.jpg"}', '[]');
  raise exception 'should have failed' using errcode = 'T0001';
exception when check_violation then raise notice 'ok: only Walkoffs take receipts';
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000002', false);
select pg_temp.expect((select count(*) from storage.objects where bucket_id = 'receipts') = 1, 'parents can view the team''s receipts');
do $$ begin
  insert into storage.objects (bucket_id, name) values
    ('receipts', '00000000-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000004/sneaky.jpg');
  raise exception 'should have failed' using errcode = 'T0001';
exception when insufficient_privilege then raise notice 'ok: parents cannot upload receipts';
end $$;
delete from storage.objects where bucket_id = 'receipts';
reset role;
select pg_temp.expect((select count(*) from storage.objects where bucket_id = 'receipts') = 1, 'parents cannot delete receipts');
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000003', false);
select pg_temp.expect((select count(*) from storage.objects where bucket_id = 'receipts') = 0, 'outsiders cannot see receipts');
do $$ begin
  insert into storage.objects (bucket_id, name) values ('receipts', 'not-a-team/x.jpg');
  raise exception 'should have failed' using errcode = 'T0001';
exception when insufficient_privilege then raise notice 'ok: receipts must be filed under a team';
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
delete from storage.objects where bucket_id = 'receipts';
select pg_temp.expect((select count(*) from storage.objects where bucket_id = 'receipts') = 0, 'coaches can remove receipts');
reset role;
-- ── team GroupMe bot ──
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000007', false);
insert into public.team_groupme (team_id, bot_id, group_name) values
  ('00000000-0000-4000-8000-000000000001', 'abcdef0123456789abcdef0123', 'Rattlers Parents');
select pg_temp.expect((select count(*) from public.team_groupme) = 1, 'a manager connects the team GroupMe bot');
do $$ begin
  update public.team_groupme set bot_id = 'not a bot id!';
  raise exception 'should have failed' using errcode = 'T0001';
exception when check_violation then raise notice 'ok: bot IDs must look like bot IDs';
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
select pg_temp.expect((select group_name from public.team_groupme) = 'Rattlers Parents', 'coaches see the bot');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000002', false);
select pg_temp.expect((select count(*) from public.team_groupme) = 0, 'parents never see the bot ID');
do $$ begin
  insert into public.team_groupme (team_id, bot_id) values ('00000000-0000-4000-8000-000000000001', 'zzzzzzzzzzzzzzzzzzzz');
  raise exception 'should have failed' using errcode = 'T0001';
exception when insufficient_privilege or unique_violation then raise notice 'ok: parents cannot connect GroupMe';
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000006', false);
select pg_temp.expect((select count(*) from public.team_groupme) = 1, 'treasurers can use the bot (to post Bat Arounds)');
update public.team_groupme set group_name = 'Hijacked';
select pg_temp.expect((select group_name from public.team_groupme) = 'Rattlers Parents', 'treasurers cannot change the bot');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000003', false);
select pg_temp.expect((select count(*) from public.team_groupme) = 0, 'outsiders do not see the bot ID');
reset role;
-- ── team look ──
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
update public.team set colors = '{#c8102e,#f2b705}', logo_path = '00000000-0000-4000-8000-000000000001/logo.png'
  where id = '00000000-0000-4000-8000-000000000001';
select pg_temp.expect((select colors from public.team where id = '00000000-0000-4000-8000-000000000001') = '{#c8102e,#f2b705}', 'coach sets team colors and logo');
do $$ begin
  update public.team set colors = '{red}' where id = '00000000-0000-4000-8000-000000000001';
  raise exception 'should have failed' using errcode = 'T0001';
exception when check_violation then raise notice 'ok: team colors must be hex colors';
end $$;
insert into storage.objects (bucket_id, name) values ('team-logos', '00000000-0000-4000-8000-000000000001/logo.png');
select pg_temp.expect((select count(*) from storage.objects where bucket_id = 'team-logos') = 1, 'coach uploads a team logo');
update public.game set score_us = 7, score_them = 4 where id = (select id from public.game limit 1);
select pg_temp.expect((select count(*) from public.game where score_us = 7 and score_them = 4) = 1, 'coach records a final score');
do $$ begin
  update public.game set score_us = 120;
  raise exception 'should have failed' using errcode = 'T0001';
exception when check_violation then raise notice 'ok: scores stay in range';
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000002', false);
update public.team set colors = '{#000000}' where id = '00000000-0000-4000-8000-000000000001';
select pg_temp.expect((select colors from public.team where id = '00000000-0000-4000-8000-000000000001') = '{#c8102e,#f2b705}', 'parents cannot change team colors');
do $$ begin
  insert into storage.objects (bucket_id, name) values ('team-logos', '00000000-0000-4000-8000-000000000001/mine.png');
  raise exception 'should have failed' using errcode = 'T0001';
exception when insufficient_privilege then raise notice 'ok: parents cannot upload a logo';
end $$;
reset role;
-- ── Gameday PA ──
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000002', false);
insert into storage.objects (bucket_id, name) values ('pa-audio', '00000000-0000-4000-8000-000000000001/walkups/00000000-0000-4000-8000-000000001003/song.wav');
select pg_temp.expect((select count(*) from storage.objects where bucket_id = 'pa-audio') = 1, 'a parent uploads their kid''s walk-up song');
do $$ begin
  insert into storage.objects (bucket_id, name) values ('pa-audio', '00000000-0000-4000-8000-000000000001/walkups/00000000-0000-4000-8000-000000001004/song.wav');
  raise exception 'should have failed' using errcode = 'T0001';
exception when insufficient_privilege then raise notice 'ok: parents cannot upload songs for other kids';
end $$;
do $$ begin
  insert into storage.objects (bucket_id, name) values ('pa-audio', '00000000-0000-4000-8000-000000000001/sounds/horn.wav');
  raise exception 'should have failed' using errcode = 'T0001';
exception when insufficient_privilege then raise notice 'ok: parents cannot add soundboard files';
end $$;
insert into public.walkup (player_id, song_path, song_source, status)
  values ('00000000-0000-4000-8000-000000001003', '00000000-0000-4000-8000-000000000001/walkups/00000000-0000-4000-8000-000000001003/song.wav', 'ai', 'approved');
select pg_temp.expect((select status from public.walkup where player_id = '00000000-0000-4000-8000-000000001003') = 'pending', 'a parent''s walk-up waits for a coach');
do $$ begin
  insert into public.walkup (player_id, song_path, song_source) values ('00000000-0000-4000-8000-000000001004', '00000000-0000-4000-8000-000000000001/walkups/00000000-0000-4000-8000-000000001004/song.wav', 'ai');
  raise exception 'should have failed' using errcode = 'T0001';
exception when insufficient_privilege then raise notice 'ok: parents cannot set another kid''s walk-up';
end $$;
do $$ begin
  update public.walkup set song_path = '00000000-0000-4000-8000-000000000001/walkups/00000000-0000-4000-8000-000000001004/song.wav' where player_id = '00000000-0000-4000-8000-000000001003';
  raise exception 'should have failed' using errcode = 'T0001';
exception when check_violation then raise notice 'ok: walk-up files stay in the kid''s folder';
end $$;
insert into public.pa_generation (team_id, kind) values ('00000000-0000-4000-8000-000000000001', 'song'), ('00000000-0000-4000-8000-000000000001', 'song');
select pg_temp.expect((select mine from public.pa_usage('00000000-0000-4000-8000-000000000001', 'song')) = 2, 'parents see how many songs they made today');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000007', false);
update public.walkup set status = 'approved' where player_id = '00000000-0000-4000-8000-000000001003';
select pg_temp.expect((select status from public.walkup where player_id = '00000000-0000-4000-8000-000000001003') = 'pending', 'managers cannot approve walk-ups');
insert into storage.objects (bucket_id, name) values ('pa-audio', '00000000-0000-4000-8000-000000000001/sounds/horn.wav');
insert into public.pa_sound (team_id, category, label, path, source) values ('00000000-0000-4000-8000-000000000001', 'quick', 'Horn', '00000000-0000-4000-8000-000000000001/sounds/horn.wav', 'upload');
select pg_temp.expect((select count(*) from public.pa_sound) = 1, 'managers add soundboard sounds');
insert into public.pa_generation (team_id, kind) values ('00000000-0000-4000-8000-000000000001', 'song');
select pg_temp.expect((select (mine, team) = (1, 3) from public.pa_usage('00000000-0000-4000-8000-000000000001', 'song')), 'team usage counts everyone');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
update public.walkup set status = 'approved' where player_id = '00000000-0000-4000-8000-000000001003';
select pg_temp.expect((select status = 'approved' and approved_by = 'aaaaaaaa-0000-4000-8000-000000000001' from public.walkup where player_id = '00000000-0000-4000-8000-000000001003'), 'coaches approve walk-ups');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000002', false);
update public.walkup set volume = 1.5 where player_id = '00000000-0000-4000-8000-000000001003';
select pg_temp.expect((select status = 'pending' and approved_by is null from public.walkup where player_id = '00000000-0000-4000-8000-000000001003'), 'a parent''s change needs a fresh OK');
select pg_temp.expect((select count(*) from public.pa_sound) = 1, 'parents see the soundboard');
delete from public.pa_sound;
select pg_temp.expect((select count(*) from public.pa_sound) = 1, 'parents cannot remove soundboard sounds');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000003', false);
select pg_temp.expect((select count(*) from public.walkup) = 0, 'outsiders see no walk-ups');
select pg_temp.expect((select count(*) from storage.objects where bucket_id = 'pa-audio') = 0, 'outsiders cannot play PA audio');
select pg_temp.expect((select team from public.pa_usage('00000000-0000-4000-8000-000000000001', 'song')) = 0, 'outsiders cannot read team usage');
reset role;
-- ── team stats (GameChanger import) ──
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
insert into public.team_stats (season_id, file_name, data) values ('00000000-0000-4000-8000-000000000101', 'stats.csv', '{"columns": [], "players": [], "totals": null}');
select pg_temp.expect((select count(*) from public.team_stats) = 1, 'coaches import stats');
do $$ begin
  insert into public.team_stats (season_id, file_name, data) values ('00000000-0000-4000-8000-000000000101', 'x.csv', '[]') on conflict (season_id) do update set data = excluded.data;
  raise exception 'should have failed' using errcode = 'T0001';
exception when check_violation then raise notice 'ok: stats must be a stats document';
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000007', false);
insert into public.team_stats (season_id, file_name, data) values ('00000000-0000-4000-8000-000000000101', 'week2.csv', '{"columns": [], "players": [], "totals": null}')
  on conflict (season_id) do update set file_name = excluded.file_name, data = excluded.data, imported_at = now();
select pg_temp.expect((select file_name from public.team_stats) = 'week2.csv', 'managers replace stats');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000002', false);
select pg_temp.expect((select count(*) from public.team_stats) = 0, 'parents do not see stats');
update public.team_stats set file_name = 'hack.csv';
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000006', false);
select pg_temp.expect((select count(*) from public.team_stats) = 0, 'treasurers do not see stats');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000003', false);
select pg_temp.expect((select count(*) from public.team_stats) = 0, 'outsiders do not see stats');
do $$ begin
  insert into public.team_stats (season_id, file_name, data) values ('00000000-0000-4000-8000-000000000101', 'x.csv', '{"columns": [], "players": []}');
  raise exception 'should have failed' using errcode = 'T0001';
exception when insufficient_privilege then raise notice 'ok: outsiders cannot import stats';
end $$;
reset role;
select pg_temp.expect((select file_name from public.team_stats) = 'week2.csv', 'parents cannot change stats');
-- ── uniforms ──
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
insert into public.uniform_combo (id, team_id, name, shirt, pants, hat, belt, socks) values
  ('dddddddd-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Dark combo', 'Black', 'Black', 'Red', 'Red', 'Red');
update public.game set uniform_combo_id = 'dddddddd-0000-4000-8000-000000000001' where id = '00000000-0000-4000-8000-000000010002';
select pg_temp.expect((select uniform_combo_id is not null from public.game where id = '00000000-0000-4000-8000-000000010002'), 'coaches assign a uniform to a game');
do $$ begin
  update public.game set uniform_custom = '{"shirt": "White"}' where id = '00000000-0000-4000-8000-000000010002';
  raise exception 'should have failed' using errcode = 'T0001';
exception when check_violation then raise notice 'ok: a game wears a combo or its own pieces, not both';
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000007', false);
update public.uniform_combo set hat = 'Black' where id = 'dddddddd-0000-4000-8000-000000000001';
select pg_temp.expect((select hat from public.uniform_combo where id = 'dddddddd-0000-4000-8000-000000000001') = 'Black', 'managers change uniforms');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000002', false);
select pg_temp.expect((select count(*) from public.uniform_combo) = 1, 'parents see the team''s uniforms');
update public.uniform_combo set hat = 'Pink';
delete from public.uniform_combo;
select pg_temp.expect((select hat from public.uniform_combo) = 'Black', 'parents cannot change or remove uniforms');
do $$ begin
  insert into public.uniform_combo (team_id, name) values ('00000000-0000-4000-8000-000000000001', 'Mine');
  raise exception 'should have failed' using errcode = 'T0001';
exception when insufficient_privilege then raise notice 'ok: parents cannot add uniforms';
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000003', false);
select pg_temp.expect((select count(*) from public.uniform_combo) = 0, 'outsiders see no uniforms');
reset role;
insert into public.team (id, name, age_group) values ('eeeeeeee-0000-4000-8000-000000000001', 'Rivals', '9U');
insert into public.uniform_combo (id, team_id, name) values ('dddddddd-0000-4000-8000-000000000002', 'eeeeeeee-0000-4000-8000-000000000001', 'Theirs');
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
do $$ begin
  update public.game set uniform_combo_id = 'dddddddd-0000-4000-8000-000000000002' where id = '00000000-0000-4000-8000-000000010001';
  raise exception 'should have failed' using errcode = 'T0001';
exception when check_violation then raise notice 'ok: a game cannot wear another team''s uniform';
end $$;
reset role;
delete from public.uniform_combo where id = 'dddddddd-0000-4000-8000-000000000001';
select pg_temp.expect((select uniform_combo_id is null from public.game where id = '00000000-0000-4000-8000-000000010002'), 'deleting a combo clears it from games');
-- ── game day posts ──
-- A fresh team (so other fixtures' games don't mix in): coach 0001, parent 0002.
insert into public.team (id, name, age_group) values ('eeeeeeee-0000-4000-8000-000000000010', 'Canes', '7U');
insert into public.member (team_id, user_id, role) values
  ('eeeeeeee-0000-4000-8000-000000000010', 'aaaaaaaa-0000-4000-8000-000000000001', 'coach'),
  ('eeeeeeee-0000-4000-8000-000000000010', 'aaaaaaaa-0000-4000-8000-000000000002', 'parent');
insert into public.season (id, team_id, name) values ('eeeeeeee-0000-4000-8000-000000000011', 'eeeeeeee-0000-4000-8000-000000000010', 'Spring');
insert into public.uniform_combo (id, team_id, name) values ('eeeeeeee-0000-4000-8000-000000000012', 'eeeeeeee-0000-4000-8000-000000000010', 'White combo');
insert into public.game (id, season_id, game_date, start_time, opponent, location, uniform_combo_id) values
  ('eeeeeeee-0000-4000-8000-000000000020', 'eeeeeeee-0000-4000-8000-000000000011', '2027-04-09', '19:00', 'The Cubs', 'Chabills Field', 'eeeeeeee-0000-4000-8000-000000000012'),
  ('eeeeeeee-0000-4000-8000-000000000021', 'eeeeeeee-0000-4000-8000-000000000011', '2027-04-10', '12:00', 'Broncos', 'Chabills Field', 'eeeeeeee-0000-4000-8000-000000000012'),
  ('eeeeeeee-0000-4000-8000-000000000022', 'eeeeeeee-0000-4000-8000-000000000011', '2027-04-10', '10:00', 'Cubs', 'Chabills Field', 'eeeeeeee-0000-4000-8000-000000000012');
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
select pg_temp.expect(
  public.game_day_message('eeeeeeee-0000-4000-8000-000000000010', '2027-04-09', true)
    = E'Game against The Cubs\nChabills Field\n7:00 PM\nArrive by 6:00 PM\nWhite combo',
  'game day post for one game');
select pg_temp.expect(
  public.game_day_message('eeeeeeee-0000-4000-8000-000000000010', '2027-04-09', false)
    like 'Friday game against The Cubs%',
  'a post before game day names the day');
select pg_temp.expect(
  public.game_day_message('eeeeeeee-0000-4000-8000-000000000010', '2027-04-10', false)
    = E'Saturday games 10:00 AM and noon against Cubs and Broncos\nChabills Field\nArrive by 9:00 AM\nWhite combo',
  'game day post for two games');
reset role;
update public.game set arrive_time = '08:30' where id = 'eeeeeeee-0000-4000-8000-000000000022';
update public.game set location = 'Moore Park', uniform_combo_id = null, uniform_custom = '{"shirt": "Black", "hat": "Red"}'
  where id = 'eeeeeeee-0000-4000-8000-000000000021';
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
select pg_temp.expect(
  public.game_day_message('eeeeeeee-0000-4000-8000-000000000010', '2027-04-10', true)
    = E'Games 10:00 AM and noon against Cubs and Broncos\n10:00 AM: Chabills Field\nnoon: Moore Park\nArrive by 8:30 AM\n10:00 AM: White combo\nnoon: Black shirt · Red hat',
  'a game''s own arrival time, and per-game places and uniforms when they differ');
select pg_temp.expect(public.game_day_message('eeeeeeee-0000-4000-8000-000000000010', '2027-04-11', true) is null, 'no games, no post');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000002', false);
do $$ begin
  perform public.game_day_message('eeeeeeee-0000-4000-8000-000000000010', '2027-04-09', true);
  raise exception 'should have failed' using errcode = 'T0001';
exception when insufficient_privilege then raise notice 'ok: parents cannot preview game day posts';
end $$;
do $$ begin
  perform public.mark_game_day_posted('eeeeeeee-0000-4000-8000-000000000010', '2027-04-09');
  raise exception 'should have failed' using errcode = 'T0001';
exception when insufficient_privilege then raise notice 'ok: parents cannot mark a game day posted';
end $$;
reset role;
do $$ begin
  update public.team set timezone = 'Mars/Olympus' where id = 'eeeeeeee-0000-4000-8000-000000000010';
  raise exception 'should have failed' using errcode = 'T0001';
exception when check_violation then raise notice 'ok: time zones must be real';
end $$;

-- The scheduler runs with nobody signed in.
select set_config('request.jwt.claim.sub', '', false);
-- Pick a time zone where it's about noon now, a game at 2 PM today, posts
-- 3 hours before.
do $$
declare
  off int := 12 - extract(hour from now() at time zone 'UTC')::int;
  tz text := 'Etc/GMT' || case when off > 0 then '-' || off when off < 0 then '+' || -off else '' end;
  today date := (now() at time zone tz)::date;
begin
  update public.team set timezone = tz, game_post_mode = 'hours', game_post_hours = 3
    where id = 'eeeeeeee-0000-4000-8000-000000000010';
  insert into public.game (season_id, game_date, start_time, opponent) values
    ('eeeeeeee-0000-4000-8000-000000000011', today, '14:00', 'Astros'),
    ('eeeeeeee-0000-4000-8000-000000000011', today + 2, '14:00', 'Later');
end $$;
select pg_temp.expect(public.send_due_game_posts() = 0, 'no posts without a GroupMe bot');
insert into public.team_groupme (team_id, bot_id) values ('eeeeeeee-0000-4000-8000-000000000010', 'abcdefghij1234567890');
select pg_temp.expect(public.send_due_game_posts() = 1, 'posts today''s game once it''s due (not the one in 2 days)');
select pg_temp.expect((select body ->> 'bot_id' = 'abcdefghij1234567890' and body ->> 'text' like 'Game against Astros%' from net.sent order by id desc limit 1), 'posts through the team''s bot');
select pg_temp.expect(public.send_due_game_posts() = 0, 'never posts the same game day twice');
update public.team set game_post_mode = 'days', game_post_days = 2, game_post_time = '00:00' where id = 'eeeeeeee-0000-4000-8000-000000000010';
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
select pg_temp.expect((select message ilike '%game against Astros%' and message not like 'Game%' and sent_at is not null from public.next_game_day_post('eeeeeeee-0000-4000-8000-000000000010')), 'coaches see the next post and that it went out');
select public.mark_game_day_posted('eeeeeeee-0000-4000-8000-000000000010', (now() at time zone (select timezone from public.team where id = 'eeeeeeee-0000-4000-8000-000000000010'))::date + 2);
reset role;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.expect(public.send_due_game_posts() = 0, 'a game day posted by hand isn''t posted again');
update public.team set game_post_mode = 'off' where id = 'eeeeeeee-0000-4000-8000-000000000010';
delete from public.game_post_log where team_id = 'eeeeeeee-0000-4000-8000-000000000010';
select pg_temp.expect(public.send_due_game_posts() = 0, 'nothing posts when game day posts are off');
-- ── a kid's own game stats (parent box score import) ──
-- Parent 0002 is linked to player 1003 (from the fixtures); 1004 is someone else's kid.
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000002', false);
insert into public.player_game_stat (player_id, game_date, opponent, batting)
  values ('00000000-0000-4000-8000-000000001003', '2026-06-20', 'LBC Rudy 13U', '{"ab": 2, "h": 1}');
select pg_temp.expect((select count(*) from public.player_game_stat) = 1, 'parents import their own kid''s game');
do $$ begin
  insert into public.player_game_stat (player_id, game_date, opponent, batting)
    values ('00000000-0000-4000-8000-000000001004', '2026-06-20', 'LBC Rudy 13U', '{"ab": 3}');
  raise exception 'should have failed' using errcode = 'T0001';
exception when insufficient_privilege then raise notice 'ok: parents cannot add stats for another family''s kid';
end $$;
do $$ begin
  insert into public.player_game_stat (player_id, game_date, opponent, batting)
    values ('00000000-0000-4000-8000-000000001003', '2026-06-20', 'LBC Rudy 13U', '{"ab": 3}');
  raise exception 'should have failed' using errcode = 'T0001';
exception when unique_violation then raise notice 'ok: the same game is stored once';
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
select pg_temp.expect((select count(*) from public.player_game_stat) = 0, 'coaches do not see a family''s imported stats');
delete from public.player_game_stat;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000003', false);
select pg_temp.expect((select count(*) from public.player_game_stat) = 0, 'outsiders do not see them');
reset role;
select pg_temp.expect((select count(*) from public.player_game_stat) = 1, 'nobody else can remove them');
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000002', false);
delete from public.player_game_stat;
select pg_temp.expect((select count(*) from public.player_game_stat) = 0, 'parents remove their kid''s game');
reset role;
-- ── clubs ──
insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-000000000008', 'director@example.test');
create temp table club_t as select public.create_club('Traction Canes', 'Director@Example.test') as org;
create temp table codes_t as select public.create_club_codes((select org from club_t), 2, '2026-27') as code;
grant select on club_t, codes_t to authenticated;
select pg_temp.expect((select count(*) from codes_t) = 2 and (select bool_and(code ~ '^[A-HJ-NP-Z2-9]{8}$') from codes_t), 'codes are made');
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000008', false);
select pg_temp.expect((select count(*) from public.player where team_id = '00000000-0000-4000-8000-000000000001') = 0, 'a club sees nothing of a team before it joins');
select pg_temp.expect((select count(*) from public.club_code) = 2, 'the director sees the club''s codes');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000002', false);
do $$ begin
  perform public.redeem_club_code('00000000-0000-4000-8000-000000000001', (select min(code) from codes_t));
  raise exception 'should have failed' using errcode = 'T0001';
exception when insufficient_privilege then raise notice 'ok: parents cannot enter a club code';
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000007', false);
do $$ begin
  perform public.redeem_club_code('00000000-0000-4000-8000-000000000001', (select min(code) from codes_t));
  raise exception 'should have failed' using errcode = 'T0001';
exception when insufficient_privilege then raise notice 'ok: managers cannot enter a club code';
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
do $$ begin
  perform public.redeem_club_code('00000000-0000-4000-8000-000000000001', 'NOPE2345');
  raise exception 'should have failed' using errcode = 'T0001';
exception when no_data_found then raise notice 'ok: a wrong code is refused';
end $$;
select pg_temp.expect(
  (public.redeem_club_code('00000000-0000-4000-8000-000000000001', lower((select min(code) from codes_t)))) ->> 'club' = 'Traction Canes',
  'a coach enters a club code (any case)');
do $$ begin
  perform public.redeem_club_code('00000000-0000-4000-8000-000000000001', (select max(code) from codes_t));
  raise exception 'should have failed' using errcode = 'T0001';
exception when raise_exception then raise notice 'ok: one code per team per season';
end $$;
select pg_temp.expect((select count(*) from public.club_code) = 1, 'coaches see only their team''s code');
select pg_temp.expect((select organization_id is not null from public.team where id = '00000000-0000-4000-8000-000000000001'), 'the team joins the club');
do $$ begin
  perform * from public.club_overview((select org from club_t));
  raise exception 'should have failed' using errcode = 'T0001';
exception when insufficient_privilege then raise notice 'ok: only club admins see the club dashboard';
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000008', false);
select pg_temp.expect((select count(*) from public.player where team_id = '00000000-0000-4000-8000-000000000001') > 0, 'the club views the team''s players');
select pg_temp.expect((select count(*) from public.game g join public.season s on s.id = g.season_id where s.team_id = '00000000-0000-4000-8000-000000000001') > 0, 'the club views games');
select pg_temp.expect((select count(*) from public.lineup_slot) > 0, 'the club views lineups');
select pg_temp.expect((select count(*) from public.team_stats) >= 0, 'the club can read imported team stats');
select pg_temp.expect((select bool_and(role in ('owner', 'coach')) from public.member), 'the club sees only coaches, not parents');
select pg_temp.expect((select count(*) from public.finance_entry) = 0, 'the club sees no team money');
select pg_temp.expect((select count(*) from public.player_guardian) = 0, 'the club sees no parent links');
select pg_temp.expect((select count(*) from public.walkup) = 0, 'the club sees no walk-ups');
select pg_temp.expect((select count(*) from public.team_groupme) = 0, 'the club sees no GroupMe bot');
select pg_temp.expect((select count(*) from public.player_game_stat) = 0, 'the club sees no parents'' box score imports');
update public.player set name = 'Changed by club' where team_id = '00000000-0000-4000-8000-000000000001';
select pg_temp.expect((select count(*) from public.player where name = 'Changed by club') = 0, 'the club cannot change anything');
select pg_temp.expect((select team_name from public.club_overview((select org from club_t))) is not null, 'the club dashboard lists the team');
do $$ begin
  perform public.create_club_codes((select org from club_t), 5, '2026-27');
  raise exception 'should have failed' using errcode = 'T0001';
exception when insufficient_privilege then raise notice 'ok: codes are only made by RallyCap (SQL Editor)';
end $$;
reset role;
update public.club_code set expires_on = current_date - 1 where team_id = '00000000-0000-4000-8000-000000000001';
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000008', false);
select pg_temp.expect((select count(*) from public.player where team_id = '00000000-0000-4000-8000-000000000001') = 0, 'when the season''s code expires, the club''s view ends');
reset role;
-- ── clubs, phase 2: look, uniforms, library, GroupMe ──
update public.club_code set expires_on = current_date + 30 where team_id = '00000000-0000-4000-8000-000000000001';
delete from net.sent;
insert into public.team_groupme (team_id, bot_id) values ('00000000-0000-4000-8000-000000000001', 'teambot0001abcdef')
  on conflict (team_id) do update set bot_id = excluded.bot_id;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000008', false);
update public.organization set palette = '{#c8102e,#111111,#ffffff}', colors = '{#c8102e,#111111}', logo_path = 'club/' || (select org from club_t) || '/logo.png' where id = (select org from club_t);
insert into storage.objects (bucket_id, name) values ('team-logos', 'club/' || (select org from club_t) || '/logo.png');
insert into public.uniform_combo (id, organization_id, name, shirt) values ('dddddddd-0000-4000-8000-000000000030', (select org from club_t), 'White combo', 'White');
insert into public.club_practice_plan (organization_id, title, items) values ((select org from club_t), 'Canes infield day', '[{"title": "Ground balls", "minutes": 15}]');
insert into public.club_play_set (organization_id, title, play_ids) values ((select org from club_t), 'Bunt defense', '{bunt-1b-3b}');
insert into public.club_groupme (organization_id, bot_id) values ((select org from club_t), 'coachesbotabcdef12');
select pg_temp.expect((select count(*) from public.club_groupme_targets((select org from club_t)) where connected) = 1, 'the club sees which team groups it can post to');
select pg_temp.expect(public.club_groupme_post((select org from club_t), true, array['00000000-0000-4000-8000-000000000001'::uuid], 'Tryouts July 12') = 2, 'the club posts to its coaches group and a team group');
do $$ begin
  perform public.club_groupme_post((select org from club_t), true, null, repeat('x', 1001));
  raise exception 'should have failed' using errcode = 'T0001';
exception when raise_exception then raise notice 'ok: club posts stay under GroupMe''s limit';
end $$;
reset role;
select pg_temp.expect((select array_agg(body ->> 'bot_id' order by body ->> 'bot_id') from net.sent) = '{coachesbotabcdef12,teambot0001abcdef}', 'posts go through the club''s and the team''s bots');
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
select pg_temp.expect((select colors = '{#c8102e,#111111}' from public.organization where id = (select org from club_t)), 'club teams see the club''s colors and logo');
select pg_temp.expect((select count(*) from public.uniform_combo where organization_id is not null) = 1, 'club teams see the club''s uniforms');
update public.uniform_combo set shirt = 'Pink' where id = 'dddddddd-0000-4000-8000-000000000030';
select pg_temp.expect((select shirt from public.uniform_combo where id = 'dddddddd-0000-4000-8000-000000000030') = 'White', 'teams cannot change club uniforms');
update public.game set uniform_combo_id = 'dddddddd-0000-4000-8000-000000000030', uniform_custom = null where id = '00000000-0000-4000-8000-000000010002';
select pg_temp.expect((select uniform_combo_id = 'dddddddd-0000-4000-8000-000000000030' from public.game where id = '00000000-0000-4000-8000-000000010002'), 'a club team''s game wears a club uniform');
select pg_temp.expect((select count(*) from public.club_practice_plan) = 1 and (select count(*) from public.club_play_set) = 1, 'club teams see the club library');
do $$ begin
  insert into public.club_practice_plan (organization_id, title) values ((select org from club_t), 'Mine');
  raise exception 'should have failed' using errcode = 'T0001';
exception when insufficient_privilege then raise notice 'ok: teams cannot add to the club library';
end $$;
select pg_temp.expect((select count(*) from public.club_groupme) = 0, 'coaches cannot see the club''s coaches group bot');
do $$ begin
  perform public.club_groupme_post((select org from club_t), true, null, 'hi');
  raise exception 'should have failed' using errcode = 'T0001';
exception when insufficient_privilege then raise notice 'ok: only club admins post for the club';
end $$;
do $$ begin
  insert into storage.objects (bucket_id, name) values ('team-logos', 'club/' || (select org from club_t) || '/mine.png');
  raise exception 'should have failed' using errcode = 'T0001';
exception when insufficient_privilege then raise notice 'ok: teams cannot change the club logo';
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000003', false);
select pg_temp.expect((select count(*) from public.uniform_combo where organization_id is not null) = 0 and (select count(*) from public.club_practice_plan) = 0, 'outsiders see none of the club''s things');
reset role;
update public.club_code set expires_on = current_date - 1 where team_id = '00000000-0000-4000-8000-000000000001';
update public.game set uniform_combo_id = null where id = '00000000-0000-4000-8000-000000010002';
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
do $$ begin
  update public.game set uniform_combo_id = 'dddddddd-0000-4000-8000-000000000030' where id = '00000000-0000-4000-8000-000000010002';
  raise exception 'should have failed' using errcode = 'T0001';
exception when check_violation then raise notice 'ok: after the code expires, club uniforms can''t be picked';
end $$;
select pg_temp.expect((select count(*) from public.club_practice_plan) = 0, 'after the code expires, the team no longer sees the club library');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000008', false);
do $$ begin
  perform public.club_groupme_post((select org from club_t), false, array['00000000-0000-4000-8000-000000000001'::uuid], 'hi');
  raise exception 'should have failed' using errcode = 'T0001';
exception when raise_exception then raise notice 'ok: after the code expires, the club can''t post to that team';
end $$;
reset role;
-- ── billing (Stripe purchases, fulfilled by the server) ──
insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-000000000009', 'newclub@example.test');
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000009', false);
do $$ begin
  perform public.fulfill_purchase('cs_test_1', 'club', 'aaaaaaaa-0000-4000-8000-000000000009', null, 'Bayou Bats', null, 3, '2026-27', 29700);
  raise exception 'should have failed' using errcode = 'T0001';
exception when insufficient_privilege then raise notice 'ok: only the server records purchases';
end $$;
reset role;
set role service_role;
create temp table bought_t as
  select public.fulfill_purchase('cs_test_1', 'club', 'aaaaaaaa-0000-4000-8000-000000000009', null, 'Bayou Bats', null, 3, '2026-27', 29700) as r;
reset role;
select pg_temp.expect(jsonb_array_length((select r -> 'codes' from bought_t)) = 3, 'a new club pays and gets its codes');
select pg_temp.expect((select role from public.club_admin where user_id = 'aaaaaaaa-0000-4000-8000-000000000009') = 'director', 'the buyer becomes the new club''s director');
select pg_temp.expect((select bool_and(expires_on = '2027-07-31') from public.club_code where organization_id = ((select r ->> 'club' from bought_t))::uuid), 'codes run to July 31');
set role service_role;
select pg_temp.expect((public.fulfill_purchase('cs_test_1', 'club', 'aaaaaaaa-0000-4000-8000-000000000009', null, 'Bayou Bats', null, 3, '2026-27', 29700)) ->> 'already' = 'true', 'a payment notice that arrives twice is recorded once');
select pg_temp.expect((public.fulfill_purchase('cs_test_2', 'club', 'aaaaaaaa-0000-4000-8000-000000000009', ((select r ->> 'club' from bought_t))::uuid, null, null, 2, '2026-27', 19800)) ? 'codes', 'an existing club buys more codes');
do $$ begin
  perform public.fulfill_purchase('cs_test_3', 'club', 'aaaaaaaa-0000-4000-8000-000000000003', ((select r ->> 'club' from bought_t))::uuid, null, null, 1, '2026-27', 9900);
  raise exception 'should have failed' using errcode = 'T0001';
exception when raise_exception then raise notice 'ok: only the club''s admins buy codes for it';
end $$;
select public.fulfill_purchase('cs_test_4', 'team', 'aaaaaaaa-0000-4000-8000-000000000001', null, null, '00000000-0000-4000-8000-000000000001', 1, '2026-27', 12900);
reset role;
select pg_temp.expect((select count(*) from public.club_code where organization_id = ((select r ->> 'club' from bought_t))::uuid) = 5, 'the club now has 5 codes');
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000002', false);
select pg_temp.expect((select expires_on = '2027-07-31' from public.team_pass where team_id = '00000000-0000-4000-8000-000000000001'), 'the team''s season pass shows for its members');
select pg_temp.expect((select count(*) from public.purchase) = 0, 'parents don''t see purchases');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
select pg_temp.expect((select count(*) from public.purchase where kind = 'team') = 1, 'coaches see their team''s purchase');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000003', false);
select pg_temp.expect((select count(*) from public.team_pass) = 0 and (select count(*) from public.purchase) = 0, 'outsiders see no passes or purchases');
reset role;
-- ── my name ──
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
select public.set_my_name('  Craig   Polk ');
select pg_temp.expect((select bool_and(display_name = 'Craig Polk') from public.member where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'), 'my name is set on every team I''m on');
select pg_temp.expect((select count(*) from public.member where user_id <> 'aaaaaaaa-0000-4000-8000-000000000001' and display_name = 'Craig Polk') = 0, 'nobody else''s name changes');
do $$ begin
  perform public.set_my_name('   ');
  raise exception 'should have failed' using errcode = 'T0001';
exception when raise_exception then raise notice 'ok: a name can''t be blank';
end $$;
reset role;
-- ── profile: Venmo handle (only you see yours; teammates only learn that you have one) ──
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000002', false);
insert into public.profile (venmo) values ('Polk-Family');
select pg_temp.expect((select venmo from public.profile) = 'Polk-Family', 'a parent sees their own Venmo handle');
do $$ begin
  update public.profile set venmo = '@bad handle!' where user_id = 'aaaaaaaa-0000-4000-8000-000000000002';
  raise exception 'should have failed' using errcode = 'T0001';
exception when check_violation then raise notice 'ok: Venmo handles are checked';
end $$;
do $$ begin
  insert into public.profile (user_id, venmo) values ('aaaaaaaa-0000-4000-8000-000000000001', 'Hijacked1');
  raise exception 'should have failed' using errcode = 'T0001';
exception when insufficient_privilege then raise notice 'ok: you can only set your own handle';
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
select pg_temp.expect((select count(*) from public.profile where user_id = 'aaaaaaaa-0000-4000-8000-000000000002') = 0, 'teammates can''t see another person''s handle');
select pg_temp.expect('aaaaaaaa-0000-4000-8000-000000000002'::uuid in (select public.team_venmo_users('00000000-0000-4000-8000-000000000001')), 'teammates learn who has a handle (for the button)');
update public.profile set venmo = 'Changed1' where user_id = 'aaaaaaaa-0000-4000-8000-000000000002';
reset role;
select pg_temp.expect((select venmo from public.profile where user_id = 'aaaaaaaa-0000-4000-8000-000000000002') = 'Polk-Family', 'nobody else can change it');
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000003', false);
select pg_temp.expect((select count(*) from public.team_venmo_users('00000000-0000-4000-8000-000000000001')) = 0, 'people not on the team learn nothing');
reset role;
-- ── team_families: every kid's family names for the team's roster ──
reset role;
select set_config('request.jwt.claim.sub', '', false);
insert into public.player_guardian (player_id, user_id)
  select p.id, 'aaaaaaaa-0000-4000-8000-000000000001' from public.player p
  where p.team_id = '00000000-0000-4000-8000-000000000001'
    and not exists (select 1 from public.player_guardian g where g.player_id = p.id)
  limit 1;
create temp table families_expected as
  select count(*) as n from public.player_guardian g
  join public.player p on p.id = g.player_id and p.team_id = '00000000-0000-4000-8000-000000000001'
  join public.member m on m.user_id = g.user_id and m.team_id = p.team_id;
grant select on families_expected to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000002', false);
select pg_temp.expect(
  (select count(*) from public.team_families('00000000-0000-4000-8000-000000000001')) = (select n from families_expected)
  and (select n from families_expected) > 0,
  'a parent sees every kid''s family on the roster');
select pg_temp.expect(
  (select count(*) from public.player_guardian where user_id <> 'aaaaaaaa-0000-4000-8000-000000000002') = 0,
  'but still can''t read other families'' links directly');
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000003', false);
select pg_temp.expect((select count(*) from public.team_families('00000000-0000-4000-8000-000000000001')) = 0, 'people not on the team see no families');
-- a parent's cell phone shows by their family on the roster; only they can set it
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
update public.profile set phone = '+13375550123' where user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
insert into public.profile (phone) select '+13375550123'
  where not exists (select 1 from public.profile where user_id = 'aaaaaaaa-0000-4000-8000-000000000001');
do $$ begin
  update public.profile set phone = '555-0123' where user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
  raise exception 'should have failed' using errcode = 'T0001';
exception when check_violation then raise notice 'ok: phone numbers are checked';
end $$;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000002', false);
select pg_temp.expect(
  (select phone from public.team_families('00000000-0000-4000-8000-000000000001') where user_id = 'aaaaaaaa-0000-4000-8000-000000000001' limit 1) = '+13375550123',
  'teammates see a family''s cell phone on the roster');
update public.profile set phone = '+15045550000' where user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000003', false);
select pg_temp.expect((select count(*) from public.team_families('00000000-0000-4000-8000-000000000001') where phone is not null) = 0, 'people not on the team see no phones');
select pg_temp.expect((select count(*) from public.team_phones('00000000-0000-4000-8000-000000000001')) = 0, 'people not on the team see no member phones');
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000002', false);
select pg_temp.expect(
  (select phone from public.team_phones('00000000-0000-4000-8000-000000000001') where user_id = 'aaaaaaaa-0000-4000-8000-000000000001') = '+13375550123',
  'a parent sees a coach''s cell on Coaches & parents');
reset role;
reset role;
select pg_temp.expect((select phone from public.profile where user_id = 'aaaaaaaa-0000-4000-8000-000000000001') = '+13375550123', 'nobody else can change your phone');
-- ── starting a club is free: anyone signed in becomes its director ──
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000003', false);
create temp table started as select public.start_my_club('  Bayou   Baseball Club ') as id;
select pg_temp.expect((select name from public.organization where id = (select id from started)) = 'Bayou Baseball Club', 'anyone signed in can start a club (name tidied)');
select pg_temp.expect(public.is_club_admin((select id from started)), 'and becomes its director');
do $$ begin
  perform public.start_my_club('   ');
  raise exception 'should have failed' using errcode = 'T0001';
exception when raise_exception then raise notice 'ok: a club needs a name';
end $$;
reset role;
do $$ begin
  set local role anon;
  perform public.start_my_club('Sneaky Club');
  raise exception 'should have failed' using errcode = 'T0001';
exception when insufficient_privilege then raise notice 'ok: signed-out visitors can''t start a club';
end $$;
reset role;
-- ── club colors come only from the club's uploaded palette ──
reset role;
select set_config('request.jwt.claim.sub', '', false);
update public.organization set palette = '{#112233,#aabbcc,#ff0000}', colors = '{#112233,#ff0000}'
  where id = (select id from started);
select pg_temp.expect((select colors from public.organization where id = (select id from started)) = '{#112233,#ff0000}', 'a club picks its two colors from its palette');
do $$ begin
  update public.organization set colors = '{#123456,#ff0000}' where id = (select id from started);
  raise exception 'should have failed' using errcode = 'T0001';
exception when check_violation then raise notice 'ok: a club color must come from its uploaded palette';
end $$;
-- ── game places ──
update public.game set location = 'Traction Sports Complex', field = 'Chabills Field', location_lat = 30.2, location_lng = -92.0
  where id = 'eeeeeeee-0000-4000-8000-000000000020';
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.expect(
  public.game_day_message('eeeeeeee-0000-4000-8000-000000000010', '2027-04-09', true) like E'Game against The Cubs\nTraction Sports Complex · Chabills Field\n%',
  'game day posts name the field');
do $$ begin
  update public.game set location_lat = 120 where id = 'eeeeeeee-0000-4000-8000-000000000020';
  raise exception 'should have failed' using errcode = 'T0001';
exception when check_violation then raise notice 'ok: map positions are checked';
end $$;
\echo ALL RLS TESTS PASSED
