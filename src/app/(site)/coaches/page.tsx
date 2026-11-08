import type { Metadata } from "next";
import Link from "next/link";
import { AiPracticeScreen, AiScheduleScreen, TournamentScreen } from "@/components/site/mocks";
import {
  Ai,
  Check,
  Cta,
  EndCta,
  FeatureRow,
  PageHero,
  Phone,
  Section,
} from "@/components/site/parts";

export const metadata: Metadata = {
  title: { absolute: "RallyCap for Coaches: Fair Lineups, AI Practice Plans & Game Day" },
  description:
    "For youth baseball coaches: fair inning-by-inning lineups in two minutes, AI practice plans for your age group, schedules from a photo, GroupMe game day posts and tournament weekends.",
  alternates: { canonical: "/coaches" },
};

const label = (text: string) => (
  <p className="text-sm font-bold tracking-[0.14em] text-[#DC143C] uppercase">{text}</p>
);
const b = "text-[#1B2A4A]";

const DUGOUT: [string, string, string][] = [
  [
    "💵",
    "Team money",
    "Fees split across the roster, payments, receipts. Every family sees what they owe, so you don't have to be the bill collector.",
  ],
  [
    "🎵",
    "Gameday PA",
    "Walk-up songs for every kid and a soundboard any parent can run from the bleachers.",
  ],
  [
    "🧠",
    "Plays homework",
    "57 animated plays: “Where do I go?” for every position. Assign them, see who did them.",
  ],
  [
    "📊",
    "GameChanger stats",
    "Import your team stats and build a competitive lineup from them when it counts.",
  ],
  [
    "📶",
    "Works with no signal",
    "Lineups, attendance and scores save on your phone on the back field and sync later.",
  ],
  [
    "👥",
    "Your whole staff",
    "Assistant coaches, a team manager and a treasurer, each seeing what they need. Parents get a read-only view.",
  ],
];

export default function CoachesPage() {
  return (
    <>
      <PageHero
        eyebrow="For coaches"
        title="You coach. RallyCap carries the clipboard."
        lead="Head coaches, assistant coaches, and the dad who got volunteered at the first parent meeting. Fair lineups in two minutes, practice plans written for you, and a game day that mostly runs itself."
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Cta />
          <span className="text-white/75">14 days of everything, AI included. No credit card.</span>
        </div>
      </PageHero>

      <Section>
        <div className="flex flex-col gap-24">
          <FeatureRow
            label={label("Lineups & fair play")}
            title="Fair lineups, settled before the parking lot asks."
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
                <b className={b}>Tap Auto-fill</b> and every inning follows your fair-play rules:
                bench time, infield innings, pitcher and catcher limits.
              </Check>
              <Check>
                <b className={b}>Why this lineup?</b> explains every spot, so you&apos;ve got the
                receipts when someone&apos;s dad has been counting innings.
              </Check>
              <Check>
                <b className={b}>Season playing time</b> that&apos;s fair to kids who miss games.
              </Check>
              <Check>
                <b className={b}>Your own rules, in plain English.</b> Type “Owen never pitches” and
                AI turns it into a rule.
              </Check>
              <Check>
                <b className={b}>Print the umpire&apos;s lineup card</b>, or share the batting order
                as a picture in team colors.
              </Check>
            </ul>
          </FeatureRow>

          <FeatureRow
            flip
            label={<Ai>Practice plans</Ai>}
            title="Practice plans for the exact age you coach."
            visual={<AiPracticeScreen />}
          >
            <p>
              Tell RallyCap what your team needs this season, out loud if you want (there&apos;s a
              mic). AI plans every practice: drills that fill your time, plays to walk through, a
              theme and a teammate lesson, written for 7U or 14U.
            </p>
            <p>You review every practice before it&apos;s saved. Change any drill you like.</p>
          </FeatureRow>

          <FeatureRow
            label={<Ai>Schedule import</Ai>}
            title="Snap the schedule. Skip the typing."
            visual={<AiScheduleScreen />}
          >
            <p>
              A photo, PDF or spreadsheet of your season. AI adds every game and practice with the
              field and time, and you check them before they go in.
            </p>
          </FeatureRow>

          <FeatureRow
            flip
            label={label("Game day")}
            title="Game day, minus the forty “what time?” texts."
            visual={
              <Phone
                src="/site/game.jpg"
                alt="A game's details: where, arrive by and uniform"
                className="max-w-[260px]"
              />
            }
          >
            <ul className="flex flex-col gap-3">
              <Check>
                <b className={b}>The game day post goes to your GroupMe on its own:</b> field, time,
                arrive by and uniform.
              </Check>
              <Check>
                <b className={b}>One-tap directions</b> for every family. Yes, even to Field 7.
              </Check>
              <Check>
                <b className={b}>Uniforms for every game</b>, read from the flyer by AI.
              </Check>
            </ul>
          </FeatureRow>

          <FeatureRow
            label={<Ai>Tournaments</Ai>}
            title="Tournament weekends, without the napkin math."
            visual={<TournamentScreen />}
          >
            <p>
              Screenshot the event page, the pool schedule, the bracket and the tie-breaker rules.
              AI reads them, parents add scores from the bleachers, and the standings keep
              themselves.
            </p>
            <p>
              Then everyone gets the answer to <b className={b}>“What time do we play tomorrow?”</b>
            </p>
          </FeatureRow>
        </div>
      </Section>

      <Section tone="mist">
        <h2 className="text-3xl font-black tracking-tight text-[#1B2A4A] md:text-4xl">
          Also in your dugout
        </h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {DUGOUT.map(([icon, t, d]) => (
            <div key={t} className="rounded-3xl border-2 border-slate-100 bg-white p-6">
              <span aria-hidden className="text-3xl">
                {icon}
              </span>
              <h3 className="mt-3 text-xl font-black text-[#1B2A4A]">{t}</h3>
              <p className="mt-2 text-slate-600">{d}</p>
            </div>
          ))}
        </div>
        <p className="mt-8 text-lg text-slate-700">
          Part of a club? Your director gives you a code and your team&apos;s season is covered.{" "}
          <Link
            href="/clubs"
            className="font-bold text-[#DC143C] underline-offset-4 hover:underline"
          >
            RallyCap for clubs →
          </Link>
        </p>
      </Section>

      <EndCta title="Go coach. We've got the clipboard." />
    </>
  );
}
