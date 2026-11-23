-- Demo Chatter dates: posts were placed up to five days after the club's last game, so a demo
-- built the day after a game showed posts from the future. Now every post falls between the
-- last game and the moment the demo is built, in the same order. Demo clubs already built
-- have their future posts moved into the past.

create or replace function public.fill_demo_chatter(p_org uuid)
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
  -- Posts after the game run from v_base (the game) to now, at a share of the way along.
  v_base timestamptz;
  v_span interval;
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
  v_base := (v_last.game_date + time '12:30') at time zone 'America/Chicago';
  v_span := now() - v_base;
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
      v_base + v_span * 0.15);
  insert into public.chatter_post (team_id, channel, author_id, body, gif, created_at)
    values (v_u10, 'parents', v_kim, 'Goldfish are already packed for our weekend', v_gif_snack,
      v_base + v_span * 0.17);
  insert into public.chatter_post (team_id, channel, author_id, body, photos, created_at)
    values (v_u10, 'parents', v_ana,
      'Boston butt sale is this Saturday! $40 each, pickup at the field. Every dollar goes to tournament fees. Text me your order.',
      '[{"path": "demo/fundraiser.jpg", "thumb": "demo/fundraiser-thumb.jpg", "w": 1200, "h": 900}]',
      v_base + v_span * 0.30);
  insert into public.chatter_post (team_id, channel, author_id, body, created_at)
    values (v_u10, 'parents', v_marcus,
      'Anyone have size 5 cleats lying around? Jake grew again 😅',
      v_base + v_span * 0.42)
    returning id into v_p;
  insert into public.chatter_post (team_id, channel, author_id, body, quote_post_id, created_at)
    values (v_u10, 'parents', v_jen, 'We have a pair Eli outgrew. I''ll bring them Tuesday.', v_p,
      v_base + v_span * 0.44);
  insert into public.chatter_post (team_id, channel, author_id, body, created_at)
    values (v_u10, 'parents', v_rob,
      'Practice Tuesday is on Field 1 this week, same time. Field 3 is getting new dirt.',
      v_base + v_span * 0.55);
  insert into public.chatter_post (team_id, channel, author_id, body, mentions, created_at)
    values (v_u10, 'parents', v_marcus,
      '@coaches is Jake pitching Saturday? Just making sure he rests his arm Friday.',
      '{coaches}', v_base + v_span * 0.60);
  insert into public.chatter_post (team_id, channel, author_id, body, created_at)
    values (v_u10, 'parents', v_rob,
      'Watching the radar for Thursday. I''ll post by 3 PM if practice is on.',
      v_base + v_span * 0.75);
  insert into public.chatter_post (team_id, channel, author_id, body, gif, created_at)
    values (v_u10, 'parents', v_jen, 'Me checking the radar every 10 minutes', v_gif_rain,
      v_base + v_span * 0.77);
  insert into public.chatter_post (team_id, channel, author_id, body, photos, created_at)
    values (v_u10, 'parents', v_rob,
      'Saturday we''re on Field 3. Park by the snack stand and walk past Fields 1 and 2.',
      '[{"path": "demo/fieldmap.jpg", "thumb": "demo/fieldmap-thumb.jpg", "w": 1200, "h": 900}]',
      v_base + v_span * 0.85);
  -- A poll the families are voting on.
  insert into public.chatter_post (team_id, channel, author_id, body, kind, created_at)
    values (v_u10, 'parents', v_rob, 'Team dinner after Saturday''s game?', 'poll', v_base + v_span * 0.90)
    returning id into v_poll;
  insert into public.chatter_poll (post_id, team_id, options, multi, anonymous, closes_at, version)
    values (v_poll, v_u10, array['Pizza at Bayou Pies', 'Tacos', 'Can''t make it this time'], false, false,
      now() + interval '2 days', 4);
  insert into public.chatter_poll_vote (post_id, user_id, option, voted_at) values
    (v_poll, v_ana, 0, v_base + v_span * 0.92), (v_poll, v_jen, 0, v_base + v_span * 0.94),
    (v_poll, v_marcus, 1, v_base + v_span * 0.96), (v_poll, v_kim, 0, v_base + v_span * 0.98);
  insert into public.chatter_post (team_id, channel, author_id, body, gif, created_at)
    values (v_u10, 'parents', v_tasha, 'Let''s gooo Bombers! See everyone Saturday', v_gif_letsgo,
      v_base + v_span * 0.99);

  -- 10U, Club channel (the team and the club).
  insert into public.chatter_post (team_id, channel, author_id, body, created_at)
    values (v_u10, 'team', v_rob,
      'Thanks to the club for the infield day plan in the Library. We ran it Tuesday and the kids loved the ground ball ladder.',
      v_base + v_span * 0.62);

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
    select p.id, p.team_id, r.who, r.emoji, least(p.created_at + interval '7 minutes', now())
    from public.chatter_post p
    cross join lateral (values
      (v_jen, '🔥'), (v_kim, '🔥'), (v_marcus, '🔥'), (v_tasha, '👏'), (v_rob, '👏'), (v_kim, '⚾')
    ) as r(who, emoji)
    where p.id = v_score and r.who <> p.author_id;
  insert into public.chatter_reaction (post_id, team_id, user_id, emoji, created_at)
    select p.id, p.team_id, r.who, r.emoji, least(p.created_at + interval '9 minutes', now())
    from public.chatter_post p
    cross join lateral (values (v_ana, '😂'), (v_marcus, '😂'), (v_tasha, '❤️'), (v_rob, '👍')) as r(who, emoji)
    where p.team_id = v_u10 and p.gif is not null and p.author_id is distinct from r.who;
  insert into public.chatter_reaction (post_id, team_id, user_id, emoji, created_at)
    select p.id, p.team_id, r.who, '👍', least(p.created_at + interval '12 minutes', now())
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
    select p.id, p_org, r.who, r.emoji, least(p.created_at + interval '15 minutes', now())
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

update public.chatter_post p
set created_at = now() - interval '10 minutes' - (p.created_at - now())
from public.team t join public.organization o on o.id = t.organization_id
where p.team_id = t.id and o.demo_until is not null and p.created_at > now();
update public.chatter_poll_vote v
set voted_at = now() - interval '5 minutes'
where v.voted_at > now() and exists (
  select 1 from public.chatter_post p join public.team t on t.id = p.team_id
  join public.organization o on o.id = t.organization_id
  where p.id = v.post_id and o.demo_until is not null);
