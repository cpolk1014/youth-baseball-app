-- Who can start polls in Chatter: coaches and managers only (the default), or everyone.
-- Everyone on the team still votes.

alter table public.team
  add column chatter_polls text not null default 'staff'
    check (chatter_polls in ('everyone', 'staff'));

create or replace function public.add_chatter_poll(
  p_post uuid,
  p_options text[],
  p_multi boolean,
  p_anonymous boolean,
  p_closes_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.chatter_post;
begin
  select * into v_post from public.chatter_post where id = p_post;
  if v_post.id is null or v_post.kind <> 'poll' or v_post.author_id is distinct from (select auth.uid())
    or v_post.removed_at is not null or v_post.created_at < now() - interval '1 minute'
    or exists (select 1 from public.chatter_poll where post_id = p_post) then
    raise exception 'That isn''t a new poll of yours.' using errcode = '42501';
  end if;
  if (select t.chatter_polls from public.team t where t.id = v_post.team_id) <> 'everyone'
    and not public.has_team_role(v_post.team_id, array['coach', 'manager']::public.member_role[]) then
    raise exception 'On this team, only coaches and managers start polls.' using errcode = '42501';
  end if;
  insert into public.chatter_poll (post_id, team_id, options, multi, anonymous, closes_at)
  values (p_post, v_post.team_id, p_options, coalesce(p_multi, false), coalesce(p_anonymous, false),
    p_closes_at);
end;
$$;
