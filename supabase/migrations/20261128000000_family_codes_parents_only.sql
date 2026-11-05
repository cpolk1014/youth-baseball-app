-- Share codes are for the kid's other parents only. Redeeming one needs the person to be
-- linked as a parent of a kid the pass covers, on one of that kid's teams; a redeemer only
-- gets the kids they're a parent of; and the buyer sees who used each code and can take a
-- code back (that person loses the pass, and the buyer gets a new code to give out).

-- Access: the buyer gets every kid the pass covers; anyone who joined with a code gets only
-- the covered kids they're a parent of.
create or replace function public.family_access(p_athlete uuid)
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
      and (
        p.buyer = (select auth.uid())
        or exists (
          select 1 from public.athlete_guardian ag
          where ag.athlete_id = p_athlete and ag.user_id = (select auth.uid())
        )
      )
  )
$$;

create or replace function public.redeem_family_code(p_code text)
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
  -- Only a parent of a kid the pass covers, linked to that kid on one of their teams.
  if not exists (
    select 1 from public.player_guardian g
    join public.player p on p.id = g.player_id
    where g.user_id = (select auth.uid())
      and p.athlete_id in (select public.pass_athletes(c.pass_id))
  ) then
    raise exception 'This code is only for the player''s parents. Link yourself to your player on their team first (Coaches & parents), then enter it again.'
      using errcode = '42501';
  end if;
  update public.family_code set redeemed_by = (select auth.uid()), redeemed_at = now() where code = c.code;
  insert into public.family_pass_member (pass_id, user_id) values (c.pass_id, (select auth.uid()));
end;
$$;

-- The buyer takes a code back: whoever used it loses the pass, and the code is replaced with
-- a fresh one to give out.
create function public.revoke_family_code(p_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.family_code;
  v_code text;
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  select fc.* into c from public.family_code fc
    join public.family_pass p on p.id = fc.pass_id
    where fc.code = upper(trim(p_code)) and p.buyer = (select auth.uid())
    for update of fc;
  if not found then
    raise exception 'Only the parent who paid can take a code back.' using errcode = '42501';
  end if;
  if c.redeemed_by is not null then
    delete from public.family_pass_member where pass_id = c.pass_id and user_id = c.redeemed_by;
  end if;
  loop
    v_code := '';
    for j in 1..8 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
    end loop;
    exit when not exists (select 1 from public.family_code where code = v_code);
  end loop;
  delete from public.family_code where code = c.code;
  insert into public.family_code (code, pass_id) values (v_code, c.pass_id);
  return v_code;
end;
$$;
revoke execute on function public.revoke_family_code(text) from public, anon;
grant execute on function public.revoke_family_code(text) to authenticated;

-- The buyer sees who used each code (the name they go by on their teams).
create or replace function public.my_family_access()
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
    -- What this person gets from the pass (a code holder: only their own kids).
    array(
      select a from public.pass_athletes(p.id) a
      where p.buyer = (select auth.uid())
        or exists (select 1 from public.athlete_guardian ag where ag.athlete_id = a and ag.user_id = (select auth.uid()))
    ),
    case when p.buyer = (select auth.uid()) then coalesce(
      (select jsonb_agg(jsonb_build_object(
          'code', c.code,
          'used', c.redeemed_by is not null,
          'usedBy', case when c.redeemed_by is not null then coalesce(
            (select m.display_name from public.member m
              where m.user_id = c.redeemed_by and m.display_name is not null limit 1),
            'Someone')
          end
        ) order by c.code)
       from public.family_code c where c.pass_id = p.id), '[]'::jsonb)
    else '[]'::jsonb end
  from public.family_pass p
  join public.family_pass_member m on m.pass_id = p.id and m.user_id = (select auth.uid())
  where p.expires_on >= current_date
  order by p.expires_on desc
$$;
