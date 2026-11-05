-- The paywall for teams. A team "has paid" while it has an active club code or team pass
-- (each season ends July 31, then 5 days' grace), or is still free: a new team's 14-day
-- trial, or free through July 31, 2027 for every team made before the paywall. When it
-- hasn't paid, paid features turn read-only: everything made with them stays, nothing new
-- (team money, GroupMe, the stats import, competitive lineups, homework, the AI tools).

alter table public.team add column free_until date;
alter table public.team add column free_kind text check (free_kind in ('trial', 'launch'));
-- Teams made before the paywall: free through this season.
update public.team set free_until = '2027-07-31', free_kind = 'launch';
alter table public.team alter column free_until set default (current_date + 14);
alter table public.team alter column free_kind set default 'trial';
alter table public.team alter column free_until set not null;
alter table public.team alter column free_kind set not null;

/** Days a team keeps paid features after its pass or club code ends. */
create function public.paid_grace_days()
returns integer
language sql
immutable
as $$ select 5 $$;

create function public.team_paid(p_team uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.team t where t.id = p_team and t.free_until >= current_date)
    or exists (
      select 1 from public.team_pass p
      where p.team_id = p_team and p.expires_on + public.paid_grace_days() >= current_date
    )
    or exists (
      select 1 from public.club_code c
      where c.team_id = p_team and c.expires_on + public.paid_grace_days() >= current_date
    )
$$;
revoke execute on function public.team_paid(uuid) from public, anon;
grant execute on function public.team_paid(uuid) to authenticated, service_role;

-- What the app shows about a team's plan (team members only).
--   kind: 'club' | 'pass' (paid through `until`), 'grace' (ended `ends`, works through
--   `until`), 'trial' | 'launch' (free through `until`), 'none' (paid features are locked).
--   next_season: whether next season (from June) is already paid.
create function public.team_plan(p_team uuid)
returns table (paid boolean, kind text, until date, ends date, next_season boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_free date;
  v_free_kind text;
  v_pass date;
  v_club date;
  v_end date;
  v_season_end date := make_date(
    extract(year from current_date)::integer + case when extract(month from current_date) >= 8 then 1 else 0 end,
    7, 31);
begin
  if not public.is_team_member(p_team) then
    return;
  end if;
  select free_until, free_kind into v_free, v_free_kind from public.team where id = p_team;
  select max(expires_on) into v_pass from public.team_pass where team_id = p_team;
  select max(expires_on) into v_club from public.club_code where team_id = p_team;
  v_end := greatest(v_pass, v_club);
  next_season := v_end is not null and v_end > v_season_end;
  if v_end is not null and v_end >= current_date then
    paid := true; kind := case when v_club = v_end then 'club' else 'pass' end; until := v_end; ends := v_end;
  elsif v_free >= current_date then
    paid := true; kind := v_free_kind; until := v_free; ends := v_free;
  elsif v_end is not null and v_end + public.paid_grace_days() >= current_date then
    paid := true; kind := 'grace'; until := v_end + public.paid_grace_days(); ends := v_end;
  else
    paid := false; kind := 'none'; until := null; ends := coalesce(v_end, v_free);
  end if;
  return next;
end;
$$;
revoke execute on function public.team_plan(uuid) from public, anon;
grant execute on function public.team_plan(uuid) to authenticated;

-- One check for every locked write: a clear message the app shows as is.
create function public.require_team_paid(p_team uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_team is not null and not public.team_paid(p_team) then
    raise exception 'This is part of RallyCap''s paid features. A coach can renew the team on Coaches & parents.'
      using errcode = 'P0402';
  end if;
end;
$$;
revoke execute on function public.require_team_paid(uuid) from public, anon;

-- ── team money: read-only when unpaid ──
create function public.paid_finance_entry()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_team_paid(public.season_team_id(coalesce(new.season_id, old.season_id)));
  return coalesce(new, old);
end;
$$;
create trigger finance_entry_paid
  before insert or update or delete on public.finance_entry
  for each row execute function public.paid_finance_entry();

-- ── GroupMe: connecting (or changing) the team's bot; disconnecting stays allowed ──
create function public.paid_team_groupme()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_team_paid(new.team_id);
  return new;
end;
$$;
create trigger team_groupme_paid
  before insert or update on public.team_groupme
  for each row execute function public.paid_team_groupme();

-- ── GameChanger stats import ──
create function public.paid_team_stats()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_team_paid(public.season_team_id(new.season_id));
  return new;
end;
$$;
create trigger team_stats_paid
  before insert or update on public.team_stats
  for each row execute function public.paid_team_stats();

-- ── homework: assigning plays ──
create function public.paid_play_assignment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_team_paid(new.team_id);
  return new;
end;
$$;
create trigger play_assignment_paid
  before insert on public.play_assignment
  for each row execute function public.paid_play_assignment();

-- ── competitive lineups: switching a game to competitive ──
create function public.paid_competitive_game()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.lineup_style = 'competitive'
    and (tg_op = 'INSERT' or old.lineup_style is distinct from 'competitive') then
    perform public.require_team_paid(public.season_team_id(new.season_id));
  end if;
  return new;
end;
$$;
create trigger game_competitive_paid
  before insert or update of lineup_style on public.game
  for each row execute function public.paid_competitive_game();

-- ── automatic game day posts: only for teams that have paid ──
create or replace function public.send_due_game_posts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
  d date;
  first_start timestamptz;
  msg text;
  sent int := 0;
begin
  for t in
    select tm.id, tm.timezone, tm.game_post_mode, tm.game_post_days, b.bot_id
    from public.team tm
    join public.team_groupme b on b.team_id = tm.id
    where tm.game_post_mode <> 'off' and tm.optioned_at is null and public.team_paid(tm.id)
  loop
    for d in
      select distinct gm.game_date
      from public.game gm join public.season s on s.id = gm.season_id
      where s.team_id = t.id and gm.status = 'scheduled'
        and gm.game_date between (now() at time zone t.timezone)::date
          and (now() at time zone t.timezone)::date + 4
        and not exists (
          select 1 from public.game_post_log l where l.team_id = t.id and l.game_date = gm.game_date
        )
    loop
      first_start := (
        select ((d + coalesce(min(gm.start_time), time '23:59'))::timestamp at time zone t.timezone)
        from public.game gm join public.season s on s.id = gm.season_id
        where s.team_id = t.id and gm.game_date = d and gm.status = 'scheduled'
      );
      if now() >= public.game_post_send_at(t.id, d) and now() < first_start then
        msg := public.game_day_message(
          t.id, d, (now() at time zone t.timezone)::date = d
        );
        if msg is not null then
          perform net.http_post(
            url := 'https://api.groupme.com/v3/bots/post',
            body := jsonb_build_object('bot_id', t.bot_id, 'text', msg),
            headers := '{"Content-Type": "application/json"}'::jsonb
          );
          insert into public.game_post_log (team_id, game_date) values (t.id, d)
          on conflict do nothing;
          sent := sent + 1;
        end if;
      end if;
    end loop;
  end loop;
  return sent;
end;
$$;
revoke execute on function public.send_due_game_posts() from public, anon, authenticated;
