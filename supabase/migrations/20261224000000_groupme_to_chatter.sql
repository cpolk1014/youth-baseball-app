-- Chatter replaces GroupMe. The automatic game day post ("Game against The Cubs / Chabills
-- Field / 7:00 PM / Arrive by 6:00 PM / White combo") now goes into the team's Chatter as a post
-- from Fungo, on the same schedule, instead of to a GroupMe bot; the 5-minute notification job
-- announces it. Saved GroupMe bots stay in their tables, unused.

alter table public.chatter_post add column from_fungo boolean not null default false;

-- People can't make their own post look like the club's, or like Fungo's.
create or replace function public.chatter_post_no_reactions()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.reactions := '[]'::jsonb;
  if current_user in ('authenticated', 'anon') then
    new.club_post_id := null;
    new.club := null;
    new.from_fungo := false;
  end if;
  return new;
end;
$$;

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
    select tm.id, tm.timezone, tm.game_post_mode, tm.game_post_days
    from public.team tm
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
          insert into public.chatter_post (team_id, author_id, body, from_fungo)
          values (t.id, null, msg, true);
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
