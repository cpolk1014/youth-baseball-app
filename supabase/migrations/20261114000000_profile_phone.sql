-- A parent's cell phone on their profile (optional; adults only, never players). Unlike the
-- Venmo handle, the team sees it: the roster shows it by each kid's family so families and
-- coaches can call or text. Only you can set or change yours.

alter table public.profile
  add column phone text check (phone is null or phone ~ '^\+[0-9]{10,15}$');

-- team_families now carries each parent's phone too (team members only).
drop function public.team_families(uuid);

create function public.team_families(p_team_id uuid)
returns table (player_id uuid, user_id uuid, display_name text, phone text)
language sql
stable
security definer
set search_path = ''
as $$
  select g.player_id, g.user_id, m.display_name, pr.phone
  from public.player_guardian g
  join public.player p on p.id = g.player_id and p.team_id = p_team_id
  join public.member m on m.user_id = g.user_id and m.team_id = p_team_id
  left join public.profile pr on pr.user_id = g.user_id
  where public.is_team_member(p_team_id);
$$;

revoke execute on function public.team_families(uuid) from public, anon;
grant execute on function public.team_families(uuid) to authenticated;
