-- Roster for parents: which family goes with each kid (the parents' names), so families can
-- find each other. Team members only; names as they appear on the team, never emails.
-- Families still can't read other families' player_guardian rows directly.

create function public.team_families(p_team_id uuid)
returns table (player_id uuid, user_id uuid, display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select g.player_id, g.user_id, m.display_name
  from public.player_guardian g
  join public.player p on p.id = g.player_id and p.team_id = p_team_id
  join public.member m on m.user_id = g.user_id and m.team_id = p_team_id
  where public.is_team_member(p_team_id);
$$;

revoke execute on function public.team_families(uuid) from public, anon;
grant execute on function public.team_families(uuid) to authenticated;
