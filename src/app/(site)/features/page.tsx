import type { Metadata } from "next";
import Link from "next/link";
import {
  Ai,
  Check,
  Cta,
  EndCta,
  FeatureRow,
  Laptop,
  PageHero,
  Phone,
  Section,
} from "@/components/site/parts";
import { WalkupScreen } from "@/components/site/mocks";

export const metadata: Metadata = {
  title: { absolute: "Features: AI Schedules, Fair Lineups, GroupMe & Tournaments | RallyCap" },
  description:
    "Youth baseball's AI assistant coach: AI schedule import and practice plans, a smart fair-play lineup engine, GroupMe game day posts, team money, tournaments and walk-up songs.",
  alternates: { canonical: "/features" },
};

const AI_TOOLS = [
  "AI schedule import: photos, PDFs, spreadsheets",
  "AI practice plans for your age group",
  "AI tournament reader: event pages, schedules, brackets, tie-breakers and results",
  "Rules in plain English",
  "AI walk-up songs, lyrics and announcer",
  "AI uniform flyer reader",
  "AI box score reader for parents' Player stats",
];

const GROUPS: { icon: string; title: string; items: [string, string][] }[] = [
  {
    icon: "📣",
    title: "Game day",
    items: [
      [
        "Game day posts to GroupMe,",
        "sent automatically with the field, time, arrive by and uniform.",
      ],
      ["One-tap directions", "in Apple Maps, Google Maps or Waze."],
      ["Uniforms for every game", "(or read them from the flyer with AI)."],
      ["Works with no signal", "on the back field."],
    ],
  },
  {
    icon: "🏁",
    title: "Tournaments",
    items: [
      ["AI reads", "the event, schedule, bracket, tie-breakers and results."],
      ["Parents add scores", "from the bleachers."],
      ["Smart standings", "with the real tie-breakers."],
      ["What time do we play tomorrow?", "Every way your seed can land."],
      ["Lock the seeds,", "fill the bracket and post it to the team."],
    ],
  },
  {
    icon: "💵",
    title: "Team money",
    items: [
      [
        "Fees split across the roster,",
        "single charges, expenses with receipts, payments and credits.",
      ],
      ["Installments with due dates,", "and family balances at a glance."],
    ],
  },
  {
    icon: "📋",
    title: "Practice & development",
    items: [
      ["AI practice plans,", "or build your own from the drill library."],
      ["57 animated plays:", "Where do I go? for every position, with quizzes and homework."],
    ],
  },
  {
    icon: "🎵",
    title: "Gameday PA",
    items: [
      ["Walk-up songs for every kid,", "made with AI or uploaded (see above)."],
      ["A soundboard", "of organ tunes and effects, for the mound visit and everything after."],
      ["Works with no signal:", "tap Get ready and every clip is saved on the phone."],
    ],
  },
  {
    icon: "🛡️",
    title: "Built right for youth sports",
    items: [
      [
        "Private by design:",
        "coaches see the team, parents see their kids, and families' stats stay with the family.",
      ],
      ["No private messaging with kids,", "ever."],
      ["We collect as little about players as we can,", "and we never sell data."],
    ],
  },
];

