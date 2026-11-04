-- Practice places, like games: a location picked from Google Maps (name, address, map
-- position, place id) and the field within it.

alter table public.practice
  add column field text check (field is null or length(trim(field)) between 1 and 60),
  add column location_address text check (location_address is null or length(location_address) <= 200),
  add column location_lat double precision check (location_lat is null or location_lat between -90 and 90),
  add column location_lng double precision check (location_lng is null or location_lng between -180 and 180),
  add column location_place_id text check (location_place_id is null or length(location_place_id) <= 300);
