-- A team's free period, creator and club are set only by the database (trial default,
-- redeem_club_code, the SQL Editor), never from the browser. Before this, a coach could
-- update team.free_until themselves and unlock every paid feature.
create or replace function public.lock_team_billing_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Security-definer functions run as their owner, and the service role isn't a browser user.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.free_until := current_date + 14;
    new.free_kind := 'trial';
    new.organization_id := null;
    return new;
  end if;
  if new.free_until is distinct from old.free_until
    or new.free_kind is distinct from old.free_kind
    or new.created_by is distinct from old.created_by
    or new.organization_id is distinct from old.organization_id then
    raise exception 'A team''s plan and club can''t be changed here.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.lock_team_billing_columns() from public, anon, authenticated;

drop trigger if exists lock_team_billing_columns on public.team;
create trigger lock_team_billing_columns
  before insert or update on public.team
  for each row execute function public.lock_team_billing_columns();
