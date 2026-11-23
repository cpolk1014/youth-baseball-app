-- Club Library: practice plans read from a PDF or screenshots (Claude), and room for each
-- drill's how-to in club plans.

-- A cap for the club's practice plan reader: 5 a day and 20 in 30 days per club.
create or replace function public.ai_cap(p_kind text)
returns table (
  label text, team_day int, team_month int, person_day int, staff_day int,
  estimate_cents numeric, budget boolean
)
language sql
immutable
set search_path = ''
as $$
  select c.label, c.team_day, c.team_month, c.person_day, c.staff_day, c.estimate_cents, c.budget
  from (values
    ('roster',          'roster imports',         5,   15, null::int, null::int, 6.0,  true),
    ('schedule',        'schedule imports',       10,  30, null,      null,      10.0, true),
    ('boxscore',        'box score reads',        8,   60, null,      null,      9.0,  true),
    ('uniform',         'flyer reads',            5,   15, null,      null,      4.0,  true),
    ('club_plan',       'practice plan reads',    5,   20, null,      null,      20.0, true),
    ('tournament',      'tournament reads',       25, 150, null,      null,      28.0, true),
    ('tournament_scores','score updates',         25, 150, 5,         5,         17.0, true),
    ('rules',           'typed rules',            20, 100, null,      null,      3.0,  true),
    ('practice',        'AI practice plans',      3,   12, null,      null,      70.0, true),
    ('lyrics',          'lyric ideas',            40, null, 10,       10,        2.0,  true),
    ('song',            'walk-up songs',          30, 150, 5,         15,        5.0,  true),
    ('announce',        'announcer calls',        60, 200, 10,        30,        2.0,  true),
    ('sound',           'AI sounds',              20,  60, 0,         10,        4.0,  true),
    ('highlight_write', 'highlight calls',        null, null, 10,     10,        1.1,  false),
    ('highlight_voice', 'highlight voices',       null, null, 10,     10,        2.0,  false)
  ) as c(kind, label, team_day, team_month, person_day, staff_day, estimate_cents, budget)
  where c.kind = p_kind;
$$;

-- Drills now carry how-to notes (up to 2,000 characters each), so a plan needs more room.
alter table public.club_practice_plan drop constraint if exists club_practice_plan_items_check;
alter table public.club_practice_plan add constraint club_practice_plan_items_check check (
  jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 40
  and octet_length(items::text) < 100000
);
