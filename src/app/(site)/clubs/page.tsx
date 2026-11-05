import type { Metadata } from "next";
import { CLUB_HREF, Cta, PageHero, Section } from "@/components/site/parts";
import { ClubDashboardScreen } from "@/components/site/mocks";
import { SUPPORT_EMAIL } from "@/components/site/SiteFooter";

export const metadata: Metadata = {
  title: { absolute: "RallyCap for Clubs: An AI Assistant Coach for Every Team" },
  description:
    "Give every coach in your club AI schedule import, AI practice plans, fair lineups, GroupMe posts and tournaments, with a club dashboard, club colors and a shared library. $99 per team.",
  alternates: { canonical: "/clubs" },
};

const WHY: [string, string, string][] = [
  [
    "✨",
    "AI for every coach",
    "Schedule import, age-appropriate practice plans and the tournament reader, for your volunteer coaches who don't have time to type schedules or plan drills.",
  ],
  [
    "👀",
    "Every team at a glance",
    "Each team's record, next game and latest lineup. Teams that have gone quiet for two weeks get flagged, so you know before the parents call you.",
  ],
  [
    "🎨",
    "One club look",
    "Colors from your logo or flyer, and club uniforms every team can wear (AI reads the uniform flyer). No more twelve shades of red.",
  ],
  [
    "📚",
    "Share what works",
    "Your best practice plans and homework play sets, in a library every coach can use.",
  ],
  [
    "📣",
    "Reach everyone at once",
    "Post to your coaches' group, or to any or all of your teams' GroupMe groups, in one message. Rainout? Done in ten seconds.",
  ],
  [
    "🔒",
    "You see what you need. Families keep what's theirs.",
    "Club admins can view lineups, playing time, rules and team stats while a team holds your code, and never change them. Team money, parents and families' own stats stay private.",
  ],
];

export default function ClubsPage() {
  return (
    <>
      <PageHero
        eyebrow="For clubs"
        title="Give every coach in your club an AI assistant."
        lead="Your volunteer coaches have day jobs. Give them an assistant that doesn't. One code per team, the full Team plan with AI for every coach, and the whole club at a glance for you."
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Cta href={CLUB_HREF}>Start a club</Cta>
          <span className="text-white/75">Free to set up · Pay when your teams are ready</span>
        </div>
      </PageHero>

      <Section tone="mist" className="!pt-12">
        <ClubDashboardScreen />
      </Section>

      <Section>
        <h2 className="text-3xl font-black tracking-tight text-[#1B2A4A] md:text-4xl">
          Why clubs choose RallyCap
        </h2>
        <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {WHY.map(([icon, t, b]) => (
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

      <Section tone="navy">
        <h2 className="text-center text-3xl font-black tracking-tight md:text-5xl">How it works</h2>
        <ol className="mt-12 grid gap-6 md:grid-cols-3">
          {[
            ["Start your club", "Free, in two minutes."],
            ["Buy codes", "$99 per team, through July 31."],
            [
              "Send each coach their code",
              "Their team joins your club, AI and all, and keeps its own data.",
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
          <Cta href={CLUB_HREF}>Start a club</Cta>
          <p className="mt-4 text-white/75">
            Have 10 or more teams?{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="font-bold text-white underline underline-offset-2"
            >
              Contact us
            </a>
            .
          </p>
        </div>
      </Section>
    </>
  );
}
