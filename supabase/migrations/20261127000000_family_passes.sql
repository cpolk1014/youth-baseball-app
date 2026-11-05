-- Families pay for their kids' box score stats (an add-on, not part of a team pass or club
-- code): a season (Aug 1 - Jul 31) for one player or all of the buyer's players, just them,
-- them and a partner (1 code to share), or a blended family (3 codes). The pass belongs to
-- the kids' records, so it follows them to any team. Importing a box score needs it.

alter table public.purchase drop constraint purchase_kind_check;
alter table public.purchase add constraint purchase_kind_check check (kind in ('club', 'team', 'family'));

create table public.family_pass (
  id uuid primary key default gen_random_uuid(),
  buyer uuid references auth.users (id) on delete set null,
  plan text not null check (plan in ('solo', 'partner', 'blended')),
  -- One player (athlete_id), or every player the buyer is a parent of.
  scope text not null check (scope in ('one', 'multi')),
  athlete_id uuid references public.athlete (id) on delete set null,
  season_label text not null check (season_label ~ '^[0-9]{4}-[0-9]{2}$'),
  expires_on date not null,
  purchase_id uuid references public.purchase (id) on delete set null,
  created_at timestamptz not null default now(),
  check (scope = 'multi' or athlete_id is not null)
);
create index on public.family_pass (buyer);

