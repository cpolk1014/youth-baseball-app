-- Player stats, reworked: a parent buys box score stats on My profile for a number of their
-- kids ($10 for the first, $5 each after that), for one year from the day they buy. Just
-- for them: no partner or blended plans and no share codes (another parent who wants the
-- stats buys their own). Earlier passes keep the kids they covered, for the buyer only.

drop policy "pass holders see their pass" on public.family_pass;
drop policy "buyers see their codes" on public.family_code;
drop function public.redeem_family_code(text);
drop function public.revoke_family_code(text);
drop function public.my_family_access();
drop function public.family_access(uuid) cascade;
drop function public.fulfill_family_purchase(text, uuid, text, text, uuid, text, integer);
drop function public.grant_family_pass(uuid, text, text, uuid, text, uuid);

-- Which kids each pass covers.
create table public.family_pass_athlete (
  pass_id uuid not null references public.family_pass (id) on delete cascade,
  athlete_id uuid not null references public.athlete (id) on delete cascade,
  primary key (pass_id, athlete_id)
);
create index on public.family_pass_athlete (athlete_id);

alter table public.family_pass add column kids smallint not null default 1 check (kids between 1 and 20);
insert into public.family_pass_athlete (pass_id, athlete_id)
  select p.id, p.athlete_id from public.family_pass p where p.scope = 'one' and p.athlete_id is not null
  union
  select p.id, ag.athlete_id from public.family_pass p
    join public.athlete_guardian ag on ag.user_id = p.buyer
    where p.scope = 'multi'
  on conflict do nothing;
update public.family_pass p set kids = greatest(1, least(20,
  (select count(*) from public.family_pass_athlete a where a.pass_id = p.id)));

drop function public.pass_athletes(uuid);
drop table public.family_code;
drop table public.family_pass_member;
alter table public.family_pass drop column plan, drop column scope, drop column athlete_id;

alter table public.family_pass_athlete enable row level security;
create policy "buyers see their passes" on public.family_pass
  for select to authenticated using (buyer = (select auth.uid()));
create policy "buyers see their passes' kids" on public.family_pass_athlete
  for select to authenticated using (
    exists (select 1 from public.family_pass p where p.id = pass_id and p.buyer = (select auth.uid()))
  );

-- Whether the signed-in parent has an active pass covering this kid.
create function public.family_access(p_athlete uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_athlete is not null and exists (
    select 1 from public.family_pass p
    join public.family_pass_athlete a on a.pass_id = p.id and a.athlete_id = p_athlete
    where p.buyer = (select auth.uid()) and p.expires_on >= current_date
  )
$$;
revoke execute on function public.family_access(uuid) from public, anon;
grant execute on function public.family_access(uuid) to authenticated;

-- (Dropping family_access above removed the insert rule that used it; put it back.)
drop policy if exists "parents with a pass add their kid's game stats" on public.player_game_stat;
create policy "parents with a pass add their kid's game stats" on public.player_game_stat
  for insert to authenticated
  with check (public.is_guardian_of(player_id) and public.family_access(athlete_id));

-- The signed-in parent's active passes and the kids on each.
create function public.my_family_access()
returns table (pass_id uuid, kids integer, created_at timestamptz, expires_on date, athletes uuid[])
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.kids::integer, p.created_at, p.expires_on,
    array(select a.athlete_id from public.family_pass_athlete a where a.pass_id = p.id)
  from public.family_pass p
  where p.buyer = (select auth.uid()) and p.expires_on >= current_date
  order by p.expires_on desc
$$;
revoke execute on function public.my_family_access() from public, anon;
grant execute on function public.my_family_access() to authenticated;

-- Make a pass for a number of the buyer's kids, for a year from today. Kids not named fill
-- in from the buyer's kids (and kids they're linked to later take any open spots).
-- Used by the payment, and in the SQL Editor for a comp.
create function public.grant_family_pass(
  p_buyer uuid, p_kids integer, p_athletes uuid[] default null, p_purchase uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pass uuid;
begin
  if p_kids is null or p_kids < 1 or p_kids > 20 then
    raise exception 'Between 1 and 20 kids.';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_athletes, '{}')) x
    where not exists (select 1 from public.athlete_guardian where athlete_id = x and user_id = p_buyer)
  ) then
    raise exception 'The buyer isn''t a parent of every player picked.';
  end if;
  insert into public.family_pass (buyer, kids, season_label, expires_on, purchase_id)
    values (p_buyer, p_kids,
      -- The season it was bought in, for the purchases list (it lasts a year either way).
      case when extract(month from current_date) >= 8
        then to_char(current_date, 'YYYY') || '-' || to_char(current_date + interval '1 year', 'YY')
        else to_char(current_date - interval '1 year', 'YYYY') || '-' || to_char(current_date, 'YY') end,
      (current_date + interval '1 year')::date, p_purchase)
    returning id into v_pass;
  insert into public.family_pass_athlete (pass_id, athlete_id)
    select v_pass, a from (
      select x as a, 0 as o from unnest(coalesce(p_athletes, '{}')) x
      union all
      select ag.athlete_id, 1 from public.athlete_guardian ag
        where ag.user_id = p_buyer and p_athletes is null
    ) picks
    group by a
    order by min(o), a
    limit p_kids
    on conflict do nothing;
  return v_pass;
