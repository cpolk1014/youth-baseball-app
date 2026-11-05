import type { Metadata } from "next";
import {
  AiPracticeScreen,
  AiScheduleScreen,
  PlayerStatsScreen,
  TournamentScreen,
  TypedRuleScreen,
  WalkupScreen,
} from "@/components/site/mocks";
import { Ai, Check, Cta, EndCta, FeatureRow, PageHero, Section } from "@/components/site/parts";

export const metadata: Metadata = {
  title: { absolute: "AI for Youth Baseball: Schedules, Practice Plans & Tournaments | RallyCap" },
  description:
    "RallyCap's AI reads your schedules, tournament screenshots and box scores, plans age-appropriate practices, turns plain-English rules into lineup rules, and makes walk-up songs.",
  alternates: { canonical: "/ai" },
};

export default function AiPage() {
  return (
    <>
      <PageHero
        eyebrow="✨ RallyCap AI"
        title="AI-powered youth baseball."
        lead="The work behind a travel team, from schedules to practice plans to tournament weekends, done by AI and checked by you."
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Cta />
          <span className="text-white/75">Every AI tool is included in the trial.</span>
        </div>
      </PageHero>

      <Section>
        <div className="flex flex-col gap-24">
          <FeatureRow
            label={<Ai>Schedule import</Ai>}
            title="Snap it. Don't type it."
            visual={<AiScheduleScreen />}
          >
            <p>
              Upload a photo, screenshot, PDF, CSV or spreadsheet of any schedule: your season, a
              league calendar, the practice field rotation. AI pulls out every game and practice
              (dates, times, opponents, places) and shows you the list to check before anything is
              added.
            </p>
            <p className="font-bold text-[#1B2A4A]">No more typing in 40 games one at a time.</p>
          </FeatureRow>

          <FeatureRow
            flip
            label={<Ai>Practice plans</Ai>}
            title="A season of practices, planned for your age group."
            visual={<AiPracticeScreen />}
          >
            <p>
              Tell RallyCap what you want this season, in your own words. AI plans{" "}
              <b className="text-[#1B2A4A]">every upcoming practice</b>:
            </p>
            <ul className="flex flex-col gap-2">
              <Check>drills that fill the exact time you have</Check>
              <Check>the situations to work on, from our library of 57 animated plays</Check>
              <Check>a focus and a fun theme for each day</Check>
              <Check>coaching tuned to your age band: 8U and under, 9–10, 11–12, 13–14</Check>
            </ul>
            <p>You review each one before saving. AI never gets your players&apos; names.</p>
          </FeatureRow>

          <FeatureRow
            label={<Ai>Tournament reader</Ai>}
            title="Tournament weekends, read for you."
            visual={<TournamentScreen />}
          >
            <p>Screenshot it and AI reads it:</p>
            <ul className="flex flex-col gap-2">
              <Check>
                <b className="text-[#1B2A4A]">The event page:</b> dates, fields and every team in
                your division
              </Check>
              <Check>
                <b className="text-[#1B2A4A]">The pool schedule and bracket:</b> every game, and
                updates show only what changed
              </Check>
              <Check>
                <b className="text-[#1B2A4A]">The tie-breaker rules:</b> saved by name to reuse at
                that organization&apos;s next event
              </Check>
              <Check>
                <b className="text-[#1B2A4A]">The results page:</b> scores for every game, matched
                to your schedule
              </Check>
            </ul>
            <p>
              Then RallyCap&apos;s smart engine runs the standings and answers{" "}
              <b className="text-[#1B2A4A]">What time do we play tomorrow?</b>
            </p>
          </FeatureRow>

          <FeatureRow
            flip
            label={<Ai>Rules in plain English</Ai>}
            title="Just say what you want."
            visual={<TypedRuleScreen />}
          >
            <p>
              Type a lineup rule the way you&apos;d say it to an assistant coach. AI turns it into a
              rule RallyCap can follow, asks if anything&apos;s unclear, and checks it against your
              roster before you save it.
            </p>
          </FeatureRow>

          <FeatureRow
            label={<Ai>Walk-ups & announcer</Ai>}
            title="Every kid gets a big-league moment."
            visual={<WalkupScreen />}
          >
            <ul className="flex flex-col gap-2">
              <Check>
                <b className="text-[#1B2A4A]">AI songs</b> in the style and vibe you pick, chanting
                the kid&apos;s name and number if you want
              </Check>
              <Check>
                <b className="text-[#1B2A4A]">AI lyrics:</b> pick a theme and get three kid-safe,
                original options to edit
              </Check>
              <Check>
                <b className="text-[#1B2A4A]">A stadium announcer</b> calling “Now batting… number
                seven…”, said exactly the way the family wants
              </Check>
            </ul>
            <p>Parents set up their own kid&apos;s walk-up, and the coach approves it.</p>
          </FeatureRow>

          <FeatureRow
            flip
            label={<Ai>Box score reader · for parents</Ai>}
            title="Your player's stats, from one upload."
            visual={<PlayerStatsScreen />}
          >
            <p>
              Parents upload a GameChanger box score after the game. AI finds{" "}
              <b className="text-[#1B2A4A]">their player&apos;s line and only theirs</b>, matched by
              jersey number and name. Season totals and trends add up, private to the family.
            </p>
            <p className="text-base text-slate-500">Player stats add-on, $10 a year.</p>
          </FeatureRow>

          <div className="mx-auto max-w-2xl rounded-3xl bg-slate-50 p-8 text-center">
            <Ai>Uniform reader</Ai>
            <h2 className="mt-3 text-3xl font-black text-[#1B2A4A]">
              The flyer becomes your uniform list.
            </h2>
            <p className="mt-3 text-lg text-slate-600">
              Snap or upload the uniform flyer. AI lists every combo (shirt, pants, hat, belt and
              socks), ready to pick for each game.
            </p>
          </div>
        </div>
      </Section>

      <Section tone="mist">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-3xl font-black tracking-tight text-[#1B2A4A] md:text-4xl">
            AI you can trust around kids.
          </h2>
          <ul className="mt-8 flex flex-col gap-4 text-lg text-slate-700">
            <Check>
              <b className="text-[#1B2A4A]">You check everything.</b> AI shows what it found, and
              nothing is saved until you confirm.
            </Check>
            <Check>
              <b className="text-[#1B2A4A]">Only what&apos;s needed.</b> Practice plans never send
              player names. A box score is read only for your own child&apos;s line, and the file
              isn&apos;t kept.
            </Check>
            <Check>
              <b className="text-[#1B2A4A]">Kid-safe by design:</b> original, clean lyrics, and no
              messaging with kids, ever.
            </Check>
          </ul>
        </div>
      </Section>

      <EndCta />
    </>
  );
}
