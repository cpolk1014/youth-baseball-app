-- Team notifications beyond Chatter: game changes and new family charges.
--   Coaches and managers pick what the team sends (team.notify_*; all on by default), and
--   each person can still mute any kind per team (notify_pref).
--   Changes wait in a queue (notify_event) and go out together once things settle: nothing
--   until 10 minutes after the team's last change of that kind (so building a schedule or
--   fixing a typo sends one notification, not ten), changes that cancel out send nothing,
--   and money waits for daytime (7 AM to 9 PM in the team's time zone). Game changes go out
--   any time when the game is within a day and a half.
--   A job every 5 minutes (pg_cron + pg_net) asks the server to send what's due.

alter table public.team
  add column notify_chatter boolean not null default true,
  add column notify_games boolean not null default true,
  add column notify_money boolean not null default true;

alter table public.notify_pref drop constraint notify_pref_category_check;
alter table public.notify_pref add constraint notify_pref_category_check
  check (category in ('chatter', 'coach_chatter', 'games', 'money'));

create table public.notify_event (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.team (id) on delete cascade,
  kind text not null check (kind in ('games', 'money')),
  -- games: the game; money: the charge (finance_entry).
  ref_id uuid not null,
  -- money: the family member it's for (games go to the whole team).
  user_id uuid references auth.users (id) on delete cascade,
  -- Who made the change (they don't get notified about their own change).
  actor_id uuid references auth.users (id) on delete set null,
  change text not null check (change in ('added', 'changed', 'removed', 'charge')),
  detail jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  sent_at timestamptz
);
-- One waiting event per game; a family hears about each charge once, ever.
create unique index notify_event_game_waiting on public.notify_event (ref_id)
  where kind = 'games' and sent_at is null;
create unique index notify_event_money_once on public.notify_event (ref_id, user_id)
  where kind = 'money';
create index notify_event_due on public.notify_event (team_id, kind, updated_at)
  where sent_at is null;
alter table public.notify_event enable row level security;
-- No policies: written by the triggers below, read and sent by the server (service role).

-- A game's state for the message (where = "Location · Field").
create function public.game_notify_detail(g public.game)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'date', g.game_date, 'time', g.start_time, 'opponent', g.opponent,
    'where', nullif(concat_ws(' · ', nullif(btrim(g.location), ''), nullif(btrim(g.field), '')), ''));
$$;

-- Upcoming games (today through two weeks out) that are still to be played.
create function public.game_worth_notice(g public.game)
returns boolean
language sql
stable
set search_path = ''
as $$
  select g.status = 'scheduled' and g.game_date between current_date and current_date + 14;
$$;

create function public.queue_game_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team uuid;
  v_waiting public.notify_event;
  v_changed text[] := '{}';
begin
  if tg_op = 'DELETE' then
    if not public.game_worth_notice(old) then return old; end if;
    v_team := public.season_team_id(old.season_id);
    -- The whole team or season is being deleted: nobody to tell.
    if v_team is null or not exists (select 1 from public.team where id = v_team) then
      return old;
    end if;
    select * into v_waiting from public.notify_event
    where kind = 'games' and ref_id = old.id and sent_at is null;
    if v_waiting.id is not null and v_waiting.change = 'added' then
      -- Added and removed before anyone heard: nothing to say.
      delete from public.notify_event where id = v_waiting.id;
      return old;
    end if;
    insert into public.notify_event (team_id, kind, ref_id, actor_id, change, detail)
    values (v_team, 'games', old.id, (select auth.uid()), 'removed', public.game_notify_detail(old))
    on conflict (ref_id) where kind = 'games' and sent_at is null do update
      set change = 'removed', detail = excluded.detail, actor_id = excluded.actor_id,
        updated_at = now();
    return old;
  end if;

  v_team := public.season_team_id(new.season_id);
  if tg_op = 'INSERT' then
    if not public.game_worth_notice(new) then return new; end if;
    insert into public.notify_event (team_id, kind, ref_id, actor_id, change, detail)
    values (v_team, 'games', new.id, (select auth.uid()), 'added', public.game_notify_detail(new))
    on conflict (ref_id) where kind = 'games' and sent_at is null do nothing;
    return new;
  end if;

  -- An update: only what families plan around.
  if new.game_date is distinct from old.game_date then v_changed := array_append(v_changed, 'date'); end if;
  if new.start_time is distinct from old.start_time then v_changed := array_append(v_changed, 'time'); end if;
  if new.opponent is distinct from old.opponent then v_changed := array_append(v_changed, 'opponent'); end if;
  if new.location is distinct from old.location or new.field is distinct from old.field then
    v_changed := array_append(v_changed, 'where');
  end if;
  if cardinality(v_changed) = 0 or not (public.game_worth_notice(new) or public.game_worth_notice(old)) then
    return new;
  end if;
  if new.status <> 'scheduled' then return new; end if;
  insert into public.notify_event (team_id, kind, ref_id, actor_id, change, detail)
  values (v_team, 'games', new.id, (select auth.uid()), 'changed',
    public.game_notify_detail(new) || jsonb_build_object('changed', to_jsonb(v_changed)))
  on conflict (ref_id) where kind = 'games' and sent_at is null do update set
    -- A game added and then fixed is still just "added"; changes add up.
    detail = public.game_notify_detail(new) || jsonb_build_object('changed', (
      select coalesce(jsonb_agg(distinct c), '[]'::jsonb) from (
        select jsonb_array_elements_text(coalesce(public.notify_event.detail -> 'changed', '[]')) c
        union select unnest(v_changed)
      ) x)),
    actor_id = excluded.actor_id,
    updated_at = now();
  return new;
end;
$$;
create trigger queue_game_change
  after insert or update or delete on public.game
  for each row execute function public.queue_game_change();

-- A new charge (a Bat Around or Cleanup, not an estimate) tells each family it's for, once.
create function public.queue_charge()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.finance_entry;
  v_player public.player;
begin
  select * into v_entry from public.finance_entry where id = new.entry_id;
  if v_entry.type not in ('bat_around', 'cleanup') or v_entry.estimate then
    return new;
  end if;
  select * into v_player from public.player where id = new.player_id;
  insert into public.notify_event (team_id, kind, ref_id, user_id, actor_id, change, detail)
  select v_player.team_id, 'money', new.entry_id, g.user_id, (select auth.uid()), 'charge',
    jsonb_build_object('title', v_entry.title, 'cents', new.amount_cents,
      'player', split_part(btrim(v_player.name), ' ', 1),
      'due', v_entry.due_dates[1])
  from public.player_guardian g
  where g.player_id = new.player_id
    and g.user_id is distinct from (select auth.uid())
  on conflict (ref_id, user_id) where kind = 'money' do nothing;
  return new;
end;
$$;
create trigger queue_charge
  after insert on public.finance_share
  for each row execute function public.queue_charge();

-- What's ready to send: settled for 10 minutes, the team still sends that kind, and (for
-- money, and games more than a day and a half away) it's daytime for the team. Marks them
-- sent and returns them with who should get them. Server only.
create function public.take_due_notifications()
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
    and ((e.kind = 'games' and not t.notify_games) or (e.kind = 'money' and not t.notify_money));

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
    case when d.kind = 'money' then array[d.user_id]
      else coalesce((
        select array_agg(m.user_id) from public.member m
        where m.team_id = d.team_id and m.user_id is not null
          -- Not whoever made the changes.
          and m.user_id <> all (coalesce(array_agg(d.actor_id) filter (where d.actor_id is not null), '{}'))
      ), '{}') end,
    jsonb_agg(jsonb_build_object('change', d.change, 'ref', d.ref_id) || d.detail
      order by (d.detail ->> 'date'), d.updated_at)
  from due d
  where d.id in (select id from marked)
  group by d.team_id, d.kind, d.user_id;
end;
$$;
revoke execute on function public.take_due_notifications() from public, anon, authenticated;
grant execute on function public.take_due_notifications() to service_role;

-- Turn on the 5-minute job, once, with the site's address (run in the SQL Editor on live):
--   select public.start_team_notifications('https://www.rallycap.team/api/push/flush');
create function public.start_team_notifications(p_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_url !~ '^https://[^ ]+/api/push/flush$' then
    raise exception 'Use the site''s https address ending in /api/push/flush.';
  end if;
  perform cron.unschedule('fungo-team-notifications')
  where exists (select 1 from cron.job where jobname = 'fungo-team-notifications');
  perform cron.schedule('fungo-team-notifications', '*/5 * * * *',
    format('select net.http_post(url := %L, body := ''{}''::jsonb, headers := ''{"Content-Type": "application/json"}''::jsonb)', p_url));
end;
$$;
revoke execute on function public.start_team_notifications(text) from public, anon, authenticated;
