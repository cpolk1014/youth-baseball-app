-- The demo club's Chatter: posts, replies, photos, GIFs, a poll and reactions, so a guest sees
-- a team that talks. They come from eight made-up people (two assistant coaches on the 10U,
-- one each on the 8U and 12U, and five 10U parents linked to their kids), shared by every
-- demo club. They're accounts no one can sign in to. Their pictures are drawings in the
-- app's public files (public/demo-chatter/), stored as "demo/<file>.jpg"; their GIFs are
-- GIPHY's, G-rated, picked through Fungo's own GIF search.
--
-- start_demo_club now builds the club (the old function, renamed build_demo_club) and then
-- fills its Chatter, once. A demo club made before this fills in the next time it opens.

-- ── The made-up people ──
create table public.demo_persona (
  user_id uuid primary key,
  name text not null
);
alter table public.demo_persona enable row level security;

-- Accounts with no email, password or sign-in (marked as guests, so they fit demo teams).
-- Supabase's auth table wants its token columns as '' rather than null, so set every one
-- that's there.
do $$
declare
  v_cols text[] := array(select column_name::text from information_schema.columns
    where table_schema = 'auth' and table_name = 'users');
  v_names text := 'id, is_anonymous, created_at';
  v_values text := '%L::uuid, true, now()';
  v_extra record;
  v_person record;
