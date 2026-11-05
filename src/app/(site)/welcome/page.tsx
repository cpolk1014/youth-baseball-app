import type { Metadata } from "next";
import Link from "next/link";
import {
  AiPracticeScreen,
  AiScheduleScreen,
  TournamentScreen,
  TypedRuleScreen,
  WalkupScreen,
} from "@/components/site/mocks";
import {
  Ai,
  CLUB_HREF,
  Cta,
  Eyebrow,
  H2,
  Laptop,
  Lead,
  Phone,
  Section,
} from "@/components/site/parts";
import { LowRisk, PricingGrid } from "@/components/site/Pricing";

export const metadata: Metadata = {
  title: { absolute: "RallyCap: AI-Powered Youth Baseball | Lineups, Schedules & Tournaments" },
  description:
    "Snap your schedule and AI adds every game. Get practice plans for your age group and fair lineups in two minutes. Built by a travel ball coach. Free 14-day trial.",
  alternates: { canonical: "/" },
};

const PROBLEMS = [
  ["Typing", "a 40-game schedule into a spreadsheet, one game at a time."],
  ["Planning", "practice the night before. Again."],
  ["Redoing", "the lineup at midnight so everyone gets fair innings."],
  ["Answering", "“what time do we play?” forty times."],
  ["Working out", "tournament seeding on Saturday night with a pencil."],
];

const MAGIC = [
  {
    title: "Snap the schedule. AI adds every game.",
    body: "A photo, PDF or spreadsheet of your season or tournament schedule. AI reads the dates, times, opponents and fields, and you check them before they're added.",
    screen: <AiScheduleScreen />,
  },
  {
    title: "Practice plans written for your age group.",
    body: "Tell AI what your team needs (“more two-strike approach, better cutoffs”). It plans every practice of your season: drills timed to fit, plays to work on, coaching for 7U or 14U.",
    screen: <AiPracticeScreen />,
  },
  {
    title: "Tournaments, read in seconds.",
    body: "Screenshot the event page, the pool schedule, the bracket, even the tie-breaker rules. AI reads it all. Snap the results page and it adds the scores.",
    screen: <TournamentScreen />,
  },
  {
    title: "Big-league walk-ups, made by AI.",
    body: "AI writes the lyrics, makes the song, and records a stadium announcer calling the kid's name and number. Every kid gets their moment.",
    screen: <WalkupScreen />,
  },
];

