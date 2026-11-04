-- Starting a club is free and self-serve: anyone signed in names a club and becomes its
-- director. They set up the club's look, uniforms and library right away, and buy team codes
-- ($99 per team, Stripe) when they're ready to bring teams in. Up to 5 clubs per person.

create function public.start_my_club(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  n text := nullif(trim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), '');
  org uuid;
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = 'insufficient_privilege';
  end if;
  if n is null or length(n) > 80 then
    raise exception 'Give the club a name (up to 80 characters).' using errcode = 'P0001';
  end if;
  if (select count(*) from public.organization where created_by = me) >= 5 then
    raise exception 'You''ve started 5 clubs already. Contact RallyCap for more.' using errcode = 'P0001';
  end if;
  insert into public.organization (name, created_by) values (n, me) returning id into org;
  insert into public.club_admin (organization_id, user_id, role) values (org, me, 'director');
  return org;
end;
$$;

revoke execute on function public.start_my_club(text) from public, anon;
grant execute on function public.start_my_club(text) to authenticated;
