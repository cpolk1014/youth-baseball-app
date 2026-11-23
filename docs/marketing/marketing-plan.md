# Fungo marketing plan: Thanksgiving 2026 → Opening Day 2027 → next season

> Draft 1, Nov 23 2026. Written as the agency pitch: strategy first, then the emails, the posts and the checklists, ready to paste.
> **Rules this plan keeps** (from the site): say "youth baseball" in copy; "AI" only for features that really use AI; no made-up stats or testimonials; never knock GameChanger; never show a real kid's face, name or number without the parent's written OK.
> **[Brackets]** are notes or blanks to fill, not copy.

---

## 1. The situation in one page

**What we're selling, and who pays**

| Who pays | What | Price | Decides when |
|---|---|---|---|
| Club director | Codes for every team | $99/team/season | Dec–Jan (spring) and **June–July (next fall)** |
| Head coach (no club) | Team season | $129 through Dec 31, **$89 from Jan 1** | Jan–Mar (spring), Jul–Aug (fall) |
| Parent | Player pass (stats, pitch count, Pine Tar reels) | $19 first kid, $9 each after | Whenever their kid has a big game |

**The three facts that shape everything**

1. **Clubs are the money.** One 26-team club like the Traction Canes pilot is ~$2,574 a season. That's 20 single-team sales. Every channel below should feed club conversations, not just team trials.
2. **Our existing coaches don't pay until next season.** Every team made before the paywall is free through July 31, 2027. So the revenue from existing users this year is: **(a)** their parents buying the Player pass, **(b)** their clubs buying codes, **(c)** the coaches they refer. Emails to existing users are built around those three.
3. **Fungo markets itself on game day.** The batting order picture (logo in the footer), Pine Tar reels ("Made with Fungo" outro), walk-up songs played over a PA in front of 200 parents, and game day posts in Chatter are all seen by people who aren't customers yet. Our job is to make those moments louder and easier to share, then catch the people who ask "what app is that?"

**Positioning (unchanged from the site)**
> We help youth baseball coaches **run the whole team from their phone**, without **the spreadsheets, the midnight lineups and answering "what time do we play?" forty times.**

**The one-line hooks we'll repeat everywhere**
- Coaches: *"Snap the schedule. AI adds every game."* / *"Fair lineups in two minutes."*
- Parents: *"Your kid's walk-up song, made by AI. Their highlight reel, with a stadium announcer."*
- Directors: *"See every team's lineups, playing time and record. One dashboard. $99 a team."*
- Tournament weekend: *"What time do we play tomorrow? Fungo knows."*

---

## 2. Calendar: four phases

The youth baseball year decides this, not us. Fall is wrapping up, the spring season starts Feb–March, and clubs commit to next fall in June–July.

| Phase | Dates | Goal | Main channels |
|---|---|---|---|
| **0. Foundation** | Nov 24 – Dec 14 | Measure everything; collect proof | Analytics, email tool, social handles, testimonials |
| **1. Warm-up** | Dec 15 – Jan 4 | Activate existing users; first Player passes; content bank | Email, Instagram/Facebook organic, founder posts |
| **2. Launch + spring pricing** | Jan 5 – Feb 15 | Local launch; clubs sign for spring; teams start trials | Club outreach, Facebook groups, PR, coach clinics |
| **3. Opening Day push** | Feb 16 – May 15 | Trials → paid; Player pass attach; tournament weekends | Paid ads, field marketing, Reels/TikTok, referrals |
| **4. Next season** | May 16 – Aug 15 | Renewals, clubs buy 2027-28 codes (June 1: "rest of this season free") | Email, director outreach, case studies |

**Key dates to hit**
- **Black Friday / Cyber Monday (Nov 27–30):** soft Player pass push to existing parents only (no discount; the price is already low). "The stocking stuffer for the parent who keeps the pitch count."
- **Jan 1:** spring pricing goes live ($129 → $89). Biggest team email + post of the year.
- **January (local launch):** press + coach clinic.
- **First tournament weekend of spring:** "What time do we play tomorrow?" campaign.
- **June 1:** next season on sale, the rest of this one free. Biggest club email of the year.
- **July 31:** launch teams' free season ends. Renewal sequence starts June 15.

---

## 3. Phase 0: foundation (do before spending a dollar)

