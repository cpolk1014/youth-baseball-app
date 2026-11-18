-- Removes the RallyCap demo club (club-demo.sql): its six teams and everything on them, the
-- club, its codes, awards and library, and the demo parent's Mason Reyes record. The demo
-- people's own accounts stay (delete them under Authentication → Users if you like).
-- Run in the Supabase SQL Editor.

do $$
declare
  v_org constant uuid := 'de30c1ab-0000-4000-8000-000000000001';
  v_teams uuid[] := array(select id from public.team where organization_id = v_org);
begin
  -- Mason Reyes's record (pitch log, Player pass link) belongs to the demo parent.
  delete from public.athlete where id in (
    select p.athlete_id from public.player p where p.team_id = any (v_teams) and p.athlete_id is not null);
  delete from public.player_game_stat where player_id in (
    select id from public.player where team_id = any (v_teams));
  delete from public.team where id = any (v_teams);
  delete from public.organization where id = v_org;
end;
$$;

select count(*) as demo_teams_left from public.team
where organization_id = 'de30c1ab-0000-4000-8000-000000000001';