begin
  for v_extra in select * from (values
    ('instance_id', '''00000000-0000-0000-0000-000000000000''::uuid'),
    ('aud', '''authenticated'''), ('role', '''authenticated'''),
    ('raw_app_meta_data', '''{"provider": "anonymous", "providers": ["anonymous"], "demo_persona": true}''::jsonb'),
    ('raw_user_meta_data', '''{}''::jsonb'),
    ('confirmation_token', ''''''), ('recovery_token', ''''''), ('email_change', ''''''),
    ('email_change_token_new', ''''''), ('email_change_token_current', ''''''),
    ('phone_change', ''''''), ('phone_change_token', ''''''), ('reauthentication_token', ''''''),
    ('updated_at', 'now()')
  ) as c(col, val)
  loop
    if v_extra.col = any (v_cols) then
      v_names := v_names || ', ' || v_extra.col;
      v_values := v_values || ', ' || replace(v_extra.val, '%', '%%');
    end if;
  end loop;
  for v_person in select * from (values
    ('de30c1ab-0000-4000-8000-0000000d0001'::uuid, 'Rob Pitre'),
    ('de30c1ab-0000-4000-8000-0000000d0002'::uuid, 'Leo Savoie'),
    ('de30c1ab-0000-4000-8000-0000000d0003'::uuid, 'Danny Breaux'),
    ('de30c1ab-0000-4000-8000-0000000d0004'::uuid, 'Ana Reyes'),
    ('de30c1ab-0000-4000-8000-0000000d0005'::uuid, 'Jen Brooks'),
    ('de30c1ab-0000-4000-8000-0000000d0006'::uuid, 'Marcus Morales'),
    ('de30c1ab-0000-4000-8000-0000000d0007'::uuid, 'Tasha Hebert'),
    ('de30c1ab-0000-4000-8000-0000000d0008'::uuid, 'Kim Guidry')
  ) as p(id, name)
  loop
    if not exists (select 1 from auth.users where id = v_person.id) then
      execute format('insert into auth.users (' || v_names || ') values (' || v_values || ')', v_person.id);
    end if;
    insert into public.demo_persona (user_id, name) values (v_person.id, v_person.name)
      on conflict (user_id) do nothing;
  end loop;
end;
$$;

-- ── The club's Chatter ──
create function public.fill_demo_chatter(p_org uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid;
  v_u10 uuid;
  v_u12 uuid;
  v_u8 uuid;
  v_teams uuid[];
  v_club jsonb;
  -- The made-up people.
  v_rob constant uuid := 'de30c1ab-0000-4000-8000-0000000d0001';
  v_leo constant uuid := 'de30c1ab-0000-4000-8000-0000000d0002';
  v_danny constant uuid := 'de30c1ab-0000-4000-8000-0000000d0003';
  v_ana constant uuid := 'de30c1ab-0000-4000-8000-0000000d0004';
  v_jen constant uuid := 'de30c1ab-0000-4000-8000-0000000d0005';
  v_marcus constant uuid := 'de30c1ab-0000-4000-8000-0000000d0006';
  v_tasha constant uuid := 'de30c1ab-0000-4000-8000-0000000d0007';
  v_kim constant uuid := 'de30c1ab-0000-4000-8000-0000000d0008';
  v_parents uuid[] := array[v_ana, v_jen, v_marcus, v_tasha, v_kim];
  v_kids text[] := array['Mason Reyes', 'Eli Brooks', 'Jake Morales', 'Carter Hebert', 'Noah Guidry'];
  v_last record;
  v_i int;
  v_score uuid;
  v_poll uuid;
  v_p uuid;
  -- GIPHY GIFs (G-rated), from Fungo's GIF search.
  v_gif_homer constant jsonb := '{"id": "gH0heEBvL5wNVD1mGL", "mp4": "https://media.giphy.com/media/gH0heEBvL5wNVD1mGL/200w.mp4", "still": "https://media.giphy.com/media/gH0heEBvL5wNVD1mGL/200w_s.gif", "w": 200, "h": 200, "title": "Celebrate Home Run GIF by MLB"}';
  v_gif_letsgo constant jsonb := '{"id": "3F1su2r9koyUInk7Ir", "mp4": "https://media.giphy.com/media/3F1su2r9koyUInk7Ir/200w.mp4", "still": "https://media.giphy.com/media/3F1su2r9koyUInk7Ir/200w_s.gif", "w": 200, "h": 112, "title": "Lets Go Thumbs Up GIF by TheDreamTeam"}';
  v_gif_rain constant jsonb := '{"id": "ToMjGpEviDwPer1bxK0", "mp4": "https://media.giphy.com/media/ToMjGpEviDwPer1bxK0/200w.mp4", "still": "https://media.giphy.com/media/ToMjGpEviDwPer1bxK0/200w_s.gif", "w": 200, "h": 112, "title": "Cle Rain Delay GIF by MLB"}';
  v_gif_snack constant jsonb := '{"id": "9xnLpX2k00VThc0JhX", "mp4": "https://media.giphy.com/media/9xnLpX2k00VThc0JhX/200w.mp4", "still": "https://media.giphy.com/media/9xnLpX2k00VThc0JhX/200w_s.gif", "w": 200, "h": 200, "title": "Gold Fish GIF by Goldfish"}';
  v_gif_proud constant jsonb := '{"id": "hs7Pvg2O3dFqliXKAl", "mp4": "https://media.giphy.com/media/hs7Pvg2O3dFqliXKAl/200w.mp4", "still": "https://media.giphy.com/media/hs7Pvg2O3dFqliXKAl/200w_s.gif", "w": 200, "h": 108, "title": "Proud Of You Pride GIF by MOODMAN"}';
  v_gif_goteam constant jsonb := '{"id": "XL1a3gpTUSBG8v3iOY", "mp4": "https://media.giphy.com/media/XL1a3gpTUSBG8v3iOY/200w.mp4", "still": "https://media.giphy.com/media/XL1a3gpTUSBG8v3iOY/200w_s.gif", "w": 200, "h": 150, "title": "Go Team GIF by Redbrick"}';
begin
  select a.user_id into v_me from public.club_admin a
    where a.organization_id = p_org and a.role = 'director' limit 1;
  select id into v_u10 from public.team where organization_id = p_org and age_group = '10U' limit 1;
  select id into v_u12 from public.team where organization_id = p_org and age_group = '12U' limit 1;
  select id into v_u8 from public.team where organization_id = p_org and age_group = '8U' limit 1;
  if v_me is null or v_u10 is null or v_u12 is null or v_u8 is null then
    return;
  end if;
  v_teams := array[v_u10, v_u12, v_u8];
  select jsonb_build_object('name', o.name, 'logo', o.logo_path, 'color', o.colors[1])
    into v_club from public.organization o where o.id = p_org;

  -- On the teams: assistant coaches, and the 10U's parents linked to their kids.
  insert into public.member (team_id, user_id, role, display_name) values
    (v_u10, v_rob, 'coach', 'Rob Pitre'),
    (v_u12, v_leo, 'coach', 'Leo Savoie'),
    (v_u8, v_danny, 'coach', 'Danny Breaux');
  for v_i in 1 .. 5 loop
    insert into public.member (team_id, user_id, role, display_name)
      values (v_u10, v_parents[v_i], 'parent', (select name from public.demo_persona where user_id = v_parents[v_i]));
    insert into public.player_guardian (player_id, user_id)
      select p.id, v_parents[v_i] from public.player p where p.team_id = v_u10 and p.name = v_kids[v_i];
  end loop;
  insert into public.chatter_member (team_id, user_id, agreed_at, last_read_at, parents_read_at)
    select m.team_id, m.user_id, now() - interval '40 days', now(), now()
    from public.member m join public.demo_persona d on d.user_id = m.user_id
    where m.team_id = any (v_teams)
  on conflict do nothing;

  -- ── 10U, Team channel (coaches and parents) ──
  -- Last Saturday's game: Fungo's game day post, then the score.
  select g.game_date, g.opponent, g.score_us, g.score_them, g.location, g.field, g.start_time
    into v_last
    from public.game g join public.season s on s.id = g.season_id
    where s.team_id = v_u10 and g.status = 'final'
    order by g.game_date desc limit 1;
  insert into public.chatter_post (team_id, channel, author_id, body, from_fungo, created_at)
    values (v_u10, 'parents', null,
      format(E'Game against %s\n%s · %s\n9:00 AM\nArrive by 8:15 AM\nHome whites', v_last.opponent, v_last.location, v_last.field),
      true, ((v_last.game_date + time '06:00') at time zone 'America/Chicago'));
  insert into public.chatter_post (team_id, channel, author_id, body, photos, created_at)
    values (v_u10, 'parents', v_ana,
      format('Bombers %s, %s %s! What a game. So proud of these boys 🎉', v_last.score_us, v_last.opponent, v_last.score_them),
      '[{"path": "demo/scoreboard.jpg", "thumb": "demo/scoreboard-thumb.jpg", "w": 1200, "h": 900}]',
      ((v_last.game_date + time '11:40') at time zone 'America/Chicago'))
    returning id into v_score;
  insert into public.chatter_post (team_id, channel, author_id, body, quote_post_id, gif, created_at)
    values (v_u10, 'parents', v_jen, 'Luke''s double in the 5th!! The dugout went nuts', v_score, v_gif_homer,
      ((v_last.game_date + time '11:52') at time zone 'America/Chicago'));
  insert into public.chatter_post (team_id, channel, author_id, body, gif, created_at)
    values (v_u10, 'parents', v_kim, 'Proud of every one of them. Great effort all day.', v_gif_proud,
      ((v_last.game_date + time '12:20') at time zone 'America/Chicago'));
  insert into public.chatter_post (team_id, channel, author_id, body, photos, created_at)
    values (v_u10, 'parents', v_tasha,
      'Snack schedule for the rest of fall 🍊 If your weekend doesn''t work, swap with someone and post it here.',
      '[{"path": "demo/snacks.jpg", "thumb": "demo/snacks-thumb.jpg", "w": 1200, "h": 900}]',
      ((v_last.game_date + 1 + time '19:05') at time zone 'America/Chicago'));
  insert into public.chatter_post (team_id, channel, author_id, body, gif, created_at)
    values (v_u10, 'parents', v_kim, 'Goldfish are already packed for our weekend', v_gif_snack,
      ((v_last.game_date + 1 + time '19:31') at time zone 'America/Chicago'));
  insert into public.chatter_post (team_id, channel, author_id, body, photos, created_at)
    values (v_u10, 'parents', v_ana,
      'Boston butt sale is this Saturday! $40 each, pickup at the field. Every dollar goes to tournament fees. Text me your order.',
      '[{"path": "demo/fundraiser.jpg", "thumb": "demo/fundraiser-thumb.jpg", "w": 1200, "h": 900}]',
      ((v_last.game_date + 2 + time '08:15') at time zone 'America/Chicago'));
  insert into public.chatter_post (team_id, channel, author_id, body, created_at)
    values (v_u10, 'parents', v_marcus,
      'Anyone have size 5 cleats lying around? Jake grew again 😅',
      ((v_last.game_date + 2 + time '20:02') at time zone 'America/Chicago'))
    returning id into v_p;
  insert into public.chatter_post (team_id, channel, author_id, body, quote_post_id, created_at)
    values (v_u10, 'parents', v_jen, 'We have a pair Eli outgrew. I''ll bring them Tuesday.', v_p,
      ((v_last.game_date + 2 + time '20:14') at time zone 'America/Chicago'));
  insert into public.chatter_post (team_id, channel, author_id, body, created_at)
    values (v_u10, 'parents', v_rob,
      'Practice Tuesday is on Field 1 this week, same time. Field 3 is getting new dirt.',
      ((v_last.game_date + 3 + time '07:45') at time zone 'America/Chicago'));
  insert into public.chatter_post (team_id, channel, author_id, body, mentions, created_at)
    values (v_u10, 'parents', v_marcus,
      '@coaches is Jake pitching Saturday? Just making sure he rests his arm Friday.',
      '{coaches}', ((v_last.game_date + 3 + time '12:10') at time zone 'America/Chicago'));
  insert into public.chatter_post (team_id, channel, author_id, body, created_at)
    values (v_u10, 'parents', v_rob,
      'Watching the radar for Thursday. I''ll post by 3 PM if practice is on.',
      ((v_last.game_date + 5 + time '10:30') at time zone 'America/Chicago'));
  insert into public.chatter_post (team_id, channel, author_id, body, gif, created_at)
    values (v_u10, 'parents', v_jen, 'Me checking the radar every 10 minutes', v_gif_rain,
      ((v_last.game_date + 5 + time '10:41') at time zone 'America/Chicago'));
  insert into public.chatter_post (team_id, channel, author_id, body, photos, created_at)
    values (v_u10, 'parents', v_rob,
      'Saturday we''re on Field 3. Park by the snack stand and walk past Fields 1 and 2.',
      '[{"path": "demo/fieldmap.jpg", "thumb": "demo/fieldmap-thumb.jpg", "w": 1200, "h": 900}]',
      now() - interval '20 hours');
  -- A poll the families are voting on.
  insert into public.chatter_post (team_id, channel, author_id, body, kind, created_at)
    values (v_u10, 'parents', v_rob, 'Team dinner after Saturday''s game?', 'poll', now() - interval '5 hours')
    returning id into v_poll;
  insert into public.chatter_poll (post_id, team_id, options, multi, anonymous, closes_at, version)
    values (v_poll, v_u10, array['Pizza at Bayou Pies', 'Tacos', 'Can''t make it this time'], false, false,
      now() + interval '2 days', 4);
  insert into public.chatter_poll_vote (post_id, user_id, option, voted_at) values
    (v_poll, v_ana, 0, now() - interval '4 hours'), (v_poll, v_jen, 0, now() - interval '3 hours'),
    (v_poll, v_marcus, 1, now() - interval '2 hours'), (v_poll, v_kim, 0, now() - interval '1 hour');
  insert into public.chatter_post (team_id, channel, author_id, body, gif, created_at)
    values (v_u10, 'parents', v_tasha, 'Let''s gooo Bombers! See everyone Saturday', v_gif_letsgo,
      now() - interval '40 minutes');

  -- 10U, Club channel (the team and the club).
  insert into public.chatter_post (team_id, channel, author_id, body, created_at)
    values (v_u10, 'team', v_rob,
      'Thanks to the club for the infield day plan in the Library. We ran it Tuesday and the kids loved the ground ball ladder.',
      ((v_last.game_date + 3 + time '18:20') at time zone 'America/Chicago'));

  -- ── 12U and 8U ──
  insert into public.chatter_post (team_id, channel, author_id, body, created_at)
    values (v_u12, 'parents', v_leo,
      'Batting cages are open Thursday 6 to 7:30. Bring helmets. Water is on me.', now() - interval '2 days');
  insert into public.chatter_post (team_id, channel, author_id, body, gif, created_at)
    values (v_u12, 'parents', v_leo, 'Big weekend coming up. Rest up, hydrate, bring two jerseys.', v_gif_goteam,
      now() - interval '6 hours');
  insert into public.chatter_post (team_id, channel, author_id, body, created_at)
    values (v_u8, 'parents', v_danny,
      'Picture day is Sunday at 2 PM. Home whites, hats on, cleats clean (ish).', now() - interval '1 day');

  -- Reactions: who tapped what, then each post's summary.
  insert into public.chatter_reaction (post_id, team_id, user_id, emoji, created_at)
    select p.id, p.team_id, r.who, r.emoji, p.created_at + interval '7 minutes'
    from public.chatter_post p
    cross join lateral (values
      (v_jen, '🔥'), (v_kim, '🔥'), (v_marcus, '🔥'), (v_tasha, '👏'), (v_rob, '👏'), (v_kim, '⚾')
    ) as r(who, emoji)
    where p.id = v_score and r.who <> p.author_id;
  insert into public.chatter_reaction (post_id, team_id, user_id, emoji, created_at)
    select p.id, p.team_id, r.who, r.emoji, p.created_at + interval '9 minutes'
    from public.chatter_post p
    cross join lateral (values (v_ana, '😂'), (v_marcus, '😂'), (v_tasha, '❤️'), (v_rob, '👍')) as r(who, emoji)
    where p.team_id = v_u10 and p.gif is not null and p.author_id is distinct from r.who;
  insert into public.chatter_reaction (post_id, team_id, user_id, emoji, created_at)
    select p.id, p.team_id, r.who, '👍', p.created_at + interval '12 minutes'
    from public.chatter_post p cross join unnest(v_parents) as r(who)
    where p.team_id = v_u10 and p.author_id = v_rob and p.kind = 'post' and p.channel = 'parents'
  on conflict do nothing;
  update public.chatter_post p set reactions = coalesce((
    select jsonb_agg(jsonb_build_object('e', x.emoji, 'u', x.users) order by x.first_at)
    from (
      select r.emoji, jsonb_agg(r.user_id order by r.created_at) as users, min(r.created_at) as first_at
      from public.chatter_reaction r where r.post_id = p.id group by r.emoji
    ) x), '[]'::jsonb)
  where p.team_id = any (v_teams);

  -- ── Coach Chatter (the club's director and its teams' coaches) ──
  insert into public.club_coach_post (organization_id, author_id, body, created_at)
    values (p_org, v_leo,
      'Anyone have a 12U arm free Saturday morning? We''re short two pitchers for the 9:30.',
      now() - interval '3 days')
    returning id into v_p;
  insert into public.club_coach_post (organization_id, author_id, body, quote_post_id, created_at)
    values (p_org, v_rob, 'Our 10U plays at 9 but two of our 11-year-olds could throw an inning for you after. Text me.',
      v_p, now() - interval '3 days' + interval '25 minutes');
  insert into public.club_coach_post (organization_id, author_id, body, photos, created_at)
    values (p_org, v_danny,
      'Umpire clinic for coaches next Wednesday. Worth it just for the infield fly rule.',
      '[{"path": "demo/clinic.jpg", "thumb": "demo/clinic-thumb.jpg", "w": 1200, "h": 900}]',
      now() - interval '2 days');
  insert into public.club_coach_post (organization_id, author_id, body, gif, created_at)
    values (p_org, v_rob, 'Great weekend, everybody. Five wins across the club!', v_gif_goteam,
      now() - interval '1 day');
  insert into public.club_coach_reaction (post_id, organization_id, user_id, emoji, created_at)
    select p.id, p_org, r.who, r.emoji, p.created_at + interval '15 minutes'
    from public.club_coach_post p
    cross join lateral (values (v_rob, '👍'), (v_leo, '🔥'), (v_danny, '👏')) as r(who, emoji)
    where p.organization_id = p_org and p.author_id <> r.who;
  update public.club_coach_post p set reactions = coalesce((
    select jsonb_agg(jsonb_build_object('e', x.emoji, 'u', x.users) order by x.first_at)
    from (
      select r.emoji, jsonb_agg(r.user_id order by r.created_at) as users, min(r.created_at) as first_at
      from public.club_coach_reaction r where r.post_id = p.id group by r.emoji
    ) x), '[]'::jsonb)
  where p.organization_id = p_org;
end;
$$;
revoke execute on function public.fill_demo_chatter(uuid) from public, anon, authenticated;

-- ── start_demo_club: build the club, then fill its Chatter (once) ──
alter function public.start_demo_club() rename to build_demo_club;
revoke execute on function public.build_demo_club() from public, anon, authenticated;

create function public.start_demo_club()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_built jsonb := public.build_demo_club();
  v_org uuid := (v_built ->> 'club')::uuid;
begin
  if not exists (select 1 from public.club_coach_post where organization_id = v_org) then
    perform public.fill_demo_chatter(v_org);
  end if;
  return v_built;
end;
$$;
revoke execute on function public.start_demo_club() from public, anon;
grant execute on function public.start_demo_club() to authenticated;

-- ── Cleanup: the made-up people stay; the kid records they're linked to go with the demo ──
create or replace function public.cleanup_demo_clubs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_orgs uuid[] := array(select id from public.organization
    where demo_until is not null and demo_until < now());
  v_teams uuid[];
begin
  v_teams := array(select id from public.team where organization_id = any (v_orgs));
  delete from public.player_game_stat where player_id in (
    select id from public.player where team_id = any (v_teams));
  delete from public.team where id = any (v_teams);
  delete from public.organization where id = any (v_orgs);
  -- Kid records made when a made-up parent was linked, once no team's player uses them.
  delete from public.athlete a
  where exists (select 1 from public.athlete_guardian g
      join public.demo_persona d on d.user_id = g.user_id where g.athlete_id = a.id)
    and not exists (select 1 from public.athlete_guardian g
      where g.athlete_id = a.id and g.user_id not in (select user_id from public.demo_persona))
    and not exists (select 1 from public.player p where p.athlete_id = a.id);
  -- Guests whose demo has ended (Supabase keeps anonymous accounts until they're deleted).
  delete from auth.users u where u.is_anonymous and u.created_at < now() - interval '2 days'
    and u.id not in (select user_id from public.demo_persona)
    and not exists (
      select 1 from public.club_admin a join public.organization o on o.id = a.organization_id
      where a.user_id = u.id and o.demo_until > now());
  return coalesce(array_length(v_orgs, 1), 0);
end;
$$;
revoke execute on function public.cleanup_demo_clubs() from public, anon, authenticated;
