-- Team look: two team colors (main, accent) and a logo; final scores for the W-L record.

-- colors already exists (text[]); from now on it holds hex colors: {main, accent}.
-- NOT VALID: older rows (like the sample team's {navy,gold}) are left as they are; the
-- app ignores anything that isn't a hex color.
alter table public.team
  add constraint team_colors_hex check (
    cardinality(colors) <= 2
    and array_to_string(colors, ',') ~ '^(#[0-9a-fA-F]{6}(,#[0-9a-fA-F]{6})?)?$'
  ) not valid;

alter table public.team
  add column logo_path text check (logo_path is null or length(logo_path) <= 300);

alter table public.game
  add column score_us smallint check (score_us is null or score_us between 0 and 99),
  add column score_them smallint check (score_them is null or score_them between 0 and 99);

-- Logos are public pictures (they show on lineup cards and in the app without signing
-- links), at team-logos/<team id>/<file>. Coaches and managers add and replace them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('team-logos', 'team-logos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- Logos are public anyway; storage needs read access to replace or remove one.
create policy "anyone signed in can see team logos" on storage.objects
  for select to authenticated using (bucket_id = 'team-logos');
create policy "coaches and managers add team logos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'team-logos'
    and public.has_team_role(public.receipt_team_id(name), '{coach,manager}')
  );
create policy "coaches and managers replace team logos" on storage.objects
  for update to authenticated
  using (bucket_id = 'team-logos' and public.has_team_role(public.receipt_team_id(name), '{coach,manager}'))
  with check (bucket_id = 'team-logos' and public.has_team_role(public.receipt_team_id(name), '{coach,manager}'));
create policy "coaches and managers remove team logos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'team-logos' and public.has_team_role(public.receipt_team_id(name), '{coach,manager}'));
