-- Gameday PA: walk-up songs (song clip + announcer call per player), the team's own
-- soundboard sounds, and a log of AI clips made (to cap daily costs).
-- Audio lives in the private pa-audio bucket:
--   <team>/walkups/<player>/<file>   a kid's walk-up song and announcer call
--   <team>/sounds/<file>             the team's soundboard sounds
-- Everyone on the team can play them. Coaches and managers manage all of them; parents
-- manage their own kids' walk-ups, which wait for a coach's OK before they play.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pa-audio', 'pa-audio', false, 5242880, array['audio/wav', 'audio/x-wav', 'audio/mpeg'])
on conflict (id) do nothing;

-- Is the signed-in person linked to this kid as a parent?
create function public.is_guardian_of(p_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.player_guardian g
    where g.player_id = p_player_id and g.user_id = (select auth.uid())
  )
$$;
revoke execute on function public.is_guardian_of(uuid) from public, anon;
grant execute on function public.is_guardian_of(uuid) to authenticated;

-- The kid a pa-audio file belongs to (from <team>/walkups/<player>/...), or null.
create function public.pa_audio_player_id(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when (storage.foldername(p_name))[2] = 'walkups'
      and (storage.foldername(p_name))[3] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then ((storage.foldername(p_name))[3])::uuid
  end
$$;
grant execute on function public.pa_audio_player_id(text) to authenticated;

-- Can the signed-in person add or remove this pa-audio file?
create function public.can_manage_pa_audio(p_name text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.has_team_role(public.receipt_team_id(p_name), '{coach,manager}')
    or (
      public.pa_audio_player_id(p_name) is not null
      and public.player_team_id(public.pa_audio_player_id(p_name)) = public.receipt_team_id(p_name)
      and public.is_guardian_of(public.pa_audio_player_id(p_name))
    )
$$;
grant execute on function public.can_manage_pa_audio(text) to authenticated;

-- receipt_team_id reads the team from the first folder of any path.
create policy "team members play PA audio" on storage.objects
  for select to authenticated
  using (bucket_id = 'pa-audio' and public.is_team_member(public.receipt_team_id(name)));
create policy "coaches, managers and the kid's parents add PA audio" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'pa-audio' and public.can_manage_pa_audio(name));
create policy "coaches, managers and the kid's parents remove PA audio" on storage.objects
  for delete to authenticated
  using (bucket_id = 'pa-audio' and public.can_manage_pa_audio(name));

create table public.walkup (
  player_id uuid primary key references public.player (id) on delete cascade,
  song_path text not null check (length(song_path) <= 300),
  song_source text not null check (song_source in ('ai', 'upload')),
  song_prompt text check (song_prompt is null or length(song_prompt) <= 600),
  volume real not null default 1 check (volume between 0.2 and 2),
  announce boolean not null default true,
  announce_mode text not null default 'over' check (announce_mode in ('over', 'before')),
  name_spoken text not null default '' check (length(name_spoken) <= 60),
  number_spoken text not null default '' check (length(number_spoken) <= 60),
  script text not null default '' check (length(script) <= 160),
  announce_path text check (announce_path is null or length(announce_path) <= 300),
  status text not null default 'pending' check (status in ('pending', 'approved')),
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.walkup enable row level security;

create policy "team members see walk-ups" on public.walkup
  for select to authenticated using (public.is_team_member(public.player_team_id(player_id)));
create policy "coaches, managers and the kid's parents add walk-ups" on public.walkup
  for insert to authenticated with check (
    public.has_team_role(public.player_team_id(player_id), '{coach,manager}')
    or public.is_guardian_of(player_id)
  );
create policy "coaches, managers and the kid's parents change walk-ups" on public.walkup
  for update to authenticated
  using (
    public.has_team_role(public.player_team_id(player_id), '{coach,manager}')
    or public.is_guardian_of(player_id)
  )
  with check (
    public.has_team_role(public.player_team_id(player_id), '{coach,manager}')
    or public.is_guardian_of(player_id)
  );
create policy "coaches, managers and the kid's parents remove walk-ups" on public.walkup
  for delete to authenticated using (
    public.has_team_role(public.player_team_id(player_id), '{coach,manager}')
    or public.is_guardian_of(player_id)
  );

-- Only coaches approve. Any change by someone else (a parent, a manager) goes back to
-- waiting for a coach. Files must sit in the kid's own folder.
create function public.walkup_review()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_folder text := public.player_team_id(new.player_id)::text || '/walkups/' || new.player_id::text || '/';
begin
  if left(new.song_path, length(v_folder)) <> v_folder
    or (new.announce_path is not null and left(new.announce_path, length(v_folder)) <> v_folder)
  then
    raise exception 'Walk-up files must be in the player''s folder' using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  if not public.has_team_role(public.player_team_id(new.player_id), '{coach}') then
    new.status := 'pending';
  end if;
  if new.status = 'approved' then
    if tg_op = 'INSERT' or old.status <> 'approved' then
      new.approved_by := auth.uid();
      new.approved_at := now();
    end if;
  else
    new.approved_by := null;
    new.approved_at := null;
  end if;
  return new;
end;
$$;

create trigger walkup_review before insert or update on public.walkup
  for each row execute function public.walkup_review();

create table public.pa_sound (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.team (id) on delete cascade,
  category text not null check (category in ('pregame', 'organ', 'mound', 'quick')),
  label text not null check (length(trim(label)) between 1 and 40),
  path text not null check (length(path) <= 300),
  source text not null check (source in ('ai', 'upload')),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (left(path, 44) = team_id::text || '/sounds/')
);

create index on public.pa_sound (team_id);
alter table public.pa_sound enable row level security;

create policy "team members see the soundboard" on public.pa_sound
  for select to authenticated using (public.is_team_member(team_id));
create policy "coaches and managers add sounds" on public.pa_sound
  for insert to authenticated with check (public.has_team_role(team_id, '{coach,manager}'));
create policy "coaches and managers change sounds" on public.pa_sound
  for update to authenticated
  using (public.has_team_role(team_id, '{coach,manager}'))
  with check (public.has_team_role(team_id, '{coach,manager}'));
create policy "coaches and managers remove sounds" on public.pa_sound
  for delete to authenticated using (public.has_team_role(team_id, '{coach,manager}'));

-- One row per AI clip made, so the server can cap how many each person and team make a day.
create table public.pa_generation (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.team (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('song', 'announce', 'sound')),
  created_at timestamptz not null default now()
);

create index on public.pa_generation (team_id, created_at);
alter table public.pa_generation enable row level security;

create policy "members log their own clips" on public.pa_generation
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_team_member(team_id));
create policy "members see their own clips" on public.pa_generation
  for select to authenticated using (user_id = (select auth.uid()));

-- Clips of a kind made in the last day: by the signed-in person, and by their whole team.
create function public.pa_usage(p_team_id uuid, p_kind text)
returns table (mine integer, team integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    count(*) filter (where g.user_id = (select auth.uid()))::integer,
    count(*)::integer
  from public.pa_generation g
  where g.team_id = p_team_id and g.kind = p_kind
    and g.created_at > now() - interval '1 day'
    and public.is_team_member(p_team_id)
$$;
revoke execute on function public.pa_usage(uuid, text) from public, anon;
grant execute on function public.pa_usage(uuid, text) to authenticated;
