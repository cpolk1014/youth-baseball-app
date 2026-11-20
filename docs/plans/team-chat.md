# Chatter: team chat in Fungo, the plan

Status: phase 1 (the feed with moderation) and phase 2 (photos) and polls built November 20, 2026; the rest is planned. Written November 20, 2026, after the club director demo.
The director asked for GroupMe's job to move into Fungo.

## The short version

Each team gets one **team feed** in Fungo, called **Chatter** (as in infield chatter). It has posts, photos, GIFs, quote replies, polls
and push notifications, and it's for adults only.

| Ask from the director         | How                                                                                                           | Difficulty                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Only adults, never kids       | Only signed-in team members can read or post (coaches, managers, treasurers, parents). Kids have no accounts. | Easy (the database enforces it)     |
| Post messages like GroupMe    | A live team feed (Supabase Realtime)                                                                          | Medium                              |
| GIFs                          | GIPHY search through our server, G-rated only                                                                 | Small                               |
| Photos (asked after the demo) | Shrunk on the phone, location stripped, private team-only storage                                             | Small to medium                     |
| Reply to a post (quote style) | A reply carries the original as a card; tap it to jump back                                                   | Small                               |
| Team polls                    | A poll is a kind of post: options, one vote each (changeable), live results, optional close time              | Medium                              |
| Push notifications            | Web Push: works well on Android; on iPhone only when Fungo is on the Home Screen                              | Medium, with a real catch on iPhone |

**One rule never bends: no private messages, ever.** Everything goes to the whole team's
feed, the same as today's youth-safety rules. No direct messages, no private groups, and
nothing addressed to a kid.

## What it looks like

- A new **Chatter** item at the top of the TEAM menu, with an unread badge. On Home there's
  a "Latest in Chatter" card.
- The feed is newest at the bottom, like GroupMe. Each post shows the person's name, their
  role ("Coach", "Mason's mom" from the parent link), the time, and the text and GIF.
- Posts can carry up to 4 photos. The feed shows thumbnails, and tapping one opens it full
  screen (swipe between them, save to the phone).
- Each post has two actions: **Reply** quotes the post, and **⋯** offers Delete, Report and
  Copy.
- A big composer at the bottom with **Photo**, **GIF** and **Poll** buttons and the dictation mic
  (`MicField`). It's built for one thumb, like the rest of the app.
- Polls show bars as votes come in, with each voter's name under each option (GroupMe does
  the same). Coaches can close a poll early.
- Coaches and managers can **pin** one post to the top, for example "Saturday's tournament
  info."

## The pieces

### 1. Adults only

- Kids already have no accounts. Players are roster names with no email and no sign-in.
- The Terms already say an account requires being 18 or older. The first time someone opens
  Chatter, they tap through "I'm 18 or older and a coach or parent on this team" (stored as
  `chat_agreed_at`) plus a short set of community rules.
- Who can read: every member role on the team. **Club admins can't read Chatter**, the same
  as GroupMe today. The director asked for this, so we should confirm it with him (see
  Questions).
- When someone is removed from the team, the database's row-level rules cut off their access
  right away.

### 2. Posts and live updates

- Built (phase 1): people insert their own posts, and a database trigger checks membership,
  the paywall, the 18+ agreement, a coach's pause, and the rate limit (30 posts per 10 minutes
  per person). Edits, removals, pins, reports and pauses go through database functions. Push
  (phase 4) will add a server step after a post is saved to send notifications.
- Live updates use Supabase Realtime, listening for new posts for that team. Realtime honors
  the same row-level rules. Fungo doesn't use Realtime yet, so this is its first use.
- **Offline:** the last 50 posts stay on the device (`rallycap:chatter:<team id>`,
  cleared on sign out), so the feed opens in the dugout with no signal. Posting needs a
  connection. Later: a post written offline waits in the outbox like lineups do, and is sent
  when the signal comes back (not built yet).
- Editing is allowed for 10 minutes and the post shows "edited". Deleting a post leaves
  "Post removed".

### 3. GIFs

- A GIF button opens a search sheet with trending GIFs first. Results come from
  `/api/gifs/search`, which keeps our GIPHY key on the server and always asks for **rating G**.
- A post stores only the GIF's id, link and size. We never copy the file.
- GIPHY requires a "Powered by GIPHY" mark in the picker. The free plan covers apps our size,
  but we should check their current terms before we build.
- Settings has a "Play GIFs automatically" switch, on by default. With it off, GIFs show a
  still frame until tapped. This saves data at the field.

### 3b. Photos

