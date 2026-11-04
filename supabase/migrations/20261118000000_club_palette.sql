-- Club colors come only from what the club's director uploads (logo, flyer or any picture):
-- the colors found in it are the club's palette, and the club's two colors are picked from
-- that palette. No upload, no colors. (Teams take only the colors, not the logo.)

alter table public.organization
  add column palette text[] not null default '{}'
    check (cardinality(palette) <= 8
      and array_to_string(palette, ',') ~ '^(#[0-9a-fA-F]{6}(,#[0-9a-fA-F]{6})*)?$');

-- Clubs that already picked colors keep them as their palette.
update public.organization set palette = colors where cardinality(colors) > 0;

alter table public.organization
  add constraint organization_colors_from_palette check (colors <@ palette);
