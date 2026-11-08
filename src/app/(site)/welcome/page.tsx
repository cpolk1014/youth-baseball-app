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
  title: {
    absolute: "RallyCap: Youth Baseball's AI Assistant Coach | Lineups, Schedules & Tournaments",
  },
  description:
    "Snap your schedule and AI adds every game. Get practice plans for your age group and fair lineups in two minutes. Built by a youth baseball coach who writes software for a living. Free 14-day trial.",
  alternates: { canonical: "/" },
};

const PROBLEMS = [
  ["Typing", "a 40-game schedule into a spreadsheet. At 11\u00a0p.m. With one eye open."],
  ["Planning", "practice in the parking lot. Five minutes before practice."],
  ["Redoing", "the lineup because somebody's dad has been counting innings."],
  ["Answering", "“what time do we play?” in the group chat. Forty times. Same game."],
  ["Doing", "pool-play math on a napkin at the hotel breakfast."],
];

const MAGIC = [
  {
    title: "Snap the schedule. AI adds every game.",
    body: "Screenshot it, photo it, PDF it, spreadsheet it. AI reads every date, time, opponent and field. You check it, tap Add, and get back to pretending you're not watching the 8U game on the next field.",
    screen: <AiScheduleScreen />,
  },
  {
    title: "Practice plans that aren't just “take BP.”",
    body: "Tell AI what your team needs, like “stop throwing to the wrong base.” It plans every practice of your season: drills timed to the minute, plays to work on, and coaching made for 7U or 14U.",
    screen: <AiPracticeScreen />,
  },
  {
    title: "Tournament weekend, minus the napkin math.",
    body: "Screenshot the event page, the pool schedule, the bracket, even the tie-breaker rules nobody reads. AI reads them. Snap the results page and it adds the scores.",
    screen: <TournamentScreen />,
  },
  {
    title: "Big-league walk-up songs. (He's nine.)",
    body: "AI writes the lyrics, makes the song and gets a stadium announcer to call your kid's name and number. Every kid gets their moment. Every parent gets the video.",
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
              ✨ Youth baseball&apos;s AI assistant coach
              <span className="hidden sm:inline"> · 7U–14U</span>
            </p>
            <h1 className="text-5xl leading-[1.02] font-black tracking-tight text-balance md:text-7xl lg:text-6xl xl:text-7xl">
              Finally, an assistant coach with no kid on the team.
            </h1>
            <p className="mt-6 max-w-xl text-xl leading-relaxed text-white/85 text-pretty">
              RallyCap&apos;s AI types in your schedule, plans your practices and reads the
              tournament bracket. <b className="text-white">You just coach.</b> (And find your
              kid&apos;s other batting glove.)
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
              Built by a youth baseball coach who writes software for a living.
            </b>{" "}
            Seven years of 7&nbsp;a.m. games, four as the GameChanger guy, three as a 7U head coach.
            Eventually he did what developers do: built an app instead of complaining.{" "}
            <Link
              href="/story"
              className="font-semibold text-[#DC143C] underline-offset-4 hover:underline"
            >
              Meet Craig →
            </Link>
          </p>
        </div>
      </Section>

      {/* 3. The problem */}
      <Section>
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <Eyebrow>The problem</Eyebrow>
            <H2>The baseball is the easy part.</H2>
            <p className="mt-4 text-xl text-slate-600">
              Coaching takes two hours a week. Running the team takes ten.
            </p>
            <p className="mt-6 text-2xl font-bold text-[#DC143C]">
              What if a robot did all that? A nice one. It loves baseball.
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
              The typing, the planning and the figuring out. Done by AI, checked by you, finished
              before game two of the doubleheader.
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
                Type “Mason catches at least two innings.” AI turns it into a lineup rule and checks
                it against your roster. No digging through settings.
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
              Snap the uniform flyer and AI lists every combo, ready to pick for each game. Now
              nobody shows up in white pants on gray day. (Somebody still will.)
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
            <H2>AI does the busywork. The lineup engine keeps the peace.</H2>
            <div className="mt-8 grid gap-6 sm:grid-cols-2">
              {[
                [
                  "⚾ Fair lineups, with receipts",
                  "Tap Auto-fill. Every inning follows your fair-play rules, and Why this lineup? explains every spot before anyone asks in the parking lot.",
                ],
                [
                  "📣 Game day on autopilot",
                  "The game day post hits your GroupMe on its own: field, time, arrive by and uniform. Fewer “what time?” texts. Not zero. Never zero.",
                ],
                [
                  "🏁 What time do we play tomorrow?",
                  "Every way your seed can still land, with the game time and what has to happen. Settled before the hotel pool closes.",
                ],
                [
                  "💵 Team money, out in the open",
                  "Fees split across the roster, payments, expenses and receipts. Every family knows what they owe, and where the umpire money went.",
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
          <H2 light>Set it up tonight. Look organized by Saturday.</H2>
        </div>
        <ol className="mt-12 grid gap-6 md:grid-cols-3">
          {[
            [
              "Add your roster",
              "Names, numbers and who can pitch and catch. Invite coaches and parents with a link.",
            ],
            [
              "Snap your schedule",
              "AI adds every game and practice. Check them, tap Add. That's it. That's the step.",
            ],
            [
              "Tell AI your goals",
              "A season of practice plans, done. Then tap Auto-fill before every game and look like a genius.",
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
          <H2>“I write software for a living. So I made the computer do the annoying parts.”</H2>
          <blockquote className="mt-8 flex flex-col gap-4 border-l-4 border-[#DC143C] pl-6 text-lg leading-relaxed text-slate-700">
            <p>
              My stepson and my nephew started youth baseball at 7. They&apos;re 14 now. I&apos;ve
              been the GameChanger guy, the dad in the bleachers, and for three years the head coach
              of a 7U team. By day, I build software.
            </p>
            <p>
              The baseball was never the hard part. It was typing in schedules, planning practices
              at midnight, redoing lineups so every kid got fair innings, and figuring out
              tournament seeding with a pencil.
            </p>
            <p>
              One night, somewhere between the third lineup rewrite and the fortieth “what time do
              we play?” text, the developer in me snapped. So I built RallyCap and put AI on the
              busywork. Now I snap the schedule instead of typing it.{" "}
              <b className="text-[#1B2A4A]">And I spend my time coaching kids.</b>
            </p>
          </blockquote>
          <p className="mt-6 pl-7 font-bold text-[#1B2A4A]">
            Craig, founder, software developer &amp; 7U head coach
          </p>
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
          <H2>Less than one tournament entry fee. For the whole season.</H2>
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
          Go coach. We&apos;ve got the typing.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-xl text-white/80">
          Snap your schedule tonight. Have a fair lineup before first pitch. Maybe even beat the
          other team to the field.
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