### Measurement (needed for everything below)
- [ ] **Product analytics: PostHog** (free tier is plenty). Events: `signup`, `trial_started`, `team_created`, `players_added`, `first_lineup`, `parent_invited`, `parent_joined`, `checkout_started`, `purchase` (kind: club | team | family), `pine_tar_made`, `batting_picture_shared`. *[Needs a small code change and Craig's OK on a new dependency.]*
- [ ] **UTM on every link** we post: `?utm_source=facebook&utm_medium=group&utm_campaign=spring-pricing`. Keep a sheet of campaigns.
- [ ] **Conversion events** for ads later: Meta Pixel + Google Ads tag on `/login` success and checkout success only, **signed-out site pages only**, never inside the app (parents and kids' data stay out of ad networks). Update the privacy policy before turning them on.
- [ ] **"How did you hear about us?"** one tap during team setup (Facebook group, another coach, saw it at a game, club, search, other). Cheapest attribution there is.

### Email tool
- **Under ~150 existing users: send from Craig's own fungo.team inbox**, one by one or BCC'd in small batches. Plain text from a founder beats any template, and the reply rate shows who's interested.
- **When the trial sequence turns on: Loops** (built for SaaS, free to 1,000 contacts, event-triggered emails from PostHog/Supabase). Resend is the alternative if Craig wants to own the code.
- Every marketing email needs an unsubscribe link and a mailing address (CAN-SPAM). Product notices (receipts, sign-in codes) stay separate.

### Accounts
- [ ] Grab **@fungo.team** / **@fungoapp** / **@fungobaseball** (whichever is free, the same everywhere) on Instagram, TikTok, Facebook (page), YouTube, X, Threads.
- [ ] Bio: *Youth baseball's AI assistant coach. Built by a 7U coach. Lineups · schedules · walk-up songs · tournaments. Free 14-day trial ↓* → `fungo.team/?utm_source=instagram&utm_medium=bio`
- [ ] Profile picture: the color F and ball on white. Banner: navy, "FUNGO AI", the demo phone shot.

### Proof (we have no testimonials yet; fix that first)
- [ ] **Ask the club director from the Nov 20 demo for a quote** ("It went great" is a testimonial waiting to happen). Get permission to use their name, title and club, or "Club director, Louisiana" if they'd rather.
- [ ] **Ask 3 Traction Canes coaches** for one sentence each: what Fungo saved them. Offer nothing for it; just ask. Script in §4, Email A5.
- [ ] **Screen-record 10 short clips from the demo club** (made-up kids only): Auto-fill filling a lineup, the schedule photo turning into games, "What time do we play tomorrow?", a walk-up song playing, a Pine Tar reel. This is the raw footage for every post in §5.
- [ ] Put quotes on the home page and /clubs as soon as they're in.

---

## 4. Emails

### Who's on the list

| List | Who | What we want |
|---|---|---|
| **A. Existing coaches & managers** | Launch teams (free through Jul 31 2027), pilot club coaches | Use it more → invite every family → refer a coach → tell their club |
| **B. Existing parents** | Parents on any team | Turn on notifications → buy the Player pass |
| **C. New trials** | Anyone who starts the 14-day trial | Get to the first lineup and the first parent → buy before day 14 |
| **D. Club directors (outreach)** | Directors Craig meets or gets introduced to | A 20-minute demo |
| **E. Renewals** | Every paid or launch team, every club | Buy 2027-28 in June |

Sign every email from **Craig**. Plain style (no big banner images), one button, one ask.

---

### A. Existing coaches

**A1. "Here's what's new" (send Dec 1)**
**Subject:** Your team chat got an upgrade (and a few other things)
**Preview:** Chatter, box score notices, and tournament seeding without the napkin math

> Hey [first name],
>
> Quick one from Craig at Fungo. You've been using Fungo since before most of this existed, so here's what landed this fall:
>
> **Chatter.** Your team's own chat, inside Fungo. Polls, photos, GIFs, @coaches tags, and game day posts that write themselves. No more "who's bringing snacks" lost under 200 memes in the other app.
>
> **Box score notices.** Add the GameChanger box score after a game and every parent gets a buzz: "Mason went 2 for 3 with a double." Parents love this one.
>
> **Tournaments.** Screenshot the schedule and bracket, AI reads it in, and "What time do we play tomorrow?" works out every way Saturday could go.
>
> Your team is free through **July 31, 2027**. Nothing to do there.
>
> One favor: **if your families aren't on Fungo yet, send them the invite link.** It's the difference between you answering texts and Fungo answering them.
>
> **[Invite your families →]** *(link: /coaches-parents)*
>
> Craig
> 7U coach, built an app instead of complaining

**A2. Invite your families (send Dec 8, only to teams with fewer than 5 parents joined)**
**Subject:** The 40-texts-a-weekend problem
**Preview:** 30 seconds, one link, and they stop asking you what time the game is

> [First name],
>
> Fungo works best when the parents are on it: they see the schedule, the field, the uniform and "arrive by", and they stop texting you.
>
> Right now [N] families on [team name] have joined. Here's the fastest way to get the rest:
>
> 1. Open **Coaches & parents** and tap **Invite**.
> 2. Paste the link in whatever group text you have now.
> 3. They pick their kid the first time they open it. Done.
>
> **[Get your invite link →]**
>
> Craig

**A3. Refer a coach (send Jan 6, after spring pricing is live)**
**Subject:** Know a coach who's still doing lineups on a napkin?
**Preview:** Spring pricing is $89. Send them this.

> [First name],
>
> Spring season pricing just started: a team is **$89 through July 31**, and every new team gets 14 days free first, no credit card.
>
> If you know a coach who's still building lineups at midnight, here's a link to send them. *[When referrals are built: "When their team pays, you both get [reward]."]*
>
> **[Copy your link: fungo.team/?ref=[code]]**
>
> And if your **club** is shopping for something for every team, I'd love an intro to your director. Just reply with their name.
>
> Craig

**A4. Tell your club (send Jan 13, only to coaches whose team isn't in a club but might be)**
**Subject:** Does your club director know about this?
**Preview:** $99 a team, and they can see every team's lineups and playing time

> [First name],
>
> Straight ask: is [team name] part of a bigger club or organization?
>
> If so, Fungo has a club plan: the director gets one dashboard with every team's record, lineups and playing time, can post to every team's Chatter at once, and runs end-of-season awards. It's $99 a team, which is cheaper than each team buying their own.
>
> If you think your director would want a look, reply with their name and I'll take it from there (I'll mention you sent me, unless you'd rather I didn't). They can also poke around a made-up club on their own: **[Try the demo club →]** *(fungo.team/demo)*
>
> Craig

**A5. Testimonial ask (send Dec 3, personal, to the 5–10 most active coaches)**
**Subject:** One sentence?
> [First name], you've used Fungo more than almost anyone. Could you give me one sentence on what it's done for your season? Good, bad or blunt; I'll take any of it. If I can put it on the website with your first name and team age group (e.g. "Coach Mike, 10U"), let me know. Thanks. Craig

---

### B. Existing parents

**B1. Turn on notifications (send Dec 2)**
**Subject:** Get a buzz when the coach posts
**Preview:** Game changes, rain delays and box scores, straight to your phone

> Hi [first name],
>
> Craig from Fungo here (the app your coach uses for [team name]).
>
> If you haven't yet, **turn on notifications**: you'll hear about a moved game, a new post in Chatter, or how [kid's first name] did when the coach adds the box score.
>
> **On iPhone:** open fungo.team in Safari, tap Share → **Add to Home Screen**, open it from there, and tap **Get a buzz** at the top of Chatter.
> **On Android:** open Chatter and tap **Get a buzz**.
>
> **[Open Chatter →]**
>
> Craig

*[Kid's first name only, and only from the parent's own link. If merge fields can't do that safely, leave the name out.]*

**B2. Player pass (send Dec 9; resend Feb 23 for spring)**
**Subject:** [Kid]'s highlight reel, with a stadium announcer
**Preview:** Pine Tar Productions, the pitch count, and every box score line

> Hi [first name],
>
> Three things parents asked for, in one pass:
>
> 🎬 **Pine Tar Productions.** Pick a clip of [kid] from your camera roll, mark the big moment, and AI writes and records a stadium announcer call. Out comes a highlight reel with their name, number and a slow-mo replay. Made on your phone; we never keep the video.
>
> ⚾ **The pitch count.** Tap Ball/Strike as they throw, and Fungo tracks rest days by Pitch Smart's guidelines for their age. "Ready to pitch · up to 75 today" or "Resting · can pitch Wed."
>
> 📊 **Their stats, all season.** Every line from the coach's box scores, season totals and trends, and it follows [kid] from team to team.
>
> **$19 for the season** ($9 for each brother or sister), through July 31.
>
> **[Get the Player pass →]** *(My profile → Player pass)*
>
> Craig
> P.S. Grandparents will watch the reel 40 times. Plan accordingly.

**B3. Holiday nudge (send Nov 28, Black Friday; only to parents on teams that have box scores)**
**Subject:** The stocking stuffer for the parent who keeps the pitch count
> Short version of B2, three lines and the button. No discount.

---

### C. New trials (automated in Loops; day = days since team created)

| Day | Subject | The one ask |
|---|---|---|
| 0 | Welcome to Fungo. Start here (2 minutes) | Add players (or **Import from a file**: snap the roster) |
| 1 | Snap your schedule and we'll add every game | Try schedule import |
| 2 *(if no lineup yet)* | Your first fair lineup takes about two minutes | Open the next game → Auto-fill |
| 4 | Your parents are about to stop texting you | Invite families |
| 7 | Halfway: here's what AI can do in your second week | Practice plans + typed rules |
| 10 *(if tournament in schedule or Feb–Jul)* | What time do we play tomorrow? | Add a tournament |
| 12 | Your trial ends in 2 days | Pay $129 / $89, or tell your club (link to /clubs) |
| 14 | Your free trial ended. Everything you made is still here | Renew; free features keep working |
| 21 *(not paid)* | One question | "What would've made Fungo worth it?" (reply only, no button) |

**C0 (day 0), full copy**
**Subject:** Welcome to Fungo. Start here (2 minutes)
> Coach,
>
> Welcome aboard. You've got 14 days of everything, AI included.
>
> Do these three things today and Fungo starts paying for itself:
>
> 1. **Add your players.** Or snap a picture of your roster and AI reads it in (names, numbers, positions; never birthdays or phone numbers).
> 2. **Add your schedule.** Snap the schedule or upload the PDF; AI adds every game. You check it before it saves.
> 3. **Tap Auto-fill on your next game.** A fair lineup, every inning, in about two minutes. *Why this lineup?* explains every spot if a parent asks.
>
> **[Open my team →]**
>
> Reply to this email if anything's confusing. It comes straight to me.
>
> Craig
> 7U coach and the guy who built this

**C12 (day 12), full copy**
**Subject:** Your trial ends in 2 days
> Coach,
>
> Your free trial on [team name] ends **[date]**.
>
> Keep everything going for **$[129 or 89] through July 31**: AI schedule and roster import, practice plans, tournaments, Chatter, team money, walk-up songs. *[SeasonNote line: "Spring pricing: the rest of the season for $89."]*
>
> If your team's part of a club, it's even easier: the club buys codes for $99 a team and you're covered. **[Send your director this page →]** *(fungo.team/clubs)*
>
> If you do nothing: your roster, games, lineups and the lineup builder stay free. Only the AI and paid features pause.
>
> **[Keep Fungo for the season →]**
>
> Craig

---

### D. Club directors (personal outreach, never a blast)

Find them through: Traction Canes' network, coaches' intros (A4), tournament weekends, state/regional club Facebook groups, the demo club sign-ups (`start_demo_club` gives us the guest's club name, not an email: add an optional "want a walkthrough?" email field to the demo banner).

**D1. First touch (after an intro)**
**Subject:** [Coach name] said I should reach out
> Hi [first name],
>
> I'm Craig, a 7U coach who builds software for a living. [Coach name] on your [age group] team uses Fungo and thought you'd want a look.
>
> The short version for a director: one dashboard with every team's record, next game, lineups and playing time (are coaches actually playing everyone?), a post to every team's chat at once, and end-of-season awards that coaches pick in the app. Coaches get AI scheduling, lineups and tournament tools; parents get their own team chat. **$99 a team for the season.**
>
> Two ways to see it:
> - **Click around a made-up club yourself** (8 teams, a full season): fungo.team/demo
> - **20 minutes with me** on a call or at the field: [Calendly link]
>
> Craig

**D2. Follow-up (5 days later, if no reply)**
**Subject:** re: [Coach name] said I should reach out
> One more nudge and I'll leave you alone. The thing directors liked most in the last demo: seeing which teams went quiet (no lineup in two weeks) without calling every coach. Worth 20 minutes? [link] Craig

**D3. After a demo (same day)**
**Subject:** Codes for [club name]
> Thanks for the time today. Recap: [N] teams × $99 = $[total] for the season, codes expire July 31. Start your club free (Look and Library work right away) and buy codes when you're ready: fungo.team/login?next=/club. I'll set up your first team with you if you want. Craig

---

### E. Renewals (June)

**E1. June 1, clubs**
**Subject:** Buy next season now, get the rest of this one free
> [First name], 2027-28 codes are on sale. Buy now and they count from today: your teams play the rest of this summer free. Same $99 a team. **[Buy codes →]**

**E2. June 15 / July 15 / July 28, launch teams**
**Subject:** Your free season ends July 31
> Your team's been free since [month]. Thanks for being one of the first. From August 1 it's $129 for the fall season (or $99 a team through your club). Everything you made stays. **[Renew for 2027-28 →]**

---

## 5. Social media

### Where, and why

| Platform | Priority | Who's there | What we post | How often |
|---|---|---|---|---|
| **Facebook (Page + Groups)** | ⭐⭐⭐ | Parents and coaches 30–50, club directors, every local youth baseball group | Founder posts, how-tos, launch news; **groups are the #1 channel** | Page 3×/week; groups: helpful answers daily, our own post 1×/week max per group |
| **Instagram (Reels + Stories)** | ⭐⭐⭐ | Baseball parents, coaches, facilities | Walk-up song reveals, Pine Tar reels, "2-minute lineup" screen recordings, coach humor | 4 Reels/week + Stories daily in season |
| **TikTok** | ⭐⭐ | Younger parents, coach-humor accounts, baseball content | The same Reels, rawer; trends with a baseball twist | Cross-post the Reels |
| **YouTube** | ⭐⭐ | Coaches searching "how to make a fair lineup", "youth baseball practice plan" | Shorts (same clips) + 5–8 min how-tos that rank for years | Shorts with every Reel; 2 long videos/month |
| **Reddit** (r/Homeplate, r/Baseball, local subs) | ⭐ | Coaches asking real questions | Helpful answers as Craig; mention Fungo only when it answers the question, and say you built it | When there's a question to answer |
| **X / Threads** | ⭐ | Baseball coaching nerds, Pitch Smart crowd, tech-founder audience | Build-in-public threads from Craig ("I'm a dev and a 7U coach; here's how the lineup engine works") | 2–3×/week if Craig enjoys it; skip if not |
| **LinkedIn** | Skip | | Only if Craig wants a founder story for his own network | |
| **Pinterest, Snapchat** | Skip | | | |

**Hashtags.** Core: #youthbaseball #baseballcoach #baseballmom #baseballdad #10Ubaseball #12Ubaseball #walkupsong #pitchsmart. *[Decision for Craig: the site never says "travel ball", but #travelball and #travelbaseball are where parents search on Instagram/TikTok. Recommendation: allow them in hashtags only, never in the copy.]*

### Content pillars (every post fits one)

1. **🎤 Game-day magic (40%)**: walk-up songs, the AI announcer, Pine Tar reels, the batting order picture. Shareable, emotional, made for Reels. *This pillar sells the Player pass and gets Fungo seen by parents on other teams.*
2. **⏱️ "Done in 2 minutes" (25%)**: screen recordings of the busywork disappearing: schedule photo → 12 games, Auto-fill, roster photo → roster, tournament bracket → standings. *Sells teams.*
3. **😂 Bleacher humor (20%)**: the 7 a.m. game, the dad who counts innings, 40 "what time do we play?" texts, napkin math at the hotel breakfast. Original jokes only, never at a real kid's expense. *Gets follows and shares.*
4. **🧢 Craig the coach-who-codes (15%)**: why he built it, what he's building next, asking coaches what they want. *Builds trust; this is our social proof until testimonials pile up.*

### Safety rules for every post (non-negotiable)
- **Our own posts use the demo club only** (Bayou Bombers, made-up names). Blur or crop any real field signage or people in the background.
- **Reposting a parent's Pine Tar reel or walk-up video**: only with the parent's written OK (DM is fine, screenshot it), first name or nothing, never the jersey number + full name + team together, no school names. When in doubt, don't.
- No ads targeted at anyone under 18. Ad audiences are adults (parents, coaches) only.
- Never use a real club's or tournament organization's logo without permission. Don't name or tag GameChanger in a way that implies a partnership; "works with GameChanger's box score export" is fine.

### Ready-to-post: the first two weeks (Dec 15 – Dec 28)

**Post 1 · Reel (IG, TikTok, YT Shorts, FB) · Pillar 2**
*Video:* Phone over a printed schedule. Snap. Cut to "AI found 12 games" review screen. Tap Add. Games list fills. 12 seconds.
*On-screen text:* "Typing in a 40-game schedule" → "or…" → "📸"
*Caption:* Snap the schedule. AI adds every game, field and time. You check it, then it's done. Your Sunday night just got its life back. 14 days free, link in bio. #youthbaseball #baseballcoach

**Post 2 · Reel · Pillar 1**
*Video:* Black screen, stadium crowd noise. AI announcer: "Now batting… number seven… MASON… REYES!" Walk-up song kicks in. Show the walk-up maker on the phone. (Demo kid only.)
*Caption:* Every kid deserves a big-league walk-up. AI writes the lyrics, makes the song and calls their name like it's the World Series. Parents set it up, coach approves it. 🎤⚾ #walkupsong #youthbaseball #baseballmom

**Post 3 · Facebook Page + IG carousel · Pillar 4**
*Slide 1:* "I'm a 7U coach and a software developer. So instead of complaining, I built an app."
*Slide 2:* "Coaching takes 2 hours a week. Running the team takes 10."
*Slide 3:* the five chores (schedule, practice plans, lineups, 'what time?', tournament seeding)
*Slide 4:* "Fungo does most of that now." + app screenshot
*Slide 5:* "Free for 14 days. fungo.team"
*Caption:* Seven years in youth baseball: four as the team's GameChanger guy, three as a head coach. Here's why I built Fungo. → fungo.team/story

**Post 4 · Reel · Pillar 3**
*Video:* Coach's phone lighting up over and over. Text bubbles stack: "what time?" "what field?" "what time do we need to be there" "which jersey" "is it still on??"
*On-screen text:* "Saturday, 6:45 a.m."
*Final beat:* Fungo's game day post appears in Chatter. Notifications stop. Coach sips coffee.
*Caption:* The game day post writes itself: opponent, field, time, arrive by, uniform. Posted before you're out of bed. ☕ #baseballcoach #youthbaseball

**Post 5 · Reel · Pillar 2**
*Video:* Empty lineup grid → tap Auto-fill → 6 innings fill in. Tap "Why this lineup?" and scroll.
*On-screen text:* "Fair lineup. Every inning. Two minutes." → "And when a parent asks why…"
*Caption:* Nobody sits twice before everyone's sat. Everyone gets the infield. Pitchers stay in their limits. And "Why this lineup?" explains every spot, so the bleacher conversation goes a lot faster. Free on every plan.

**Post 6 · Facebook Page · Pillar 3**
> Rank these youth baseball sounds from most to least stressful:
> 🔔 6 a.m. alarm for an 8 a.m. game an hour away
> 📱 "Is the game still on?" (it's sunny)
> 🧢 "Coach, why's my kid in right field again?"
> ⚾ The aluminum bat PING at 7:02 a.m.
> 🧮 Hotel breakfast tie-breaker math
>
> Wrong answers only. 👇

**Post 7 · Reel · Pillar 1 (the Pine Tar reveal)**
*Video:* Screen recording of making a Pine Tar reel: pick clip, Start here / ⭐ Big moment / End here, choose "Double", pick an announcer call, Make my video. Then play the finished reel full screen: intro card, banner, slow-mo REPLAY, outro. Demo footage only.
*Caption:* Pine Tar Productions: your kid's big moment, cut on your phone, with a stadium announcer and a slow-mo replay. Grandma's going to need a minute. 🎬 Part of the Player pass. #baseballmom #baseballdad #youthbaseball

**Post 8 · Story poll (IG + FB)** · "Who does the lineup on your team?" Head coach / Assistant / The dad who counts innings / Nobody, it's chaos

**Post 9 · Reel · Pillar 2**
*Video:* Screenshot of a tournament bracket → AI reads it → standings → tap "What time do we play tomorrow?" → "If we beat Bomb Squad by 4 or more: Sun 9:00 AM vs #4 seed."
*On-screen text:* "Saturday night. Hotel lobby. 7 dads with napkins." → "Or…"
*Caption:* Fungo tries every way the last pool games could go and tells you when you play Sunday. No napkins required. 🏆

**Post 10 · Facebook Page · Pillar 4**
> Coaches, I need your help. I'm building Fungo (youth baseball's AI assistant coach) and deciding what's next.
> What's the most annoying thing about running your team that NO app fixes yet?
> Best answer gets built. Seriously, I'm a developer and a 7U coach and I read every reply.

**Post 11 · Reel · Pillar 1**
*Video:* The batting order picture being made and shared to the team chat: team colors, logo, 1–12.
*Caption:* Batting order, in your team's colors, ready to post. Parents screenshot it. Grandparents print it. Free on every plan.

**Post 12 · Holiday post (Dec 24) · Pillar 3**
*Image:* a Christmas tree with a fungo bat, a bucket of balls and a lineup card on top.
*Caption:* All I want for Christmas is a 9 a.m. first game. Merry Christmas from Fungo. 🎄⚾

### Spring pricing launch posts (Jan 1–7)

**Jan 1 · all platforms**
*Image:* scoreboard graphic. "SPRING SEASON PRICING · $89 · the whole spring" (navy/crimson, Fungo F).
*Caption:* New year, new lineup card. A whole spring of Fungo is $89 for your team: AI schedules, practice plans, lineups, tournaments, Chatter, team money. Start with 14 days free, no card. → fungo.team/pricing #youthbaseball #baseballcoach

**Jan 3 · Reel** · "Your spring season in 4 snaps": roster photo → schedule photo → uniform flyer → AI practice plan. 20 seconds. Caption: "Set up your whole spring before the coffee's cold."

**Jan 5 · Facebook Page** · Club version: "Directors: one dashboard for every team. $99 a team. Click around a made-up club before you call anyone: fungo.team/demo"

### Evergreen video ideas (shoot in batches of 10)
- "POV: you're the team's GameChanger guy and also the coach" (Craig's actual life)
- "Things youth baseball parents say, ranked by how fast the coach's eye twitches"
- Walk-up song roulette: the same demo kid, five AI styles (country, hip-hop, rock, organ, '80s)
- "The pitch count dad vs. Fungo's pitch count" (split screen)
- "Building a practice plan for 8U in 30 seconds" (AI practice plan)
- "We asked AI to write a walk-up song for a kid named Buster" (demo name only)
- "How to make a fair youth baseball lineup" (YouTube long-form, 6 min, ranks forever)
- "Pitch Smart rest days explained for parents" (YouTube long-form; pitch count feature at the end)
- Build-in-public: "I added GIFs to the team chat. Here's what the dads did with it." (made-up demo posts only)

---

## 6. Everything else that drives sales

### 6.1 Facebook groups playbook (the highest-return free channel)
- Join 20–30 groups: state and metro youth baseball groups, "[city] youth baseball parents", coaching groups, tournament organizations' parent groups.
- **Rule of 10:** answer 10 people's questions for every one post about Fungo. Answer as Craig, a coach; mention Fungo only when it answers the question ("I built a free tool for exactly that, happy to share").
- Read each group's rules; many ban self-promotion except on certain days. Ask the admin first; offer the admin's team a free season in exchange for one pinned post.
- Best performers to post: the "Why this lineup?" screenshot (fair-play debates are constant), Pitch Smart rest-day explainer, "free printable lineup card" (§6.3).

### 6.2 At the field (where our buyers literally stand around for 6 hours)
- **Dugout cards:** a 4×6 card with a QR code: front "What time do we play tomorrow? 🏆 Fungo knows." back: "Youth baseball's AI assistant coach. Free 14 days." Hand them to coaches at tournaments. ~$60 for 500.
- **Tournament sponsorship:** sponsor one local tournament per month in spring ($250–$750): banner on the fence, our QR on the schedule handout, and the "official app for seeding scenarios" if the organizer agrees. Ask for the participating coaches' list (with their consent) in exchange.
- **Coach clinic:** a free 45-minute "Run your season in 2 hours a week" session at a facility in January (lineups, Pitch Smart, practice plans). Every attendee leaves with their team set up. Partner with a facility that already hosts clinics.
- **Walk-up songs at the field are an ad.** Ask PA-running parents (with permission) to have the announcer say nothing about us; the "what app is that?" question does the work. Make sure the answer is easy: "Fungo dot team."

### 6.3 Search (slow to start, compounds forever)
Build free, signed-out tools on fungo.team that rank on Google and hand off to the trial:
- **Free printable lineup card** (/lineup-card): type names, print the umpire card. "Want it to build the lineup too? Start free." Search: *baseball lineup card template* (high volume, every season).
- **Pitch Smart rest-day calculator** (/pitch-count): age + pitches today → rest days and when they can pitch. Search: *pitch smart guidelines*, *how many days rest after 50 pitches*. Hands off to the Player pass.
- **Fair lineup generator** (/fair-lineup): names in, 6 innings out, using the free engine. Search: *youth baseball lineup generator*, *fair playing time lineup*.
- **Walk-up song ideas by age** (blog): "Clean walk-up songs for 8 to 12 year olds" (we'll lose to big sites on popular songs; win on "make your own").
- Blog posts from §5's long-form YouTube scripts. One post a week Feb–May.
*[These are code work in the app; each one is a small, separate build. Pick in priority order: lineup card, pitch calculator, fair lineup generator.]*

### 6.4 Referrals (build it before Opening Day)
- **Coach → coach:** a link on Coaches & parents. When the new team pays, the referrer's team gets its next season 50% off (or a free season after 3 referrals).
- **Coach → club:** introduce your director and the club signs: your team's season is free.
- **Parent → coach:** every parent on another team who sees a Pine Tar reel or the batting order picture is one tap from "Tell your coach about Fungo" (prefilled text with a link).
*[Needs a `referral` table, a ref code on signup, and a reward check in `fulfill_purchase`. Medium build. Worth it: word of mouth is how youth baseball buys anything.]*

### 6.5 Partnerships
- **Pitching and hitting instructors:** they see 50 kids a week and their parents. Give each instructor a free Player pass and a code for their students' parents ("[Instructor] recommends tracking pitch counts with Fungo"). The pitch count already has a "Pitching lesson" session type, which is the perfect pitch.
- **Training facilities:** a stack of dugout cards at the front desk + a free season for the facility's in-house teams.
- **Tournament organizations:** the scenario engine is the hook ("your parents stop asking the tournament desk what time they play Sunday"). Long game; start with one local organizer.
- **Youth baseball podcasts and YouTubers** (coaching channels): offer Craig as a guest ("the coach who built an AI assistant coach"), not paid reads at first.

### 6.6 PR (local launch, January)
- **Local TV and paper pitch:** "Local youth baseball coach and software developer builds an AI app so kids get fair playing time." The fair-play angle is the story, not the AI. Pitch one week before the clinic so they can come film it.
- **Press kit page** (/press): the story, Craig's photo, logos from `public/brand/`, 4 demo screenshots, one paragraph each on fair play, walk-up songs and Pine Tar.

### 6.7 Paid ads (only once Fungo is making money)
- **Meta (Facebook + Instagram):** the 3 best organic Reels as ads. Audience: adults 28–50 within 50 miles of the launch area, interests youth baseball / Little League / baseball coaching / GameChanger; plus lookalikes from paying coaches once we have 100. Start $20/day, Feb 16 – May 15.
- **Google Search:** "baseball lineup app", "youth baseball team app", "baseball lineup generator", "team chat for baseball". $10–15/day. Send to /coaches, not the home page.
- **Retargeting:** visitors to /pricing or /clubs who didn't start a trial: "Your 14 days are still waiting."
- **Kill rule:** any ad set with no trials after $100 spent gets turned off.
- **Budget rule (Craig's call, Nov 23 2026): no paid ads until the business is making money.** Until then every channel in this plan is free or nearly free (email, organic social, Facebook groups, the creator partnership in §6.8, referrals, search tools, dugout cards).
- **When the money's there:** spend from profit, not from savings. A simple rule: up to 25% of the previous month's profit (revenue minus Stripe, AI, hosting and other costs) goes to ads the next month, starting at $20/day and only on the ad sets that already turned up paying teams. The first month with profit to spend is the first month of ads.

---

### 6.8 The comedian partnership (the biggest free reach we have)

The site's voice was built around the youth baseball comedian Craig showed us, and Craig's wife has a business connection with him. His audience is our buyers: baseball parents and coaches who already laugh at the 7 a.m. games, the group chat and the dad who counts innings. One video from him could reach more of them than a year of our own posts.

**Where it fits:** Phase 1 (intro in December) so a first video can land in the January launch or the first spring tournament weekend.

**What we offer (best first; all of it costs nothing up front, so it fits the no-spend rule)**
1. **A revenue share code.** His followers get something small (e.g. a longer trial, 30 days instead of 14, which costs us only AI budget), and he gets a share of every first-season payment from his code (say 25–30%). He's paid only when Fungo is. *[Needs the referral code build in §6.4.]*
2. **Fungo free for him and anyone he coaches or plays with**, plus first look at new features. Good for a real "I use this" video.
3. **Advisor with a small equity grant**, if he's interested in more than one video and Craig wants a long-term face for the brand. Talk to an accountant/lawyer before offering equity.
4. **Paid posts later**, from profit, once §6.7's rule allows ad money.

**What we ask for**
- One or two videos in his own style, his own jokes (we never write his lines or borrow his old ones), with a natural Fungo moment: the walk-up song with the AI announcer, "What time do we play tomorrow?", or the game day post ending the 40-texts problem.
- A link in his bio or caption during the spring push.
- Optional: a short bit we can share on our accounts, credited to him.

**Rules**
- **Disclosure:** if he gets anything (a code share, free product, equity), his posts must say so (#ad or the platform's Paid partnership label). FTC rule, and it protects him too.
- **Kids:** any real kids in his videos are his call and their parents' consent; nothing from Fungo shows a real kid's name or face. We give him the demo club to film with.
- **No knocking competitors** in anything we co-make, same as the site.

**How to make the ask**
1. **Before the intro:** have ready the demo club link (fungo.team/demo), 3 short demo clips (walk-up song, Auto-fill, tournament scenarios), and a personal code.
2. **Your wife's intro** (her words; a draft to adjust):
   > Hi [his first name], hope you're well! My husband Craig is a youth baseball coach and a software developer, and he built an app for running youth baseball teams called Fungo. He's a big fan of your videos (honestly, they're why the app's website sounds the way it does). Would you be open to a quick call with him? I think you'd get a kick out of the AI walk-up songs. Can I connect you two?
3. **Craig's follow-up once he says yes** (short, no pitch deck):
   > Thanks for taking a look. I'm a 7U coach who got tired of midnight lineups and "what time do we play?" texts, so I built Fungo: AI reads the schedule, builds fair lineups, makes walk-up songs with a stadium announcer, and works out tournament seeding. You can click around a made-up club here: fungo.team/demo. I'd love to find something that works for you: a revenue share on anyone who signs up from you, free Fungo for your teams, or something else you'd like. 15 minutes this week or next?
4. **On the call:** listen first (what does his audience ask him about? what does he already promote?), then offer #1 and #2. Don't push for a date on the first call.

## 7. Numbers we'll watch (weekly, every Monday)

| Metric | How | Target by May 15 2027 *[Craig to set; these are starting guesses]* |
|---|---|---|
| Trials started | `trial_started` | 300 |
| Trial → first lineup | `first_lineup` within 7 days | 60% |
| Trial → paid | `purchase` kind team within 30 days | 25% |
| Clubs paying | `purchase` kind club | 5 clubs (~100 teams) |
| Player pass attach | parents with a pass ÷ parents on teams with box scores | 15% |
| Parents per team | `parent_joined` ÷ teams | 8+ |
| Cost per paid team (ads) | ad spend ÷ paid teams from ads | under $40 |
| "How did you hear?" mix | setup question | tells us where to double down |

Revenue math at those targets: 5 clubs × 20 teams × $99 = $9,900; 75 teams × ~$100 = $7,500; Player passes ~$2,000. **About $19,000 in the first spring.** Clubs are more than half of it; that's where Craig's time should go.

---

## 8. Week-by-week: the next 6 weeks

| Week of | Do |
|---|---|
| **Nov 23** | Grab social handles. Get the comedian's intro going through your wife; prep the 3 demo clips for it. Ask the demo director for a quote (A5-style). Send B3 (Black Friday Player pass) to parents on teams with box scores. Decide: PostHog yes/no; hashtag rule. |
| **Nov 30** | Send A1 (what's new) to coaches, B1 (notifications) to parents. Add PostHog + the "how did you hear?" question. Screen-record the 10 demo clips. |
| **Dec 7** | Send A2 (invite families) and B2 (Player pass). Set up Loops; write the trial sequence (C). Join 20 Facebook groups and start answering. |
| **Dec 14** | Start posting (§5 posts 1–12, three a week + Stories). Put the first quotes on the site. Book a facility for the January clinic. |
| **Dec 21** | Holiday post. Schedule Jan 1 spring-pricing posts and email. Draft the press kit and local press pitch. Order dugout cards. |
| **Dec 28** | Turn on the trial sequence. Line up 5 director intros from coaches (A4 goes out Jan 13). Pick the first free search tool to build. |

---

## 9. Decisions for Craig

1. **Hashtags:** allow #travelball / #travelbaseball in hashtags only? *(Recommend yes.)*
2. **Analytics:** add PostHog (new dependency) + Meta/Google tags on signed-out site pages only? *(Recommend yes; update the privacy draft.)*
3. **Referral reward:** 50% off next season per paid referral, or a free season after 3? *(Recommend the free season; it's simpler to explain.)*
4. **Who posts:** Craig, or hire a part-time social person (college baseball player or baseball mom with a following, ~$500–800/month) once the content pillars are working?
5. **Launch area:** which metro is the January local launch, for ads, PR and the clinic?
6. ~~Ad budget~~ **Decided:** no paid ads until Fungo makes money; then up to 25% of last month's profit (§6.7).
7. **The comedian partnership (§6.8):** what to offer him, and when your wife makes the intro.