- **Shrunk on the phone before uploading**, the same way receipts are today (`shrinkImage` in
  `src/components/receiptFile.ts`): 1600 px on the longest side as a JPEG (about 250–400 KB
  instead of a phone's 3–5 MB), plus a thumbnail of about 400 px for the feed.
- **Location stripped, required.** Phone photos carry GPS data that can show a kid's home or
  school. Redrawing the photo on a canvas drops all of the file's metadata. A test checks that
  the uploaded file has no EXIF data.
- **Private storage:** a new private `chat-photos` bucket at `team/<team id>/<post id>/…`,
  readable only by members of that team, through signed links that expire. Nothing is public,
  so a photo can't be shared from Fungo to the outside world. It can still be screenshotted,
  and the community rules say so.
- **Who can post photos** is a team setting: everyone (the default, since game photos are much
  of what parents post) or coaches and managers only.
- **Data use:** the feed loads only thumbnails, and the full photo loads when tapped. Photos
  are cached on the phone so they aren't downloaded twice.
- **Limits:** up to 4 photos per post and 40 per person per day. No video; highlight reels
  stay on the phone with Pine Tar Productions.
- **Moderation:** removing a post removes its photos. A report about a photo of a child goes to
  the Fungo support inbox as well as the coaches.
- **Keeping them (not built yet; needs a scheduled server job):** photos are deleted 90 days
  after the season ends. Coaches get "Download
  the season's photos" (a zip made on the phone) and a reminder first. Deleting a team deletes
  its photos.
- **Rough cost:** an active team is about 1,000 photos and 300 MB a season. 100 teams is about
  30 GB stored, inside the Supabase Pro plan. Downloads are the bigger number: every photo is
  seen by about 25 people, so 100 teams is several hundred GB a year, tens of dollars a season
  beyond the plan. Thumbnails keep it there. Check Supabase's current prices before rollout.

### 4. Quote replies

- A reply is a normal post plus `quote_post_id`. It shows the original as a small card (name,
  first two lines, GIF thumbnail). Tapping the card scrolls to the original.
- If the original is deleted, the card reads "Original post was removed".
- The original's author gets a notification ("Coach Mike replied to your post") even when
  they've set notifications to coaches only.

### 5. Polls

- A poll has a question, 2–10 options, single or multiple choice, and an optional close time.
- Results are live, and anyone can change their vote until the poll closes. Voters are shown
  by name.
- Polls are pure logic (tallies, closing, who has voted), kept in `src/lib/chat/polls.ts` and
  tested.
- **Later, a natural next step:** an "Availability poll" for a game ("Can Mason make
  Saturday?") that fills that game's attendance, so the coach knows who's coming before the
  lineup.

### 6. Push notifications

The important part, and where the catch is.

- **How:** standard Web Push. The service worker (`public/sw.js`) gets `push` and
  `notificationclick` handlers. Tapping a notification opens that team's chat at the post.
  Each device is saved in `push_subscription` once the person taps Allow.
- **Android (Chrome):** works in the browser or from the Home Screen.
- **iPhone and iPad:** works **only after Fungo is added to the Home Screen** (iOS 16.4 or
  later) and the person taps Allow inside it. It won't work in a Safari tab. So we build a
  **"Get notifications" walkthrough**:
  - It detects iPhone vs. Android and Home Screen vs. browser.
  - It shows the three taps to add Fungo to the Home Screen.
  - Then it asks for permission.
  - Coaches see who on the team has notifications on ("9 of 14 families"), so they know
    whether the chat is reaching everyone.
- **Choices per person, per team:** All posts, Coaches' posts and polls, or Off, plus mute
  for a day or a week. By default everyone gets everything, and parents get a reminder that
  they can turn it down. Without these choices, parents switch everything off.
- **Lock screen privacy:** a "Hide message text" switch, which shows "New post in 10U
  Bombers" instead of the message.
- **Sending:** after a post is saved, the server sends to the team's devices in the
  background (Next.js `after()`). A team of about 15 families is about 30 devices, which is
  quick. Devices that have gone away (404 or 410) are removed.
- **Needs:** a VAPID key pair (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
  `VAPID_SUBJECT`) and the `web-push` npm package. Both are new; see Approvals.
- `sw.js` runs only in production, so push is tested on a preview deploy, not localhost.

### 7. Moderation (has to ship with the first version)

Once Fungo hosts the chat, we hold what parents post. The first version needs all of this:

- **Coaches, managers and the owner** can remove any post, mute a member for 24 hours or 7
  days, or remove them from the team.
- **Report** (anyone): picks a reason. The team's coaches see it, and so does a Fungo
  support inbox for anything about a child's safety.
- A removed post's text is kept **30 days** (its photos are deleted right away), readable only by the service role, so a report
  can still be reviewed. After that it's gone.
- No video. Photos follow the safety rules in 3b (location stripped, team-only, coaches can
  limit who posts them). GIFs come from GIPHY's G-rated library only.
- Rate limits keep one angry parent from flooding the feed.
- **Terms and Privacy updates** (`docs/legal/`): community rules, what we keep and for how
  long, and that removed members lose access. Craig's lawyer reads these before launch.

## How it fits with GroupMe

- **Run both for a season.** Each team picks **Fungo chat**, **GroupMe**, or **both** in team
  settings. No team is forced to move in the middle of a season.
- Everything that posts to GroupMe today (batting order, game day posts, Bat Arounds, the
  tournament seed post) also posts to Fungo chat as a **system post** from "Fungo". The
  `TeamChannel` interface in `src/lib/groupme/channel.ts` was built for exactly this: Fungo
  chat becomes a second channel.
- Game day posts are sent by the database (`send_due_game_posts`). For Fungo chat, the same
  function inserts the post directly, and the post's insert sends the push.
- The club's coaches group (club GroupMe today) could become a **club chat** later. Same
  feed, members are the club's admins and head coaches. Not in this plan.

## Data model (new tables)

- `team_post`: id, team_id, author_id, kind (post | poll | system), body (up to 2,000
  characters), gif (JSONB: id, url, still, width, height), photos (JSONB: path, thumb_path, width, height; up to 4), quote_post_id (same team),
  pinned_at, edited_at, removed_at, removed_by, created_at
- `team_poll`: post_id, question, options (text[]), multi, closes_at, closed_at
- `team_poll_vote`: poll_id, user_id, option (unique per person per option; single-choice
  polls keep one)
- `post_report`: post_id, reporter_id, reason, note, created_at, resolved_at, resolved_by
- `chat_member_state`: team_id, user_id, agreed_at, notify (all | staff | off), muted_until,
  hide_text, last_read_at (for unread counts), chat_muted_until (set by a coach)
- `team` gets `chat_photos` (everyone | staff)
- `push_subscription`: user_id, endpoint (unique), p256dh, auth, platform, created_at,
  last_ok_at

Row-level rules: team members read their team's posts, polls and votes. People insert their
own posts (through the route) and votes. Authors edit their own posts within 10 minutes.
Coaches and managers remove posts and resolve reports. Nobody outside the team can read any
of it, club admins included. Storage rules on `chat-photos` match (team members read; the uploader writes only under
their own post). Deleting a team deletes its chat and its photos. Deleting an account turns
that person's name into "Former member".

## Build order

1. **Feed (the core, with moderation):** tables and rules, the live feed,
   quote replies, delete and report, coach removal and mute, the unread badge, the 18+ step,
   the offline cache. Tests for the rules and the pure logic.
2. **Photos:** shrinking and stripping on the phone, the private bucket, thumbnails, the full
   screen viewer, the who-can-post setting, cleanup after the season.
3. **Polls:** creating, voting, live results, closing, coaches closing early.
4. **Push:** the service worker handlers, subscriptions, the per-team settings, the "Get
   notifications" walkthrough, sending after a post, and coaches' "who has notifications on"
   count.
5. **GIFs:** the server search route, the picker, and the autoplay switch.
6. **GroupMe side by side:** the team setting, system posts from batting order, game day
   posts and the other existing posts, and the pin.

Phases 1 to 3 make a usable chat. Phase 4 (push) is what makes families rely on it. Each
phase ships on its own.

## Approvals needed before building

- **New dependency:** `web-push`, the server library for sending Web Push. It isn't in the
  stack yet.
- **New outside service:** GIPHY, with an API key in the env and their logo in the picker.
- **New env vars** for `.env.example`: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
  `VAPID_SUBJECT`, `GIPHY_API_KEY`. Craig sets these himself in Vercel; they're never pasted
  into chat.
- **Supabase plan:** check the Realtime limit on concurrent connections before a club rolls
  this out to every team.

## Questions for Craig (and the director)

1. **Replace or alongside?** Recommended: alongside for this season, with each team choosing.
2. **Paid or free?** GroupMe posting is paid today, so chat fits as paid. But an unpaid team
   goes read-only, which would freeze its chat. One option is to keep chat working through
   the grace days and then make it read-only.
3. **Should the club see a team's Chatter?** Recommended: no, the same as GroupMe and money. A
   club-wide chat is a separate, later feature.
4. **Poll voters by name, or anonymous?** Recommended: by name, with an "anonymous poll"
   switch.
5. **Reactions (👍 ❤️ 😂)?** They weren't asked for, but GroupMe has likes. They're cheap to
   add in phase 1.
6. **Photos: who can post by default?** Recommended: everyone, with coaches able to switch it
   to staff only. Also: is 90 days after the season the right time to delete them?