export default function FeaturesPage() {
  return (
    <>
      <PageHero
        eyebrow="Features"
        title="Everything your season runs on. AI where it saves you time."
        lead="From the first practice to the last bracket game. Built for the dugout: big buttons, readable in full sun, and works one-handed while the other hand holds a bucket of balls."
      >
        <Cta />
      </PageHero>

      <Section>
        <div className="grid items-center gap-10 rounded-3xl bg-gradient-to-br from-[#1B2A4A] to-[#2B1B4A] p-8 text-white md:grid-cols-[1fr_1.2fr] md:p-12">
          <div>
            <Ai>AI tools</Ai>
            <h2 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">
              Seven jobs you can stop doing.
            </h2>
            <p className="mt-3 text-white/75">Team and Club plans, and every trial.</p>
            <Link
              href="/ai"
              className="mt-6 inline-block font-bold text-[#FF6B85] underline-offset-4 hover:underline"
            >
              See how each one works →
            </Link>
          </div>
          <ul className="flex flex-col gap-3 text-lg">
            {AI_TOOLS.map((t) => (
              <Check key={t} light>
                {t}
              </Check>
            ))}
          </ul>
        </div>
      </Section>

      <section
        id="walkups"
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
            <Ai>Gameday PA</Ai>
            <h2 className="mt-4 text-4xl leading-[1.05] font-black tracking-tight text-balance md:text-6xl">
              The walk-up song is everything.
            </h2>
            <p className="mt-6 text-xl leading-relaxed text-white/85">
              Ask any 10-year-old. The batting stance is optional. The walk-up song is not. Some
              kids spend more time picking it than practicing, and honestly? Fair.
            </p>
            <p className="mt-3 text-xl font-bold">RallyCap makes sure every kid has a good one.</p>
            <ul className="mt-8 flex flex-col gap-3 text-lg text-white/85">
              <Check light>
                <b className="text-white">AI makes an original song</b> in the style and vibe they
                pick, even chanting their name and number.
              </Check>
              <Check light>
                <b className="text-white">AI writes the lyrics:</b> three kid-safe options from a
                theme. Edit them, or let your kid rewrite them for the fourth time.
              </Check>
              <Check light>
                <b className="text-white">A stadium announcer</b> calls “Now batting… number seven…”
                exactly the way your family says it.
              </Check>
              <Check light>
                <b className="text-white">Or upload any song</b> and trim it to the best 20 seconds,
                right on your phone.
              </Check>
              <Check light>
                <b className="text-white">Any parent can run the PA</b> from the bleachers. The
                coach approves every walk-up, so nobody gets surprised by the lyrics.
              </Check>
            </ul>
            <p className="mt-8 text-sm text-white/60">
              Side effects may include a 9-year-old adjusting their batting gloves for the entire
              song.
            </p>
          </div>
          <WalkupScreen />
        </div>
      </section>

      <Section tone="mist">
        <FeatureRow
          label={
            <p className="text-sm font-bold tracking-[0.14em] text-[#DC143C] uppercase">
              Lineups & fair play
            </p>
          }
          title="The smart lineup engine."
          visual={
            <div className="grid grid-cols-2 items-start gap-4">
              <Phone src="/site/lineup.jpg" alt="An inning-by-inning lineup built by Auto-fill" />
              <Phone
                src="/site/why.jpg"
                alt="Why this lineup? listing the rules it follows"
                className="mt-12"
              />
            </div>
          }
        >
          <ul className="flex flex-col gap-3">
            <Check>
              <b className="text-[#1B2A4A]">Auto-fill</b> builds every inning to your rules, and{" "}
              <b className="text-[#1B2A4A]">Undo</b> is one tap away.
            </Check>
            <Check>
              <b className="text-[#1B2A4A]">Fair-play rules:</b> max innings on the bench, everyone
              plays the infield, nobody sits twice before everyone&apos;s sat once, pitcher and
              catcher limits. Set each to Must, Warn or Off.
            </Check>
            <Check>
              <b className="text-[#1B2A4A]">Why this lineup?</b> The reasons behind every spot.
            </Check>
            <Check>
              <b className="text-[#1B2A4A]">Season playing time:</b> innings by player, infield vs.
              outfield vs. bench, fair to kids who miss games.
            </Check>
            <Check>
              <b className="text-[#1B2A4A]">Competitive mode:</b> a batting order and positions
              built from your GameChanger stats.
            </Check>
            <Check>
              <b className="text-[#1B2A4A]">The lineup card</b> printed for the umpire, and the
              batting order as a picture in team colors.
            </Check>
          </ul>
        </FeatureRow>
      </Section>

      <Section>
        <div className="grid gap-x-10 gap-y-14 md:grid-cols-2 lg:grid-cols-3">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <h2 className="text-2xl font-black text-[#1B2A4A]">
                <span aria-hidden className="mr-2">
                  {g.icon}
                </span>
                {g.title}
              </h2>
              <ul className="mt-4 flex flex-col gap-3 text-slate-600">
                {g.items.map(([b, rest]) => (
                  <Check key={b}>
                    <b className="text-[#1B2A4A]">{b}</b> {rest}
                  </Check>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section tone="mist">
        <div className="text-center">
          <h2 className="text-3xl font-black tracking-tight text-[#1B2A4A] md:text-4xl">
            Your whole season on one screen. Finally.
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-lg text-slate-600">
            On a laptop or tablet: the next game, the record, what needs doing and who&apos;s been
            sitting too much (before their parents notice).
          </p>
        </div>
        <Laptop
          src="/site/home.jpg"
          alt="RallyCap's Home dashboard on a laptop"
          className="mt-10 max-w-5xl"
        />
      </Section>

      <EndCta />
    </>
  );
}
