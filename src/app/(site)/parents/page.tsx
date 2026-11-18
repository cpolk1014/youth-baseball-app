import type { Metadata } from "next";
import {
  ParentGameDayScreen,
  PineTarScreen,
  PitchCounterScreen,
  PitchLogScreen,
  PlayerStatsScreen,
} from "@/components/site/mocks";
import { Ai, Check, Cta, Eyebrow, PageHero, Section, TRIAL_HREF } from "@/components/site/parts";

export const metadata: Metadata = {
  title: { absolute: "Fungo for Parents: Highlight Reels & Pitch Counts" },
  description:
    "Turn your clips into highlight reels with a stadium announcer, and keep a pitch count that follows your kid to every team, lesson and bullpen, with Pitch Smart rest days. Free with your team; the Player pass is $10 a season.",
  alternates: { canonical: "/parents" },
};

const FREE: [string, string, string][] = [
  [
    "📍",
    "When and where",
    "Every game and practice, with arrive by, the field and one-tap directions. Yes, Field 7. The far one.",
  ],
  [
    "👕",
    "What to wear",
    "The uniform for each game, so the white pants get washed before, not during.",
  ],
  [
    "💵",
    "What you owe",
    "Your family's balance and due dates. No more awkward payment reminders in the group chat.",
  ],
  ["🏁", "Tournament weekends", "Live standings and What time do we play tomorrow?"],
  [
    "🎵",
    "Your player's walk-up song",
    "At every game, made with AI if your team's plan includes it, or upload your own. The coach approves it.",
  ],
  ["🧠", "Homework", "Watch the assigned plays and take the quiz together."],
];

