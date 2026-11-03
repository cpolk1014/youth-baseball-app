-- My Profile: the name you set is the name every team and club you're on shows for you.

create function public.set_my_name(p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  n text := nullif(trim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), '');
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first.' using errcode = 'insufficient_privilege';
  end if;
  if n is null or length(n) > 60 then
    raise exception 'Use a name of 1 to 60 characters.' using errcode = 'P0001';
  end if;
  update public.member set display_name = n where user_id = (select auth.uid());
  update public.club_admin set display_name = n where user_id = (select auth.uid());
end;
$$;

revoke execute on function public.set_my_name(text) from public, anon;
grant execute on function public.set_my_name(text) to authenticated;
