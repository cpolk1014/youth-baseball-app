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
\echo ALL RLS TESTS PASSED