export default function ParentsPage() {
  return (
    <>
      <PageHero
        light
        eyebrow="For parents"
        title="Highlight reels that look like TV. A pitch count that follows their arm."
        lead="Turn the clip you filmed from the fence into a highlight with your kid's name on screen and a stadium announcer. Count every pitch, at every game, lesson and bullpen, for every team, and know when they can pitch again. The Player pass is $10 a season; everything else for parents is free with your team."
        art={
          <div className="relative mx-auto w-full max-w-[420px]">
            <div className="w-[72%] -rotate-3">
              <PineTarScreen />
            </div>
            <div className="absolute top-[18%] right-0 w-[64%] rotate-3">
              <PitchCounterScreen />
            </div>
          </div>
        }
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Cta href={`${TRIAL_HREF}?next=/profile`}>Get the Player pass</Cta>
          <a href="#pitch-count" className="font-bold text-[#1B2A4A] underline">
            How the pitch count works
          </a>
        </div>
      </PageHero>

      {/* Pine Tar Productions: the headline act for parents. */}
      <section
        id="pine-tar"
        className="relative overflow-hidden bg-[#0F1A30] px-4 py-16 text-white sm:px-6 md:py-24"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -left-32 size-[30rem] rounded-full bg-[#7C3AED]/30 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-40 -bottom-40 size-[34rem] rounded-full bg-[#DC143C]/30 blur-3xl"
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 md:grid-cols-[1.1fr_1fr]">
          <div>
            <Ai>Pine Tar Productions</Ai>
            <h2 className="mt-4 text-4xl leading-[1.05] font-black tracking-tight text-balance md:text-6xl">
              Your kid&apos;s highlight reel. Network quality. Bleacher budget.
            </h2>
            <p className="mt-6 text-xl leading-relaxed text-white/85">
              You filmed it from the fence. Now make it look like the big leagues. Pick the clip,
              tag the play, and get a highlight with your kid&apos;s name on screen, a stadium
              announcer calling it, and a slow-mo replay.
            </p>
            <ul className="mt-8 flex flex-col gap-3 text-lg text-white/85">
              <Check light>
                <b className="text-white">AI writes the call</b> (“Mason turns on it… GONE!”) and a
                stadium voice reads it.
              </Check>
              <Check light>
                <b className="text-white">Name and number on screen</b> in your team&apos;s colors.
              </Check>
              <Check light>
                <b className="text-white">Slow-mo replay</b> of the exact moment you pick.
              </Check>
              <Check light>
                <b className="text-white">Made on your phone, saved to your phone.</b> We never
                store your video.
              </Check>
            </ul>
            <p className="mt-6 text-lg font-bold">Part of the Player pass, $10 a season.</p>
            <div className="mt-6">
              <Cta href={`${TRIAL_HREF}?next=/profile`} variant="light">
                Get the Player pass
              </Cta>
            </div>
            <p className="mt-6 text-sm text-white/60">
              Side effects: grandma watches it 40 times. Budget your data accordingly.
            </p>
          </div>
          <PineTarScreen />
        </div>
      </section>

      {/* Pitch count: the other headline act. */}
      <Section id="pitch-count" tone="mist">
        <div className="grid items-center gap-12 md:grid-cols-[1.1fr_1fr]">
          <div>
            <Eyebrow>Pitch count · Player pass</Eyebrow>
            <h2 className="text-3xl leading-tight font-black tracking-tight text-balance text-[#1B2A4A] md:text-5xl">
              Their arm doesn&apos;t care which team they pitched for.
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-slate-700">
              Saturday for the travel team, Tuesday for the rec team, a lesson on Thursday. No coach
              sees all of it. You do. Fungo adds it up and tells you when they can pitch again.
            </p>
            <ul className="mt-6 flex flex-col gap-3 text-lg text-slate-700">
              <Check>
                <b className="text-[#1B2A4A]">Count it as it happens:</b> big Ball and Strike
                buttons, one thumb, from the bleachers. Or type the total after.
              </Check>
              <Check>
                <b className="text-[#1B2A4A]">Every session:</b> games, practice bullpens, pitching
                lessons, and the Saturday they subbed for another team.
              </Check>
              <Check>
                <b className="text-[#1B2A4A]">Rest days, figured out:</b> MLB and USA
                Baseball&apos;s Pitch Smart limits for their age. “55 pitches Saturday: rest until
                Wednesday.” A bullpen on a rest day gets flagged.
              </Check>
              <Check>
                <b className="text-[#1B2A4A]">The coach&apos;s count lands for you:</b> when the
                coach adds the game&apos;s box score, the count shows up to approve. Already logged
                it? You pick which to keep.
              </Check>
              <Check>
                <b className="text-[#1B2A4A]">Follows them everywhere:</b> every team, every season.
                Private to your family.
              </Check>
            </ul>
            <div className="mt-8">
              <Cta href={`${TRIAL_HREF}?next=/profile`}>Get the Player pass</Cta>
            </div>
            <p className="mt-3 text-sm text-slate-500">
              Pitch Smart is a guide; your league&apos;s rules may be stricter.
            </p>
          </div>
          <PitchLogScreen />
        </div>
      </Section>

      <Section>
        <div className="grid items-center gap-12 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <h2 className="text-3xl font-black tracking-tight text-balance text-[#1B2A4A] md:text-4xl">
              Free with your team: know where to be, what to wear and what you owe
            </h2>
            <p className="mt-3 text-lg text-slate-600">
              Without asking the group chat. Your coach sends the link.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {FREE.map(([icon, t, b]) => (
                <div key={t} className="rounded-3xl border-2 border-slate-100 bg-slate-50 p-5">
                  <span aria-hidden className="text-3xl">
                    {icon}
                  </span>
                  <h3 className="mt-3 text-xl font-black text-[#1B2A4A]">{t}</h3>
                  <p className="mt-2 text-slate-600">{b}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="relative mx-auto w-full max-w-[300px] lg:rotate-2">
            <ParentGameDayScreen />
            {/* The group chat questions Fungo answers before anyone asks. */}
            <div
              aria-hidden
              className="absolute top-[44%] -left-4 -rotate-6 rounded-2xl rounded-bl-sm bg-white px-3 py-2 text-sm font-semibold text-slate-500 shadow-xl ring-1 ring-slate-200 sm:-left-24"
            >
              <span className="line-through decoration-[#DC143C] decoration-2">
                Which field are we on??
              </span>
            </div>
            <div
              aria-hidden
              className="absolute -right-4 bottom-[6%] rotate-3 rounded-2xl rounded-br-sm bg-white px-3 py-2 text-sm font-semibold text-slate-500 shadow-xl ring-1 ring-slate-200 sm:-right-20"
            >
              <span className="line-through decoration-[#DC143C] decoration-2">
                White pants or gray?
              </span>
            </div>
          </div>
        </div>
      </Section>

      <Section tone="mist">
        <div className="grid items-center gap-12 md:grid-cols-2">
          <div>
            <Ai>Also in the Player pass</Ai>
            <h2 className="mt-3 text-3xl leading-tight font-black tracking-tight text-[#1B2A4A] md:text-5xl">
              Their stats, straight from the coach&apos;s box score.
            </h2>
            <ul className="mt-6 flex flex-col gap-3 text-lg text-slate-700">
              <Check>
                <b className="text-[#1B2A4A]">Nothing to upload:</b> when the coaches add a
                game&apos;s GameChanger box score, your player&apos;s line shows up.
              </Check>
              <Check>
                <b className="text-[#1B2A4A]">Season totals:</b> AVG, OBP, SLG, OPS and pitching,
                plus every game.
              </Check>
              <Check>
                <b className="text-[#1B2A4A]">Trends</b> that show how they&apos;re improving.
              </Check>
              <Check>
                <b className="text-[#1B2A4A]">Year after year, team after team.</b> The stats follow
                your player.
              </Check>
            </ul>
            <p className="mt-6 text-slate-600">
              The Player pass: Pine Tar Productions, pitch count and stats. $10 for one player, $5
              for each additional child, for the season.
            </p>
            <div className="mt-6">
              <Cta href={`${TRIAL_HREF}?next=/profile`}>Get the Player pass</Cta>
            </div>
            <p className="mt-3 text-sm text-slate-500">
              Sign in, then buy it on My profile. Sample stats shown are made up.
            </p>
          </div>
          <PlayerStatsScreen />
        </div>
      </Section>
    </>
  );
}