end;
$$;
revoke execute on function public.grant_family_pass(uuid, integer, uuid[], uuid)
  from public, anon, authenticated;

-- Record a paid player stats checkout once (server only, after Stripe confirms it).
create function public.fulfill_family_purchase(
  p_session text, p_buyer uuid, p_kids integer, p_athletes uuid[], p_season text, p_amount integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  done public.purchase;
  pid uuid;
  pass uuid;
begin
  select * into done from public.purchase where stripe_session_id = p_session;
  if found then
    return jsonb_build_object('purchase', done.id, 'already', true);
  end if;
  insert into public.purchase (stripe_session_id, kind, season_label, quantity, amount_cents, buyer)
    values (p_session, 'family', p_season, p_kids, p_amount, p_buyer)
    returning id into pid;
  pass := public.grant_family_pass(p_buyer, p_kids, p_athletes, pid);
  return jsonb_build_object('purchase', pid, 'pass', pass);
end;
$$;
revoke execute on function public.fulfill_family_purchase(text, uuid, integer, uuid[], text, integer)
  from public, anon, authenticated;
grant execute on function public.fulfill_family_purchase(text, uuid, integer, uuid[], text, integer)
  to service_role;

-- A kid the buyer is linked to later takes an open spot on their pass.
create function public.fill_family_pass()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.family_pass_athlete (pass_id, athlete_id)
    select p.id, new.athlete_id from public.family_pass p
    where p.buyer = new.user_id and p.expires_on >= current_date
      and (select count(*) from public.family_pass_athlete a where a.pass_id = p.id) < p.kids
      and not exists (
        select 1 from public.family_pass_athlete a join public.family_pass q on q.id = a.pass_id
        where a.athlete_id = new.athlete_id and q.buyer = new.user_id and q.expires_on >= current_date
      )
    order by p.expires_on
    limit 1
  on conflict do nothing;
  return new;
end;
$$;
create trigger athlete_guardian_fill_pass
  after insert on public.athlete_guardian
  for each row execute function public.fill_family_pass();

-- Joining a kid's records ("same player as on the Knights") keeps their pass with them.
create or replace function public.link_player_athlete(p_player_id uuid, p_athlete_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old uuid;
begin
  if not public.is_guardian_of(p_player_id) or not public.is_athlete_guardian(p_athlete_id) then
    raise exception 'You can only join your own kids.' using errcode = '42501';
  end if;
  select athlete_id into v_old from public.player where id = p_player_id;
  if v_old = p_athlete_id then
    return;
  end if;
  update public.player set athlete_id = p_athlete_id where id = p_player_id;
  if v_old is not null then
    update public.player_game_stat set athlete_id = p_athlete_id where athlete_id = v_old;
    insert into public.athlete_guardian (athlete_id, user_id)
      select p_athlete_id, user_id from public.athlete_guardian where athlete_id = v_old
      on conflict do nothing;
    insert into public.family_pass_athlete (pass_id, athlete_id)
      select pass_id, p_athlete_id from public.family_pass_athlete where athlete_id = v_old
      on conflict do nothing;
    if not exists (select 1 from public.player where athlete_id = v_old) then
      delete from public.athlete where id = v_old;
    end if;
  end if;
end;
$$;

-- Everything the signed-in person has bought, newest first, with when each runs out.
create function public.my_purchases()
returns table (
  id uuid, bought_at timestamptz, kind text, what text, quantity integer, amount_cents integer,
  expires_on date
)
language sql
stable
security definer
set search_path = ''
as $$
  select pu.id, pu.created_at, pu.kind,
    case pu.kind
      when 'club' then coalesce(o.name, 'Club') || ': ' || pu.quantity || ' team code' || case when pu.quantity = 1 then '' else 's' end
      when 'team' then coalesce(t.name, 'Team') || ': season'
      else 'Player stats: ' || coalesce(
        (select string_agg(a.name, ', ' order by a.name) from public.family_pass_athlete fa
          join public.athlete a on a.id = fa.athlete_id where fa.pass_id = fp.id),
        pu.quantity || ' player' || case when pu.quantity = 1 then '' else 's' end)
    end,
    pu.quantity, pu.amount_cents,
    case pu.kind
      when 'family' then fp.expires_on
      else make_date(left(pu.season_label, 4)::integer + 1, 7, 31)
    end
  from public.purchase pu
  left join public.organization o on o.id = pu.organization_id
  left join public.team t on t.id = pu.team_id
  left join public.family_pass fp on fp.purchase_id = pu.id
  where pu.buyer = (select auth.uid())
  union all
  -- Passes given without a payment (a comp).
  select fp.id, fp.created_at, 'family',
    'Player stats (complimentary): ' || coalesce(
      (select string_agg(a.name, ', ' order by a.name) from public.family_pass_athlete fa
        join public.athlete a on a.id = fa.athlete_id where fa.pass_id = fp.id), ''),
    fp.kids::integer, 0, fp.expires_on
  from public.family_pass fp
  where fp.buyer = (select auth.uid()) and fp.purchase_id is null
  order by 2 desc
$$;
revoke execute on function public.my_purchases() from public, anon;
grant execute on function public.my_purchases() to authenticated;
