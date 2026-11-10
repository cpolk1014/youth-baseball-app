-- Tournaments: the parks a tournament is played at, with their map details (picked on the map
-- or read from a picture). The tournament's games use these. Rows are { name, address, lat,
-- lng, placeId }; the tournament's existing policies cover who can read and change them.
alter table public.tournament
  add column places jsonb not null default '[]'::jsonb
  check (jsonb_typeof(places) = 'array' and jsonb_array_length(places) <= 20);