export default function HomePage() {
  return (
    <>
      {/* 1. Hero */}
      <section className="relative overflow-hidden bg-[#1B2A4A] px-4 pt-14 pb-20 text-white sm:px-6 md:pt-20 md:pb-28">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 -right-40 size-[38rem] rounded-full bg-[#DC143C]/25 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-48 -left-32 size-[30rem] rounded-full bg-[#7C3AED]/20 blur-3xl"
        />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm font-bold tracking-wide ring-1 ring-white/20">
              ✨ AI-powered youth baseball · 7U–14U
            </p>
            <h1 className="text-5xl leading-[1.02] font-black tracking-tight text-balance md:text-7xl lg:text-6xl xl:text-7xl">
              Your AI assistant coach.
            </h1>
            <p className="mt-6 max-w-xl text-xl leading-relaxed text-white/85 text-pretty">
              Snap a picture of your schedule and AI adds every game. Tell it what your team needs
              and it plans every practice. Then get a fair lineup in two minutes.{" "}
              <b className="text-white">You coach. RallyCap handles the rest.</b>
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Cta />
              <a href="#ai" className="px-2 font-semibold text-white/85 hover:text-white">
                See AI in action ↓
              </a>
            </div>
            <p className="mt-4 text-sm text-white/70">
              14 days of everything, AI included. No credit card.
            </p>
          </div>
          <div className="relative mx-auto w-full max-w-[260px] sm:max-w-2xl sm:pt-6 sm:pb-16 sm:pl-[12%] lg:-mr-10 lg:max-w-none xl:-mr-24">
            <Laptop
              src="/site/home.jpg"
              alt="RallyCap's Home dashboard: next game, season record and to-dos"
              className="hidden sm:block"
            />
            <div className="relative sm:absolute sm:bottom-0 sm:left-0 sm:w-[29%]">
              <Phone src="/site/lineup.jpg" alt="An inning-by-inning lineup on a phone" priority />
            </div>
          </div>
        </div>
      </section>

      {/* 2. The anchor */}
      <Section tone="mist" className="!py-10 md:!py-12">
        <div className="flex flex-col items-center gap-3 text-center md:flex-row md:justify-center md:gap-6 md:text-left">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-[#1B2A4A] text-xl font-black text-white">
            C
          </span>
          <p className="max-w-3xl text-lg text-slate-700">
            <b className="text-[#1B2A4A]">
              Built by a travel ball dad who coaches, and put AI to work on the parts coaches hate.
            </b>{" "}
            Seven years in the travel ball grind, three as a head coach, four as the team&apos;s
            GameChanger guy.{" "}
            <Link
              href="/story"
              className="font-semibold text-[#DC143C] underline-offset-4 hover:underline"
            >
              Craig, founder &amp; 7U head coach →
            </Link>
          </p>
        </div>
      </Section>

      {/* 3. The problem */}
      <Section>
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <Eyebrow>The problem</Eyebrow>
            <H2>Coaching takes two hours a week. Running the team takes ten.</H2>
            <p className="mt-6 text-2xl font-bold text-[#DC143C]">
              What if most of that just… got done for you?
            </p>
          </div>
          <ul className="flex flex-col gap-3">
            {PROBLEMS.map(([verb, rest]) => (
              <li
                key={verb}
                className="rounded-2xl border-2 border-slate-100 bg-slate-50 px-5 py-4 text-lg text-slate-700"
              >
                <b className="text-[#1B2A4A]">{verb}</b> {rest}
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* 4. AI that does the busywork */}
      <Section id="ai" tone="mist">
        <div className="text-center">
          <Eyebrow>
            <Ai>AI that does the busywork</Ai>
          </Eyebrow>
          <H2>Point your phone at it. AI handles it.</H2>
          <Lead>
            <span className="mx-auto block">
              The typing, planning and figuring out behind a travel team, done by AI and checked by
              you.
            </span>
          </Lead>
        </div>
        <div className="mt-14 flex flex-col gap-20">
          {MAGIC.map((m, i) => (
            <div
              key={m.title}
              className={`grid items-center gap-10 md:grid-cols-2 ${i % 2 ? "md:[&>*:first-child]:order-2" : ""}`}
            >
              <div>
                <Ai />
                <h3 className="mt-3 text-3xl leading-tight font-black tracking-tight text-[#1B2A4A] md:text-4xl">
                  {m.title}
                </h3>
                <p className="mt-4 text-lg leading-relaxed text-slate-600">{m.body}</p>
              </div>
              <div>{m.screen}</div>
            </div>
          ))}
        </div>
        <div className="mt-16 grid gap-5 md:grid-cols-2">
          <div className="grid items-center gap-6 rounded-3xl bg-white p-6 sm:grid-cols-[1fr_200px]">
            <div>
              <Ai />
              <h3 className="mt-3 text-2xl font-black text-[#1B2A4A]">
                Your rules, in plain English.
              </h3>
              <p className="mt-2 text-slate-600">
                “Mason catches at least two innings.” AI turns what you type into lineup rules, and
                checks them against your roster.
              </p>
            </div>
            <div className="hidden sm:block">
              <TypedRuleScreen />
            </div>
          </div>
          <div className="flex flex-col justify-center rounded-3xl bg-white p-6">
            <Ai />
            <h3 className="mt-3 text-2xl font-black text-[#1B2A4A]">Uniforms from the flyer.</h3>
            <p className="mt-2 text-slate-600">
              Snap the uniform flyer and AI lists every combo (shirt, pants, hat, belt and socks),
              ready to pick for each game.
            </p>
            <Link
              href="/ai"
              className="mt-6 font-bold text-[#DC143C] underline-offset-4 hover:underline"
            >
              See everything AI does →
            </Link>
          </div>
        </div>
      </Section>

      {/* 5. Smart where it counts */}
      <Section>
        <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <div>
            <Eyebrow>Smart where it counts</Eyebrow>
            <H2>AI clears your plate. The smart engine runs your game.</H2>
            <div className="mt-8 grid gap-6 sm:grid-cols-2">
              {[
                [
                  "⚾ Fair lineups in two minutes",
                  "Tap Auto-fill. Every inning follows your fair-play rules, and Why this lineup? explains every spot.",
                ],
                [
                  "📣 Game day on autopilot",
                  "The game day post goes to your GroupMe automatically: field, time, arrive by and uniform.",
                ],
                [
                  "🏁 What time do we play tomorrow?",
                  "Every way your seed can still land, with the game time and what has to happen.",
                ],
                [
                  "💵 Team money everyone can see",
                  "Fees split across the roster, payments, expenses and receipts. Every family knows what they owe.",
                ],
              ].map(([t, b]) => (
                <div key={t}>
                  <h3 className="text-lg font-black text-[#1B2A4A]">{t}</h3>
                  <p className="mt-1 text-slate-600">{b}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 items-start gap-4">
            <Phone src="/site/why.jpg" alt="Why this lineup? explaining each player's spots" />
            <Phone
              src="/site/game.jpg"
              alt="A game's details: where, arrive by and uniform"
              className="mt-12"
            />
          </div>
        </div>
      </Section>

      {/* 6. How it works */}
      <Section tone="navy">
        <div className="text-center">
          <Eyebrow light>How it works</Eyebrow>
          <H2 light>From zero to game ready in one evening.</H2>
        </div>
        <ol className="mt-12 grid gap-6 md:grid-cols-3">
          {[
            [
              "Add your roster",
              "Names, numbers and who can pitch and catch. Invite coaches and parents with a link.",
            ],
            ["Snap your schedule", "AI adds every game and practice. Check them, tap Add."],
            [
              "Tell AI your goals",
              "Practice plans for the season, done. Then tap Auto-fill for a fair lineup before every game.",
            ],
          ].map(([t, b], i) => (
            <li key={t} className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
              <span className="flex size-12 items-center justify-center rounded-full bg-[#DC143C] text-xl font-black">
                {i + 1}
              </span>
              <h3 className="mt-4 text-2xl font-black">{t}</h3>
              <p className="mt-2 text-white/75">{b}</p>
            </li>
          ))}
        </ol>
        <div className="mt-10 text-center">
          <Cta />
        </div>
      </Section>

      {/* 7. The story */}
      <Section tone="mist">
        <div className="mx-auto max-w-3xl">
          <Eyebrow>From the dugout</Eyebrow>
          <H2>“I put AI on everything I hated about running a team.”</H2>
          <blockquote className="mt-8 flex flex-col gap-4 border-l-4 border-[#DC143C] pl-6 text-lg leading-relaxed text-slate-700">
            <p>
              My stepson and my nephew started travel ball at 7. They&apos;re 14 now. I&apos;ve been
              the GameChanger guy, the dad in the bleachers, and for three years the head coach of a
              7U team.
            </p>
            <p>
              The baseball was never the hard part. It was typing in schedules, planning practices
              at midnight, redoing lineups so every kid got fair innings, and figuring out
              tournament seeding with a pencil.
            </p>
            <p>
              So I built RallyCap and put AI on the busywork. Now I snap the schedule instead of
              typing it. I tell it what my team needs and get a practice plan.{" "}
              <b className="text-[#1B2A4A]">And I spend my time coaching kids.</b>
            </p>
          </blockquote>
          <p className="mt-6 pl-7 font-bold text-[#1B2A4A]">Craig, founder &amp; 7U head coach</p>
          <Link
            href="/story"
            className="mt-6 inline-block pl-7 font-bold text-[#DC143C] underline-offset-4 hover:underline"
          >
            Read the whole story →
          </Link>
        </div>
      </Section>

      {/* 8. Pricing preview */}
      <Section>
        <div className="text-center">
          <Eyebrow>Pricing</Eyebrow>
          <H2>Start free. Turn on the AI when you&apos;re ready.</H2>
        </div>
        <PricingGrid />
        <LowRisk />
        <p className="mt-6 text-center">
          <Link
            href="/pricing"
            className="font-bold text-[#DC143C] underline-offset-4 hover:underline"
          >
            See full pricing →
          </Link>
          <span className="mx-3 text-slate-300">·</span>
          <Link
            href={CLUB_HREF}
            className="font-bold text-[#1B2A4A] underline-offset-4 hover:underline"
          >
            Running a club? Start one →
          </Link>
        </p>
      </Section>

      {/* 9. Final call to action */}
      <section className="relative overflow-hidden bg-[#1B2A4A] px-4 py-20 text-center text-white sm:px-6">
        <div aria-hidden className="absolute inset-x-0 top-0 h-2 bg-[#DC143C]" />
        <h2 className="mx-auto max-w-3xl text-4xl leading-tight font-black tracking-tight text-balance md:text-6xl">
          Let AI run the busywork. You coach the kids.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-xl text-white/80">
          Snap your schedule tonight. Have a fair lineup before first pitch.
        </p>
        <div className="mt-8">
          <Cta />
        </div>
        <p className="mt-4 text-sm text-white/70">
          14 days of everything · No credit card · Works on any phone
        </p>
      </section>
    </>
  );
}
