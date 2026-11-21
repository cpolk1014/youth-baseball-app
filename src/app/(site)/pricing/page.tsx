import type { Metadata } from "next";
import Link from "next/link";
import { Ai, Cta, EndCta, PageHero, Section } from "@/components/site/parts";
import { LowRisk, PricingGrid } from "@/components/site/Pricing";

export const metadata: Metadata = {
  title: { absolute: "Pricing | Fungo: Youth Baseball's AI Assistant Coach, from $0" },
  description:
    "Fungo's smart lineup engine is free forever. Every AI tool, plus team chat, team money and tournaments, is $129 a season per team, or $99 per team for clubs. 14-day free trial.",
  alternates: { canonical: "/pricing" },
};

const link = "font-semibold text-[#DC143C] underline underline-offset-2";

const FAQ: [string, React.ReactNode][] = [
  [
    "What does the AI actually do?",
    <>
      It reads things so you don&apos;t have to type them (rosters, schedules, tournament pages and
      brackets, tie-breaker rules, results, uniform flyers and box scores). It turns rules you type
      into lineup rules, plans age-appropriate practices, and makes walk-up songs and announcer
      calls. You check everything before it&apos;s saved.{" "}
      <Link href="/ai" className={link}>
        See the AI page
      </Link>
      .
    </>,
  ],
  [
    "Is the lineup builder AI?",
    "It's Fungo's own smart engine. It follows your fair-play rules exactly, gives the same result every time, and explains every spot. It's free forever.",
  ],
  [
    "What's a season?",
    "August 1 to July 31, for teams, clubs and the Player pass alike. Paid features keep working for 5 days after July 31 while you renew.",
  ],
  [
    "Joining mid-season?",
    "Pay for the season you'll play. Sign up any time from August through December and $129 covers fall and spring. Starting in January? Spring is $89 for a team, January through July. Clubs pay $99 a team and the Player pass is the same price all season. From June 1 you buy next season instead, and the rest of this one is on the house.",
  ],
  [
    "Do parents have to pay?",
    "No. Parents use Fungo free with your team. The Player pass (highlight reels, pitch count and stats) is an optional add-on for their own child.",
  ],
  [
    "What happens after the free trial?",
    "Free features keep working. AI and other paid tools pause, and everything you made stays. Renew at any time.",
  ],
  [
    "Does every team get a free trial?",
    "One per coach, like the last orange slice. Your first team gets 14 days of everything, AI included. Coaching a second team too? It starts on the free plan, and you buy its season whenever you're ready. Teams in a club skip the trial: the club's code covers them.",
  ],
  ["We're part of a club. Do we pay too?", "No. Your club's code covers your team's season."],
  [
    "Is my kids' information safe with AI?",
    <>
      AI only sees what a feature needs. Practice plans get no player names, and each family sees
      only their own child&apos;s box score line.{" "}
      <Link href="/privacy" className={link}>
        Read our Privacy Policy
      </Link>
      .
    </>,
  ],
];

export default function PricingPage() {
  return (
    <>
      <PageHero
        eyebrow="Pricing"
        title="Simple pricing. No fine print. No surprise renewals."
        lead="Start free. Try every AI tool for 14 days on your first team. Pay once a season, for less than one tournament entry fee. We never charge you automatically, because nobody likes that guy."
      />

      <Section className="!pt-4 md:!pt-8">
        <PricingGrid full />
        <div className="mt-10 grid items-center gap-6 rounded-3xl border-2 border-slate-100 bg-slate-50 p-6 md:grid-cols-[1fr_auto] md:p-8">
          <div>
            <p className="text-sm font-bold tracking-[0.14em] text-[#DC143C] uppercase">
              Add-on for parents
            </p>
            <h2 className="mt-2 text-2xl font-black text-[#1B2A4A]">
              The Player pass: $10 a season <Ai />
            </h2>
            <p className="mt-2 max-w-2xl text-slate-600">
              Pine Tar Productions: highlight reels with a stadium announcer and slow-mo. A pitch
              count that follows your player to every team, lesson and bullpen, with Pitch Smart
              rest days. And their stats from the coaches&apos; box scores, season after season. $5
              for each additional child.
            </p>
          </div>
          <Cta href="/parents" variant="outline" size="md">
            See the Player pass
          </Cta>
        </div>
        <LowRisk />
      </Section>

      <Section tone="mist">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-3xl font-black tracking-tight text-[#1B2A4A] md:text-4xl">
            Questions coaches ask (between innings)
          </h2>
          <div className="mt-8 flex flex-col gap-3">
            {FAQ.map(([q, a]) => (
              <details
                key={q}
                className="group rounded-2xl border-2 border-slate-200 bg-white px-5 py-4 open:border-[#1B2A4A]/30"
              >
                <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-4 text-lg font-bold text-[#1B2A4A]">
                  {q}
                  <span
                    aria-hidden
                    className="text-2xl text-[#DC143C] transition group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <div className="mt-3 text-slate-600">{a}</div>
              </details>
            ))}
          </div>
        </div>
      </Section>

      <EndCta title="Try every AI tool free for 14 days. Your scorebook will be jealous." />
    </>
  );
}
