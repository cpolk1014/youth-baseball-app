import type { Metadata } from "next";
import { PlayerStatsScreen } from "@/components/site/mocks";
import { Ai, Check, Cta, PageHero, Section, TRIAL_HREF } from "@/components/site/parts";

export const metadata: Metadata = {
  title: { absolute: "RallyCap for Parents: Game Day Info & AI-Powered Player Stats" },
  description:
    "Know when and where to be, what to wear and what you owe, free with your team. Upload a box score and AI tracks your player's stats season after season, for $10 a year.",
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
        eyebrow="For parents"
        title="Know where to be, what to wear and what you owe. Without asking the group chat."
        lead="RallyCap is free for parents on your team. Your coach sends the link. You get your Saturday back. And your kid's stats, powered by AI, if you want them."
      />

      <Section>
        <h2 className="text-3xl font-black tracking-tight text-[#1B2A4A] md:text-4xl">
          Free with your team
        </h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FREE.map(([icon, t, b]) => (
            <div key={t} className="rounded-3xl border-2 border-slate-100 bg-slate-50 p-6">
              <span aria-hidden className="text-3xl">
                {icon}
              </span>
              <h3 className="mt-3 text-xl font-black text-[#1B2A4A]">{t}</h3>
              <p className="mt-2 text-slate-600">{b}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section tone="mist">
        <div className="grid items-center gap-12 md:grid-cols-2">
          <div>
            <Ai>Player stats · $10 a year</Ai>
            <h2 className="mt-3 text-3xl leading-tight font-black tracking-tight text-[#1B2A4A] md:text-5xl">
              Upload the box score. AI does the bragging math.
            </h2>
            <ul className="mt-6 flex flex-col gap-3 text-lg text-slate-700">
              <Check>
                <b className="text-[#1B2A4A]">AI reads the GameChanger box score</b> and finds your
                player&apos;s line, and only your player&apos;s, by jersey number and name.
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
              <Check>
                <b className="text-[#1B2A4A]">Private to your family.</b> Not coaches, not other
                parents.
              </Check>
            </ul>
            <p className="mt-6 text-slate-600">
              $10 for one player, $5 for each additional child, for a full year.
            </p>
            <div className="mt-6">
              <Cta href={`${TRIAL_HREF}?next=/profile`}>Get Player stats</Cta>
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
