-- The team's creator is its Owner: a coach who can never be removed or demoted, and whose
-- role nobody else can be given. One Owner per team. Safe to run again if it stopped
-- partway.

-- A team keeps at least one coach; the Owner counts as one.
create or replace function public.keep_a_coach()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'coach'
    and (tg_op = 'DELETE' or new.role <> 'coach' or new.team_id <> old.team_id)
    and exists (select 1 from public.team where id = old.team_id)
    and not exists (
      select 1 from public.member
      where team_id = old.team_id and role in ('coach', 'owner') and id <> old.id
    ) then
    raise exception 'a team needs at least one coach';
  end if;
  return coalesce(new, old);
end;
$$;

-- Owners can do everything coaches can: anywhere a policy asks for 'coach', 'owner' counts.
create or replace function public.has_team_role(p_team_id uuid, p_roles public.member_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.member m
    where m.team_id = p_team_id and m.user_id = (select auth.uid())
      and (m.role = any (p_roles) or (m.role = 'owner' and 'coach' = any (p_roles)))
  );
$$;

-- Whoever creates a team becomes its Owner (a plain coach if the team records no creator,
-- which the app never does: created_by defaults to the signed-in user).
create or replace function public.add_team_creator_as_coach()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    insert into public.member (team_id, user_id, role) values (
      new.id,
      auth.uid(),
      case when new.created_by = auth.uid() then 'owner' else 'coach' end::public.member_role
    );
  end if;
  return new;
end;
$$;

-- (Re-created below; dropped first so a re-run can do this step.)
drop trigger if exists member_protect_owner on public.member;

-- Existing teams: the creator's coach membership becomes Owner; if the creator isn't a
-- coach on the team anymore, the longest-serving coach does.
with pick as (
  select distinct on (m.team_id) m.id
  from public.member m
  join public.team t on t.id = m.team_id
  where m.role = 'coach'
    and not exists (select 1 from public.member o where o.team_id = m.team_id and o.role = 'owner')
  order by m.team_id, (m.user_id = t.created_by) desc nulls last, m.created_at, m.id
)
update public.member set role = 'owner' where id in (select id from pick);

create unique index if not exists member_one_owner on public.member (team_id) where role = 'owner';

-- Invite links can't make someone an Owner.
alter table public.invite drop constraint if exists invite_not_owner;
alter table public.invite add constraint invite_not_owner check (role <> 'owner');

-- Protect the Owner: can't be removed, demoted, moved, or handed to someone else.
-- Removing members while the whole team is being deleted is still allowed.
create or replace function public.protect_team_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.role = 'owner' and new.user_id is distinct from (
      select created_by from public.team where id = new.team_id
    ) then
      raise exception 'only the person who created the team can be its owner'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.role = 'owner'
      and (new.role <> 'owner' or new.user_id <> old.user_id or new.team_id <> old.team_id) then
      raise exception 'the team owner can''t be changed' using errcode = 'check_violation';
    end if;
    if new.role = 'owner' and old.role <> 'owner' then
      raise exception 'nobody can be made the team owner' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if old.role = 'owner' and exists (select 1 from public.team where id = old.team_id) then
    raise exception 'the team owner can''t be removed' using errcode = 'check_violation';
  end if;
  return old;
end;
$$;

create trigger member_protect_owner
before insert or update or delete on public.member
for each row execute function public.protect_team_owner();
