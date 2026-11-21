-- The number on Fungo's home-screen icon: new posts by others in every team's Chatter the
-- person has joined, plus every Coach Chatter they're in. Notifications carry it, so the icon
-- updates even while the app is closed.

create function public.unread_total_for(p_user uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select (
    select count(*) from public.chatter_member c
    join public.member m on m.team_id = c.team_id and m.user_id = c.user_id
    join public.chatter_post p on p.team_id = c.team_id
    where c.user_id = p_user and c.agreed_at is not null and p.removed_at is null
      and p.author_id is distinct from p_user
      and p.created_at > coalesce(c.last_read_at, '-infinity'::timestamptz)
  )::int + (
    select count(*) from public.club_coach_post p
    where p.removed_at is null and p.author_id is distinct from p_user
      and (
        exists (select 1 from public.club_admin a
                where a.organization_id = p.organization_id and a.user_id = p_user)
        or exists (
          select 1 from public.club_code cc
          join public.team t on t.id = cc.team_id
          join public.member m on m.team_id = cc.team_id
          where cc.organization_id = p.organization_id and cc.expires_on >= current_date
            and t.optioned_at is null and m.user_id = p_user and m.role in ('owner', 'coach'))
      )
      and p.created_at > coalesce(
        (select r.last_read_at from public.club_coach_read r
         where r.organization_id = p.organization_id and r.user_id = p_user),
        now() - interval '7 days')
  )::int;
$$;
revoke execute on function public.unread_total_for(uuid) from public, anon, authenticated;

-- Mine, for the app to set the icon while it's open.
create function public.my_unread_total()
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select public.unread_total_for((select auth.uid()));
$$;
revoke execute on function public.my_unread_total() from public, anon;
grant execute on function public.my_unread_total() to authenticated;

-- Everyone getting a notification, for the server to put their own number on it.
create function public.unread_badges(p_users uuid[])
returns table (user_id uuid, unread int)
language sql
stable
security definer
set search_path = ''
as $$
  select u, public.unread_total_for(u) from unnest(p_users) u;
$$;
revoke execute on function public.unread_badges(uuid[]) from public, anon, authenticated;
grant execute on function public.unread_badges(uuid[]) to service_role;
