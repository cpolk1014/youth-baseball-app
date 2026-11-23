-- Box score notices: when a coach adds a game's box score, each kid's linked parents hear how
-- their kid did ("Mason went 2 for 3 with a double vs Cubs."). Parents with a Player pass for
-- the kid get the line; others get a teaser with no numbers ("The box score from Sat vs Cubs
-- is in. See how Mason did."), which opens My player and its Unlock. Like new charges: queued
-- in notify_event, sent once settled for 10 minutes and only by day (7 AM to 9 PM, the team's
-- time zone), each parent once per kid per game (a corrected box score doesn't send again).
-- Coaches and managers can turn it off for the team (team.notify_stats); each parent can mute
-- it per team (notify_pref category 'stats').

alter table public.team add column notify_stats boolean not null default true;

alter table public.notify_pref drop constraint notify_pref_category_check;
alter table public.notify_pref add constraint notify_pref_category_check
  check (category in ('chatter', 'parents', 'coach_chatter', 'games', 'money', 'mention', 'stats'));

alter table public.notify_event drop constraint notify_event_kind_check;
alter table public.notify_event add constraint notify_event_kind_check
  check (kind in ('games', 'money', 'stats'));
alter table public.notify_event drop constraint notify_event_change_check;
alter table public.notify_event add constraint notify_event_change_check
  check (change in ('added', 'changed', 'removed', 'charge', 'boxscore'));
-- stats: ref_id is the game, user_id the parent, detail.player_id the kid. Once ever.
create unique index notify_event_stats_once on public.notify_event (ref_id, user_id, (detail ->> 'player_id'))
  where kind = 'stats';

create function public.queue_box_score()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game record;
  v_player public.player;
begin
  if new.source <> 'coach' or new.game_id is null or new.player_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.batting is not distinct from old.batting
    and new.pitching is not distinct from old.pitching then
    return new;
  end if;
  select * into v_player from public.player where id = new.player_id;
  select g.game_date, g.opponent, s.team_id into v_game
    from public.game g join public.season s on s.id = g.season_id where g.id = new.game_id;
  if v_game.team_id is null then
    return new;
  end if;
  insert into public.notify_event (team_id, kind, ref_id, user_id, actor_id, change, detail)
  select v_game.team_id, 'stats', new.game_id, g.user_id, (select auth.uid()), 'boxscore',
    jsonb_build_object(
      'player_id', new.player_id,
      'player', split_part(btrim(v_player.name), ' ', 1),
      'date', v_game.game_date,
      'opponent', v_game.opponent,
      'batting', new.batting,
      'pitching', new.pitching)
  from public.player_guardian g
  where g.player_id = new.player_id
    and g.user_id is distinct from (select auth.uid())
  on conflict (ref_id, user_id, (detail ->> 'player_id')) where kind = 'stats' do update
    set detail = excluded.detail, actor_id = excluded.actor_id, updated_at = now()
    where public.notify_event.sent_at is null;
  return new;
end;
$$;
create trigger queue_box_score
  after insert or update on public.player_game_stat
  for each row execute function public.queue_box_score();

-- What's ready to send (as before, plus box scores: by day, to the one parent, each line
-- marked unlocked when that parent's Player pass covers the kid).
create or replace function public.take_due_notifications()
returns table (
  team_id uuid, team_name text, kind text, user_ids uuid[], events jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Kinds the team stopped sending: drop them.
  update public.notify_event e set sent_at = now()
  from public.team t
  where t.id = e.team_id and e.sent_at is null
    and ((e.kind = 'games' and not t.notify_games) or (e.kind = 'money' and not t.notify_money)
      or (e.kind = 'stats' and not t.notify_stats));

  return query
  with waiting as (
    select e.*, t.name as tname, t.timezone,
      extract(hour from now() at time zone t.timezone) as local_hour,
      max(e.updated_at) over (partition by e.team_id, e.kind, e.user_id) as last_change
    from public.notify_event e join public.team t on t.id = e.team_id
    where e.sent_at is null
  ),
  due as (
    select w.* from waiting w
    where w.last_change < now() - interval '10 minutes'
      and (
        (w.local_hour >= 7 and w.local_hour < 21)
        or (w.kind = 'games' and coalesce((w.detail ->> 'date')::date, current_date)
              <= (now() at time zone w.timezone)::date + 1)
      )
  ),
  marked as (
    update public.notify_event e set sent_at = now()
    from due d where e.id = d.id
    returning e.id
  )
  select d.team_id, max(d.tname), d.kind,
    case when d.kind in ('money', 'stats') then array[d.user_id]
      else coalesce((
        select array_agg(m.user_id) from public.member m
        where m.team_id = d.team_id and m.user_id is not null
          -- Not whoever made the changes.
          and m.user_id <> all (coalesce(array_agg(d.actor_id) filter (where d.actor_id is not null), '{}'))
      ), '{}') end,
    jsonb_agg(jsonb_build_object('change', d.change, 'ref', d.ref_id) || d.detail
      || case when d.kind = 'stats' then jsonb_build_object('unlocked', exists (
          select 1 from public.player p
          join public.family_pass_athlete a on a.athlete_id = p.athlete_id
          join public.family_pass fp on fp.id = a.pass_id
          where p.id = (d.detail ->> 'player_id')::uuid
            and fp.buyer = d.user_id and fp.expires_on >= current_date))
        else '{}'::jsonb end
      order by (d.detail ->> 'date'), d.updated_at)
  from due d
  where d.id in (select id from marked)
  group by d.team_id, d.kind, d.user_id;
end;
$$;
revoke execute on function public.take_due_notifications() from public, anon, authenticated;
grant execute on function public.take_due_notifications() to service_role;
