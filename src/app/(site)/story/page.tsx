import type { Metadata } from "next";
import { Cta, Section } from "@/components/site/parts";
import { SUPPORT_EMAIL } from "@/components/site/SiteFooter";

export const metadata: Metadata = {
  title: { absolute: "Our Story | RallyCap, AI-Powered Youth Baseball Built by a Coach" },
  description:
    "RallyCap was built by Craig, a 7U head coach and travel ball stepdad and uncle, who put AI to work on the busywork of running a youth baseball team.",
  alternates: { canonical: "/story" },
};

export default function StoryPage() {
  return (
    <>
      <section className="relative overflow-hidden bg-[#1B2A4A] px-4 pt-14 pb-16 text-white sm:px-6 md:pt-20 md:pb-20">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 -right-40 size-[34rem] rounded-full bg-[#DC143C]/25 blur-3xl"
        />
        <div className="relative mx-auto max-w-3xl">
          <p className="mb-3 text-sm font-bold tracking-[0.14em] text-[#FF6B85] uppercase">
            Our story
          </p>
          <h1 className="text-4xl leading-[1.05] font-black tracking-tight text-balance md:text-6xl">
            Built in the dugout. Powered by AI.
          </h1>
        </div>
      </section>

      <Section>
        <article className="mx-auto flex max-w-3xl flex-col gap-6 text-lg leading-relaxed text-slate-700 md:text-xl">
          <p className="text-2xl font-bold text-[#1B2A4A]">Hi, I&apos;m Craig.</p>
          <p>
            My stepson and my nephew started travel baseball at 7. They&apos;re 14 now. For seven
            years I&apos;ve been in the grind: weekend tournaments, long drives, early fields and
            late brackets. For four of those years I was the team&apos;s{" "}
            <b className="text-[#1B2A4A]">GameChanger guy</b>, scoring every pitch. And for the last
            three I&apos;ve been a <b className="text-[#1B2A4A]">head coach</b>, running a 7U team
            of my own.
          </p>
          <p className="border-l-4 border-[#DC143C] pl-5 text-2xl font-bold text-[#1B2A4A]">
            Here&apos;s what I learned: the hardest part of coaching travel ball usually isn&apos;t
            the baseball.
          </p>
          <p>
            It&apos;s typing in a schedule one game at a time. It&apos;s planning practice the night
            before. It&apos;s redoing the lineup at midnight so every kid gets fair innings, then
            explaining it in the parking lot. It&apos;s working out Saturday night&apos;s seeding
            with a pencil.
          </p>
          <p>
            That&apos;s exactly the kind of work AI is good at. So I built{" "}
            <b className="text-[#1B2A4A]">RallyCap</b> and put AI on the busywork:
          </p>
          <ul className="flex flex-col gap-3 pl-2">
            {[
              ["I snap the schedule", "instead of typing it."],
              [
                "I tell it what my team needs",
                "and get a practice plan for the whole season, made for 7-year-olds.",
              ],
              [
                "I screenshot the tournament",
                "and it reads the teams, the games and the tie-breakers.",
              ],
              ["Every kid gets a walk-up song", "with an announcer calling their name."],
            ].map(([b, rest]) => (
              <li key={b} className="flex gap-3">
                <span aria-hidden>✨</span>
                <span>
                  <b className="text-[#1B2A4A]">{b}</b> {rest}
                </span>
              </li>
            ))}
          </ul>
          <p>
            And for the things that have to be exactly right, like fair lineups, playing time and
            standings, RallyCap&apos;s smart engine follows your rules to the letter and shows its
            work.
          </p>
          <p>
            Youth baseball should be about the kids. AI gives me my time back to coach them. I hope
            it does the same for you.
          </p>
          <div className="mt-2 flex items-center gap-4">
            <span className="flex size-14 items-center justify-center rounded-full bg-[#1B2A4A] text-xl font-black text-white">
              C
            </span>
            <p className="text-base leading-snug">
              <b className="text-lg text-[#1B2A4A]">Craig</b>
              <br />
              Founder, RallyCap · 7U head coach
            </p>
          </div>
          <div className="mt-6">
            <Cta />
            <p className="mt-4 text-base text-slate-500">
              Questions or ideas? I read every email:{" "}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="font-semibold text-[#DC143C] underline underline-offset-2"
              >
                {SUPPORT_EMAIL}
              </a>
            </p>
          </div>
        </article>
      </Section>
    </>
  );
}
