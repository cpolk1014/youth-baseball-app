-- Chatter reactions: anyone on the team taps an emoji on a post (any emoji, up to 3 different
-- ones per person per post). Each reaction is a row in chatter_reaction; the post carries a
-- summary (chatter_post.reactions: [{"e": "👍", "u": [user ids]}], oldest emoji first) so the
-- feed loads them with the post and live updates come with the post's own change.

create table public.chatter_reaction (
  post_id uuid not null references public.chatter_post (id) on delete cascade,
  team_id uuid not null references public.team (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, emoji)
);
create index chatter_reaction_team_idx on public.chatter_reaction (team_id);
alter table public.chatter_reaction enable row level security;
create policy chatter_reaction_read on public.chatter_reaction for select to authenticated
  using (public.is_team_member(team_id));

alter table public.chatter_post
  add column reactions jsonb not null default '[]'::jsonb
    check (jsonb_typeof(reactions) = 'array');

-- A new post starts with no reactions, whatever the insert says.
create function public.chatter_post_no_reactions()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.reactions := '[]'::jsonb;
  return new;
end;
$$;
create trigger chatter_post_no_reactions
  before insert on public.chatter_post
  for each row execute function public.chatter_post_no_reactions();

-- Add (p_on true) or take back (false) my emoji on a post.
create function public.react_chatter_post(p_post uuid, p_emoji text, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.chatter_post;
  v_state public.chatter_member;
  v_me uuid := (select auth.uid());
  v_emoji text := btrim(coalesce(p_emoji, ''));
begin
  select * into v_post from public.chatter_post where id = p_post for update;
  if v_post.id is null or not public.is_team_member(v_post.team_id) then
    raise exception 'You''re not on this team.' using errcode = '42501';
  end if;
  if v_post.removed_at is not null then
    raise exception 'That post was removed.' using errcode = '42501';
  end if;

  if p_on then
    perform public.require_team_paid(v_post.team_id);
    select * into v_state from public.chatter_member
    where team_id = v_post.team_id and user_id = v_me;
    if v_state.agreed_at is null then
      raise exception 'Agree to Chatter''s rules first.' using errcode = '42501';
    end if;
    if v_state.muted_until is not null and v_state.muted_until > now() then
      raise exception 'A coach has paused your posting in Chatter for now.' using errcode = '42501';
    end if;
    -- An emoji: short, with no letters, spaces or markup. (Keycaps like 1️⃣ have a digit.)
    if v_emoji = '' or char_length(v_emoji) > 16 or v_emoji ~ '[[:alpha:][:space:]<>&"''`\\]'
      or v_emoji ~ '^[0-9#*]+$' then
      raise exception 'Pick an emoji.' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.chatter_reaction
      where post_id = p_post and user_id = v_me and emoji = v_emoji
    ) then
      if (select count(*) from public.chatter_reaction where post_id = p_post and user_id = v_me) >= 3 then
        raise exception 'Up to 3 emoji on a post. Tap one of yours to take it back.'
          using errcode = '22023';
      end if;
      if (select count(distinct emoji) from public.chatter_reaction where post_id = p_post) >= 20 then
        raise exception 'This post has all the emoji it can hold. Tap one that''s there.'
          using errcode = '22023';
      end if;
      insert into public.chatter_reaction (post_id, team_id, user_id, emoji)
      values (p_post, v_post.team_id, v_me, v_emoji);
    end if;
  else
    delete from public.chatter_reaction
    where post_id = p_post and user_id = v_me and emoji = v_emoji;
  end if;

  update public.chatter_post p set reactions = coalesce((
    select jsonb_agg(jsonb_build_object('e', r.emoji, 'u', r.users) order by r.first_at)
    from (
      select emoji, min(created_at) as first_at,
        jsonb_agg(user_id order by created_at) as users
      from public.chatter_reaction where post_id = p_post
      group by emoji
    ) r
  ), '[]'::jsonb)
  where p.id = p_post;
end;
$$;
revoke execute on function public.react_chatter_post(uuid, text, boolean) from public, anon;
