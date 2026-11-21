-- Tags in Chatter: a post can tag adults on the team ("@Dana Reyes"), all its coaches
-- ("@coaches", anyone) or everyone ("@everyone", coaches and managers only). Tags are user
-- ids or the words 'coaches' / 'everyone'; the post is still seen by the whole team.

alter table public.chatter_post
  add column mentions text[] not null default '{}' check (cardinality(mentions) <= 20);

create function public.check_chatter_mentions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tag text;
begin
  if cardinality(new.mentions) = 0 then
    return new;
  end if;
  new.mentions := array(select distinct unnest(new.mentions));
  foreach v_tag in array new.mentions loop
    if v_tag = 'coaches' then
      continue;
    elsif v_tag = 'everyone' then
      if not exists (
        select 1 from public.member m
        where m.team_id = new.team_id and m.user_id = new.author_id
          and m.role in ('owner', 'coach', 'manager')
      ) then
        raise exception 'Only coaches and managers can tag everyone.' using errcode = '42501';
      end if;
    elsif v_tag !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or not exists (
        select 1 from public.member m where m.team_id = new.team_id and m.user_id = v_tag::uuid
      ) then
      raise exception 'You can only tag people on this team.' using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;
create trigger check_chatter_mentions
  before insert on public.chatter_post
  for each row execute function public.check_chatter_mentions();

-- Tags can be muted on their own later (My profile); for now they always notify.
alter table public.notify_pref drop constraint notify_pref_category_check;
alter table public.notify_pref add constraint notify_pref_category_check
  check (category in ('chatter', 'coach_chatter', 'games', 'money', 'mention'));
