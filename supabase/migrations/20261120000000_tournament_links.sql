-- Tournaments: coaches add them from screenshots (event sites block servers from reading
-- their pages), so the link reading and weekly check are gone. Instead a tournament keeps
-- three links coaches paste in and the whole team can open: info, schedule and bracket.

alter table public.tournament rename column url to info_url;
alter table public.tournament
  add column schedule_url text check (schedule_url is null or (schedule_url ~ '^https://' and length(schedule_url) <= 500)),
  add column bracket_url text check (bracket_url is null or (bracket_url ~ '^https://' and length(bracket_url) <= 500)),
  drop column checked_at,
  drop column page_hash,
  drop column check_note;
