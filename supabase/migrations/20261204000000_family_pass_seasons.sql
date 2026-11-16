-- Player stats passes run for a season (through July 31) like team passes and club codes,
-- instead of a year from the day bought. The price is prorated by the app; this sets the
-- end date. Passes already sold keep the end date they were sold with.

-- The season on sale today: this one, or from June 1 next season (the rest of this one comes
-- with it). "2026-27".
create or replace function public.season_on_sale()
returns text
language sql
stable
set search_path = ''
as $$
  select case when extract(month from current_date) >= 6
    then to_char(current_date, 'YYYY') || '-' || to_char(current_date + interval '1 year', 'YY')
    else to_char(current_date - interval '1 year', 'YYYY') || '-' || to_char(current_date, 'YY') end
$$;

drop function public.grant_family_pass(uuid, integer, uuid[], uuid);

-- Give a parent player stats for some of their kids, through the end of a season (the one on
-- sale when not given). Used by the payment, and in the SQL Editor for a comp.
create function public.grant_family_pass(
  p_buyer uuid,
  p_kids integer,
  p_athletes uuid[] default null,
  p_purchase uuid default null,
  p_season text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pass uuid;
  v_season text := coalesce(p_season, public.season_on_sale());
begin
  if p_kids is null or p_kids < 1 or p_kids > 20 then
    raise exception 'Between 1 and 20 kids.';
  end if;
  if v_season !~ '^\d{4}-\d{2}$' then
    raise exception 'Season should look like 2026-27.';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_athletes, '{}')) x
    where not exists (select 1 from public.athlete_guardian where athlete_id = x and user_id = p_buyer)
  ) then
    raise exception 'The buyer isn''t a parent of every player picked.';
  end if;
  insert into public.family_pass (buyer, kids, season_label, expires_on, purchase_id)
    values (p_buyer, p_kids, v_season, make_date(left(v_season, 4)::integer + 1, 7, 31), p_purchase)
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
revoke execute on function public.grant_family_pass(uuid, integer, uuid[], uuid, text)
  from public, anon, authenticated;

-- Record a paid player stats checkout once (server only, after Stripe confirms it).
create or replace function public.fulfill_family_purchase(
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
  pass := public.grant_family_pass(p_buyer, p_kids, p_athletes, pid, p_season);
  return jsonb_build_object('purchase', pid, 'pass', pass);
end;
$$;
revoke execute on function public.fulfill_family_purchase(text, uuid, integer, uuid[], text, integer)
  from public, anon, authenticated;
grant execute on function public.fulfill_family_purchase(text, uuid, integer, uuid[], text, integer)
  to service_role;
