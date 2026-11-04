-- Coaches & parents: everyone on the team sees each member's cell phone (if they added one
-- on My profile), coaches included. Team members only; profiles stay private otherwise.

create function public.team_phones(p_team_id uuid)
returns table (user_id uuid, phone text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, pr.phone
  from public.member m
  join public.profile pr on pr.user_id = m.user_id and pr.phone is not null
  where m.team_id = p_team_id and public.is_team_member(p_team_id);
$$;

revoke execute on function public.team_phones(uuid) from public, anon;
grant execute on function public.team_phones(uuid) to authenticated;
