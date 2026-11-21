-- GIFs in Chatter and Coach Chatter: a post can carry one GIF from GIPHY (searched on the
-- server with G-rated results only). The post stores GIPHY's own links and nothing else: the
-- video the feed plays, a still frame (for reduced motion), its size, and its title.

-- {id, mp4, still, w, h, title}, with links only to GIPHY's media servers.
create function public.valid_giphy(p_gif jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_gif) = 'object'
    and coalesce(p_gif ->> 'mp4', '') ~ '^https://media[0-9]*\.giphy\.com/[A-Za-z0-9/._?=&-]+$'
    and coalesce(p_gif ->> 'still', '') ~ '^https://media[0-9]*\.giphy\.com/[A-Za-z0-9/._?=&-]+$'
    and char_length(p_gif ->> 'mp4') <= 400 and char_length(p_gif ->> 'still') <= 400
    and coalesce(p_gif ->> 'id', '') ~ '^[A-Za-z0-9]{1,40}$'
    and char_length(coalesce(p_gif ->> 'title', '')) <= 140
    and jsonb_typeof(p_gif -> 'w') = 'number' and jsonb_typeof(p_gif -> 'h') = 'number';
$$;

alter table public.chatter_post
  add column gif jsonb check (gif is null or public.valid_giphy(gif));
alter table public.club_coach_post
  add column gif jsonb check (gif is null or public.valid_giphy(gif));

-- A post needs words, a photo or a GIF (removed posts have none).
alter table public.chatter_post drop constraint chatter_post_has_content;
alter table public.chatter_post add constraint chatter_post_has_content check (
  removed_at is not null or char_length(btrim(body)) > 0 or jsonb_array_length(photos) > 0
    or gif is not null
);
alter table public.club_coach_post drop constraint club_coach_post_has_content;
alter table public.club_coach_post add constraint club_coach_post_has_content check (
  removed_at is not null or char_length(btrim(body)) > 0 or jsonb_array_length(photos) > 0
    or gif is not null
);

-- A removed post loses its GIF too.
create function public.drop_gif_when_removed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.removed_at is not null then
    new.gif := null;
  end if;
  return new;
end;
$$;
create trigger chatter_post_drop_gif
  before update on public.chatter_post
  for each row execute function public.drop_gif_when_removed();
create trigger club_coach_post_drop_gif
  before update on public.club_coach_post
  for each row execute function public.drop_gif_when_removed();

-- Editing a GIF post's words down to nothing is fine (the GIF is the post).
create or replace function public.edit_chatter_post(p_post uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.chatter_post;
  v_body text := btrim(coalesce(p_body, ''));
begin
  select * into v_post from public.chatter_post where id = p_post;
  if v_post.id is null or v_post.author_id is distinct from (select auth.uid())
    or not public.is_team_member(v_post.team_id) then
    raise exception 'Only the person who posted can edit it.' using errcode = '42501';
  end if;
  if v_post.removed_at is not null then
    raise exception 'That post was removed.' using errcode = '42501';
  end if;
  if v_post.created_at < now() - interval '10 minutes' then
    raise exception 'Posts can be edited for 10 minutes. Remove it and post again instead.'
      using errcode = '42501';
  end if;
  if char_length(v_body) > 2000
    or (v_body = '' and jsonb_array_length(v_post.photos) = 0 and v_post.gif is null) then
    raise exception 'A post needs 1 to 2,000 characters.' using errcode = '22023';
  end if;
  update public.chatter_post set body = v_body, edited_at = now() where id = p_post;
end;
$$;

create or replace function public.edit_club_coach_post(p_post uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.club_coach_post;
  v_body text := btrim(coalesce(p_body, ''));
begin
  select * into v_post from public.club_coach_post where id = p_post;
  if v_post.id is null or v_post.author_id is distinct from (select auth.uid())
    or not public.club_coach_member(v_post.organization_id) then
    raise exception 'Only the person who posted can edit it.' using errcode = '42501';
  end if;
  if v_post.removed_at is not null then
    raise exception 'That post was removed.' using errcode = '42501';
  end if;
  if v_post.created_at < now() - interval '10 minutes' then
    raise exception 'Posts can be edited for 10 minutes. Remove it and post again instead.'
      using errcode = '42501';
  end if;
  if char_length(v_body) > 2000
    or (v_body = '' and jsonb_array_length(v_post.photos) = 0 and v_post.gif is null) then
    raise exception 'A post needs 1 to 2,000 characters.' using errcode = '22023';
  end if;
  update public.club_coach_post set body = v_body, edited_at = now() where id = p_post;
end;
$$;
