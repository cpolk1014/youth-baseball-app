import type { Metadata } from "next";
import { PineTarScreen, PlayerStatsScreen } from "@/components/site/mocks";
import { Ai, Check, Cta, PageHero, Section, TRIAL_HREF } from "@/components/site/parts";

export const metadata: Metadata = {
  title: { absolute: "RallyCap for Parents: Highlight Reels, Player Stats & Game Day Info" },
  description:
    "Turn your clips into highlight reels with a stadium announcer, track your player's stats season after season with AI, and know where to be and what to wear. Free with your team; Player stats is $10 a year.",
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
        lead="RallyCap is free for parents on your team. Your coach sends the link. You get your Saturday back. And if you want: your kid's stats and highlight reels, powered by AI."
      />

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
            <p className="mt-6 text-lg font-bold">Included with Player stats, $10 a year.</p>
            <div className="mt-6">
              <Cta href={`${TRIAL_HREF}?next=/profile`} variant="light">
                Get Player stats
              </Cta>
            </div>
            <p className="mt-6 text-sm text-white/60">
              Side effects: grandma watches it 40 times. Budget your data accordingly.
            </p>
          </div>
          <PineTarScreen />
        </div>
      </section>

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
              <Check>
                <b className="text-[#1B2A4A]">Pine Tar Productions included:</b> highlight reels
                with the announcer and slow-mo.
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
