-- Chatter channels renamed in the app: "Team" is the team's own channel (stored as
-- 'parents'; coaches, managers, the treasurer and families; never the club) and "Club" is
-- the channel with the club's director and admins (stored as 'team'). A team not in a club
-- has only its own channel, so its posts move there and new ones land there. Fungo's game
-- day posts are team business, so they go to the team's own channel too.

-- Before the other insert checks (triggers run by name): pick the channel.
create function public.chatter_post_pick_channel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.club_post_id is not null then
    new.channel := 'team';
  elsif new.from_fungo then
    new.channel := 'parents';
  elsif new.channel = 'team' and not exists (
    select 1 from public.club_code c
    where c.team_id = new.team_id and c.expires_on >= current_date
  ) then
    new.channel := 'parents';
  end if;
  return new;
end;
$$;
revoke execute on function public.chatter_post_pick_channel() from public, anon, authenticated;

create trigger chatter_post_a_channel
  before insert on public.chatter_post
  for each row execute function public.chatter_post_pick_channel();

-- Teams not in a club: everything they've posted is their own channel's.
with solo as (
  select t.id from public.team t
  where not exists (
    select 1 from public.club_code c where c.team_id = t.id and c.expires_on >= current_date
  )
),
pinned_here as (
  select distinct p.team_id from public.chatter_post p
  where p.channel = 'parents' and p.pinned_at is not null and p.team_id in (select id from solo)
)
update public.chatter_post p
set channel = 'parents',
    pinned_at = case when p.team_id in (select team_id from pinned_here) then null else p.pinned_at end
where p.channel = 'team' and p.club_post_id is null and p.team_id in (select id from solo);

-- Fungo's game day posts on club teams too.
update public.chatter_post set channel = 'parents', pinned_at = null
where from_fungo and channel = 'team';

-- Keep where people had read to, and anyone's mute of the team's Chatter.
update public.chatter_member cm
set parents_read_at = greatest(cm.last_read_at, coalesce(cm.parents_read_at, cm.last_read_at))
where not exists (
  select 1 from public.club_code c where c.team_id = cm.team_id and c.expires_on >= current_date
);

insert into public.notify_pref (user_id, scope_id, category, enabled)
select n.user_id, n.scope_id, 'parents', n.enabled
from public.notify_pref n
where n.category = 'chatter'
  and exists (select 1 from public.team t where t.id = n.scope_id)
on conflict do nothing;