-- Who the pass is for: the buyer, and whoever redeems one of its codes.
create table public.family_pass_member (
  pass_id uuid not null references public.family_pass (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (pass_id, user_id)
);
create index on public.family_pass_member (user_id);

create table public.family_code (
  code text primary key check (code ~ '^[A-Z0-9]{8}$'),
  pass_id uuid not null references public.family_pass (id) on delete cascade,
  redeemed_by uuid references auth.users (id) on delete set null,
  redeemed_at timestamptz
);
create index on public.family_code (pass_id);

alter table public.family_pass enable row level security;
alter table public.family_pass_member enable row level security;
alter table public.family_code enable row level security;
-- Read through my_family_access(); written only by the functions below.
create policy "pass holders see their pass" on public.family_pass
  for select to authenticated using (
    exists (select 1 from public.family_pass_member m where m.pass_id = id and m.user_id = (select auth.uid()))
  );
create policy "buyers see their codes" on public.family_code
  for select to authenticated using (
    exists (select 1 from public.family_pass p where p.id = pass_id and p.buyer = (select auth.uid()))
  );

-- The kids an active pass covers: its one player, or every kid its buyer is a parent of.
create function public.pass_athletes(p_pass uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.athlete_id from public.family_pass p where p.id = p_pass and p.scope = 'one'
  union
  select ag.athlete_id from public.family_pass p
    join public.athlete_guardian ag on ag.user_id = p.buyer
    where p.id = p_pass and p.scope = 'multi'
$$;
revoke execute on function public.pass_athletes(uuid) from public, anon, authenticated;

-- Whether the signed-in person has an active pass covering this kid.
create function public.family_access(p_athlete uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_athlete is not null and exists (
    select 1 from public.family_pass p
    join public.family_pass_member m on m.pass_id = p.id and m.user_id = (select auth.uid())
    where p.expires_on >= current_date
      and p_athlete in (select public.pass_athletes(p.id))
  )
$$;
revoke execute on function public.family_access(uuid) from public, anon;
grant execute on function public.family_access(uuid) to authenticated;

-- The signed-in person's passes: what they cover, and (for the buyer) the codes to share.
create function public.my_family_access()
returns table (
  pass_id uuid, plan text, scope text, season_label text, expires_on date, is_buyer boolean,
  athletes uuid[], codes jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.plan, p.scope, p.season_label, p.expires_on, p.buyer = (select auth.uid()),
    array(select public.pass_athletes(p.id)),
    case when p.buyer = (select auth.uid()) then coalesce(
      (select jsonb_agg(jsonb_build_object('code', c.code, 'used', c.redeemed_by is not null) order by c.code)
       from public.family_code c where c.pass_id = p.id), '[]'::jsonb)
    else '[]'::jsonb end
  from public.family_pass p
  join public.family_pass_member m on m.pass_id = p.id and m.user_id = (select auth.uid())
  where p.expires_on >= current_date
  order by p.expires_on desc
$$;
revoke execute on function public.my_family_access() from public, anon;
grant execute on function public.my_family_access() to authenticated;

-- A partner (or another adult in a blended family) joins the pass with a shared code.
create function public.redeem_family_code(p_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.family_code;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  select * into c from public.family_code where code = upper(trim(p_code)) for update;
  if not found then
    raise exception 'That code wasn''t found. Check it and try again.' using errcode = '22023';
  end if;
  if exists (select 1 from public.family_pass_member where pass_id = c.pass_id and user_id = (select auth.uid())) then
    return;
  end if;
  if c.redeemed_by is not null then
    raise exception 'That code has already been used.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.family_pass where id = c.pass_id and expires_on >= current_date) then
    raise exception 'That code''s season is over.' using errcode = '22023';
  end if;
  update public.family_code set redeemed_by = (select auth.uid()), redeemed_at = now() where code = c.code;
  insert into public.family_pass_member (pass_id, user_id) values (c.pass_id, (select auth.uid()));
end;
$$;
revoke execute on function public.redeem_family_code(text) from public, anon;
grant execute on function public.redeem_family_code(text) to authenticated;

-- Make a pass and its share codes. Used by the payment (and the SQL Editor, for a comp).
create function public.grant_family_pass(
  p_buyer uuid, p_plan text, p_scope text, p_athlete uuid, p_season text, p_purchase uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pass uuid;
  v_code text;
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  n integer := case p_plan when 'partner' then 1 when 'blended' then 3 else 0 end;
begin
  if p_scope = 'one' and not exists (
    select 1 from public.athlete_guardian where athlete_id = p_athlete and user_id = p_buyer
  ) then
    raise exception 'The buyer isn''t that player''s parent.';
  end if;
  insert into public.family_pass (buyer, plan, scope, athlete_id, season_label, expires_on, purchase_id)
    values (p_buyer, p_plan, p_scope, case when p_scope = 'one' then p_athlete end, p_season,
      make_date(left(p_season, 4)::integer + 1, 7, 31), p_purchase)
    returning id into v_pass;
  insert into public.family_pass_member (pass_id, user_id) values (v_pass, p_buyer);
  for i in 1..n loop
    loop
      v_code := '';
      for j in 1..8 loop
        v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
      end loop;
      exit when not exists (select 1 from public.family_code where code = v_code);
    end loop;
    insert into public.family_code (code, pass_id) values (v_code, v_pass);
  end loop;
  return v_pass;
end;
$$;
revoke execute on function public.grant_family_pass(uuid, text, text, uuid, text, uuid)
  from public, anon, authenticated;

-- Record a paid family checkout once (server only, after Stripe confirms the payment).
create function public.fulfill_family_purchase(
  p_session text, p_buyer uuid, p_plan text, p_scope text, p_athlete uuid, p_season text, p_amount integer
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
    values (p_session, 'family', p_season, 1, p_amount, p_buyer)
    returning id into pid;
  pass := public.grant_family_pass(p_buyer, p_plan, p_scope, p_athlete, p_season, pid);
  return jsonb_build_object('purchase', pid, 'pass', pass);
end;
$$;
revoke execute on function public.fulfill_family_purchase(text, uuid, text, text, uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.fulfill_family_purchase(text, uuid, text, text, uuid, text, integer)
  to service_role;

-- Adding a box score needs a pass for that kid (the box score takes the kid's record first).
drop policy "parents add their kid's game stats" on public.player_game_stat;
create policy "parents with a pass add their kid's game stats" on public.player_game_stat
  for insert to authenticated
  with check (public.is_guardian_of(player_id) and public.family_access(athlete_id));
