import { CLUB_HREF, Check, Cta } from "./parts";

const FREE = [
  "Roster and invites for coaches and parents",
  "Games and practices added by hand",
  "The smart lineup engine: Auto-fill, fair-play rules, Why this lineup?",
  "Printable lineup cards and the batting order picture",
  "Season playing time and charts",
  "57 animated plays and quizzes",
  "Uploaded walk-up songs and the soundboard",
  "Works offline at the field",
];
const AI = [
  "AI schedule import",
  "AI practice plans for your age group",
  "AI tournament reader: event, schedule, bracket, tie-breakers, scores",
  "Rules in plain English",
  "AI walk-up songs, lyrics and announcer",
  "AI uniform reader",
];
const TEAM = [
  "Game day posts and messages to GroupMe",
  "Team money: fees, payments, expenses, receipts",
  "Tournament standings and What time do we play tomorrow?",
  "GameChanger stats import and competitive lineups",
  "Plays homework for families",
];
const CLUB = [
  "Everything in Team, AI included, for every team that joins",
  "Club dashboard: every team's record, next game and latest lineup",
  "Your club's look and club uniforms",
  "Shared library of practice plans and homework play sets",
  "Club GroupMe: post to your coaches and every team at once",
];

/** The three plans side by side (Home shows them short, Pricing in full). */
export function PricingGrid({ full = false }: { full?: boolean }) {
  return (
    <div className="mt-10 grid gap-5 lg:grid-cols-3 lg:items-start">
      <div className="rounded-3xl border-2 border-slate-200 bg-white p-6 md:p-8">
        <p className="text-lg font-bold text-[#1B2A4A]">Free</p>
        <p className="mt-2 text-5xl font-black text-[#1B2A4A]">$0</p>
        <p className="text-slate-600">forever</p>
        <ul className="mt-6 flex flex-col gap-3 text-[15px] text-slate-700">
          {(full ? FREE : FREE.slice(0, 5)).map((f) => (
            <Check key={f}>{f}</Check>
          ))}
        </ul>
        <div className="mt-8">
          <Cta variant="outline" size="md">
            Get started free
          </Cta>
        </div>
      </div>

      <div className="relative rounded-3xl bg-[#1B2A4A] p-6 text-white shadow-2xl shadow-[#1B2A4A]/30 ring-4 ring-[#DC143C] md:p-8 lg:-mt-4">
        <span className="absolute -top-3.5 left-6 rounded-full bg-[#DC143C] px-3 py-1 text-xs font-black tracking-wide uppercase">
          Most popular
        </span>
        <p className="text-lg font-bold">Team</p>
        <p className="mt-2 text-5xl font-black">$129</p>
        <p className="text-white/70">per team, per season</p>
        <p className="mt-6 text-sm font-bold tracking-wide text-[#FF8FA3] uppercase">
          Everything in Free, plus every AI tool
        </p>
        <ul className="mt-3 flex flex-col gap-3 text-[15px]">
          {(full ? AI : AI.slice(0, 4)).map((f) => (
            <Check key={f} light>
              ✨ {f}
            </Check>
          ))}
          {(full ? TEAM : TEAM.slice(0, 3)).map((f) => (
            <Check key={f} light>
              {f}
            </Check>
          ))}
        </ul>
        <div className="mt-8">
          <Cta>Start your free 14-day trial</Cta>
        </div>
        <p className="mt-3 text-sm text-white/70">One team, through July 31. Pay once a season.</p>
      </div>

      <div className="rounded-3xl border-2 border-slate-200 bg-white p-6 md:p-8">
        <p className="text-lg font-bold text-[#1B2A4A]">Club</p>
        <p className="mt-2 text-5xl font-black text-[#1B2A4A]">$99</p>
        <p className="text-slate-600">per team, per season</p>
        <ul className="mt-6 flex flex-col gap-3 text-[15px] text-slate-700">
          {(full ? CLUB : CLUB.slice(0, 3)).map((f) => (
            <Check key={f}>{f}</Check>
          ))}
        </ul>
        <div className="mt-8">
          <Cta href={CLUB_HREF} variant="outline" size="md">
            Start a club
          </Cta>
        </div>
      </div>
    </div>
  );
}

export function LowRisk() {
  return (
    <ul className="mx-auto mt-8 flex max-w-4xl flex-col justify-center gap-x-8 gap-y-2 text-center text-[15px] font-semibold text-slate-700 sm:flex-row">
      <li>✓ 14 days of everything, AI included</li>
      <li>✓ No credit card</li>
      <li>✓ Nothing renews by itself</li>
      <li>✓ Nothing is ever deleted</li>
    </ul>
  );
}
