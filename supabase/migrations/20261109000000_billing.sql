-- Paying with Stripe. Seasons run August 1 to July 31 ("2026-27"). A club pays per team and
-- gets that many codes (and a new club is created for a first-time buyer); a team on its
-- own pays for its season pass. Stripe tells our server when a payment clears, and the
-- server (service role only) records it once with fulfill_purchase.

-- Seasons end July 31 (was June 30), including codes already made.
update public.club_code
  set expires_on = make_date(extract(year from expires_on)::integer, 7, 31)
  where extract(month from expires_on) = 6 and extract(day from expires_on) = 30;

create or replace function public.create_club_codes(p_org uuid, p_count integer, p_season text)
returns setof text
language plpgsql
security definer
set search_path = ''
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  new_code text;
  i integer;
  k integer;
begin
  if p_count < 1 or p_count > 200 then
    raise exception 'Make between 1 and 200 codes at a time.';
  end if;
  for i in 1..p_count loop
    loop
      new_code := '';
      for k in 1..8 loop
        new_code := new_code || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
      end loop;
      exit when not exists (select 1 from public.club_code x where x.code = new_code);
    end loop;
    insert into public.club_code (organization_id, code, season_label, expires_on)
    values (p_org, new_code, p_season, make_date(left(p_season, 4)::integer + 1, 7, 31));
    return next new_code;
  end loop;
end;
$$;
revoke execute on function public.create_club_codes(uuid, integer, text) from public, anon, authenticated;

create table public.purchase (
  id uuid primary key default gen_random_uuid(),
  stripe_session_id text not null unique,
  kind text not null check (kind in ('club', 'team')),
  organization_id uuid references public.organization (id) on delete set null,
  team_id uuid references public.team (id) on delete set null,
  season_label text not null check (season_label ~ '^[0-9]{4}-[0-9]{2}$'),
  quantity integer not null check (quantity between 1 and 200),
  amount_cents integer not null check (amount_cents >= 0),
  buyer uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.purchase enable row level security;

create policy "buyers, club admins and coaches see purchases" on public.purchase
  for select to authenticated
  using (
    buyer = (select auth.uid())
    or (organization_id is not null and public.is_club_admin(organization_id))
    or (team_id is not null and public.has_team_role(team_id, '{coach}'))
  );

-- A team (not in a club) paid for its season.
create table public.team_pass (
  team_id uuid not null references public.team (id) on delete cascade,
  season_label text not null check (season_label ~ '^[0-9]{4}-[0-9]{2}$'),
  expires_on date not null,
  purchase_id uuid references public.purchase (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (team_id, season_label)
);

alter table public.team_pass enable row level security;

create policy "team members see the team's pass" on public.team_pass
  for select to authenticated using (public.is_team_member(team_id));

/*
 * Record a paid Stripe checkout (once per session). Club: creates the club for a first-time
 * buyer (who becomes its director) and makes the codes. Team: the team's season pass.
 * Server only (service role), after Stripe confirms the payment.
 */
create function public.fulfill_purchase(
  p_session text,
  p_kind text,
  p_buyer uuid,
  p_club uuid,
  p_club_name text,
  p_team uuid,
  p_quantity integer,
  p_season text,
  p_amount integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  done public.purchase;
  org uuid := p_club;
  pid uuid;
  codes text[];
begin
  select * into done from public.purchase where stripe_session_id = p_session;
  if found then
    return jsonb_build_object('purchase', done.id, 'already', true, 'club', done.organization_id);
  end if;

  if p_kind = 'club' then
    if org is null then
      if coalesce(trim(p_club_name), '') = '' then
        raise exception 'A new club needs a name.';
      end if;
      insert into public.organization (name, created_by) values (trim(p_club_name), p_buyer)
        returning id into org;
      insert into public.club_admin (organization_id, user_id, role) values (org, p_buyer, 'director');
    elsif not exists (
      select 1 from public.club_admin a where a.organization_id = org and a.user_id = p_buyer
    ) then
      raise exception 'The buyer is not an admin of that club.';
    end if;
    insert into public.purchase (stripe_session_id, kind, organization_id, season_label, quantity, amount_cents, buyer)
      values (p_session, 'club', org, p_season, p_quantity, p_amount, p_buyer)
      returning id into pid;
    select array_agg(c) into codes from public.create_club_codes(org, p_quantity, p_season) c;
    return jsonb_build_object('purchase', pid, 'club', org, 'codes', to_jsonb(codes));
  elsif p_kind = 'team' then
    insert into public.purchase (stripe_session_id, kind, team_id, season_label, quantity, amount_cents, buyer)
      values (p_session, 'team', p_team, p_season, 1, p_amount, p_buyer)
      returning id into pid;
    insert into public.team_pass (team_id, season_label, expires_on, purchase_id)
      values (p_team, p_season, make_date(left(p_season, 4)::integer + 1, 7, 31), pid)
      on conflict (team_id, season_label) do nothing;
    return jsonb_build_object('purchase', pid, 'team', p_team);
  end if;
  raise exception 'Unknown purchase kind %', p_kind;
end;
$$;

revoke execute on function public.fulfill_purchase(text, text, uuid, uuid, text, uuid, integer, text, integer)
  from public, anon, authenticated;
grant execute on function public.fulfill_purchase(text, text, uuid, uuid, text, uuid, integer, text, integer)
  to service_role;
