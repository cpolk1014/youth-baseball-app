# The club director demo

A made-up **Bayou Baseball Club**: eight teams (7U–14U), each with its own coach, a season of
games and lineups, club codes, awards half picked, a library, and the 10U in depth (box
scores, a hot hitter, practices with plans, team money, uniforms). Everyone in it is made up.

## Set it up (about 10 minutes)

1. **Sign up three demo accounts** on www.rallycap.team, using email addresses you control
   (for example `you+club@…`, `you+coach@…`, `you+parent@…`). On each, finish signing in once.
   **Don't set a name on the coach account:** the script gives it a different coach name on
   each team, and saving a name later would put one name on all eight.
2. In Supabase (the **live** `rallycap` project) open the SQL Editor, paste
   `club-demo.sql`, type the three addresses into the lines at the top, and run it.
   The table at the end lists the eight teams and their codes.
3. **To reset** before the meeting (fresh dates, undo anything clicked), run it again.
   **To remove it** afterwards, run `club-demo-cleanup.sql`.

Nothing in the demo posts to GroupMe (no bot is connected) and nothing charges a card.

## The 5-minute walkthrough (signed in as the director)

1. **My clubs → Bayou Baseball Club.** Every team at a glance: head coach, roster, record,
   next game, last lineup. The **13U** is flagged: no lineup in over three weeks. *"You see
   which coaches are on top of it without asking."*
2. **Tap the 10U.** The club sees (never changes) lineups, playing time and fair-play rules,
   and the team's stats from box scores. *"Fair play is visible: every kid's innings, every game."*
   Never money, parents, walk-ups or GroupMe.
3. **Awards.** Four club awards are live, due in 9 days. The ring shows picks in; the grid
   shows which teams still owe picks (12U, 13U and 14U); **Remind coaches** would post to the
   coaches' GroupMe; the awards show list prints in age order.
4. **Look and Library.** Club colors teams can use, club uniforms, practice plans and a
   cutoffs play set every team can copy.
5. **Codes.** Ten codes bought, eight used, two left. A new team enters a code on Coaches &
   parents and joins with its data. $99 a team for the season, prorated mid-season.

If there's time, show the other two sides:

- **Coach (the coach account, 10U):** Saturday's game → **Auto-fill** → *Why this lineup?*;
  Competitive puts Luke Hill up for his hot streak (🔥); a practice → **Print**.
- **Parent (the parent account):** My player → Mason's **pitch count** (the coach's counts
  waiting to approve, Pitch Smart rest days), Pine Tar Productions.
