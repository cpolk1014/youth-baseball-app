import type { Metadata } from "next";
import { Cta, Section } from "@/components/site/parts";
import { SUPPORT_EMAIL } from "@/components/site/SiteFooter";

export const metadata: Metadata = {
  title: { absolute: "Our Story | RallyCap, the AI Assistant Coach Built by a Coach" },
  description:
    "RallyCap was built by Craig, a software developer, 7U head coach and youth baseball stepdad and uncle, who put AI to work on the busywork of running a youth baseball team.",
  alternates: { canonical: "/story" },
};

const b = "text-[#1B2A4A]";

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
            A coach who writes code walks into a dugout.
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-white/85 md:text-xl">
            No punchline. Just an app.
          </p>
        </div>
      </section>

      <Section>
        <article className="mx-auto flex max-w-3xl flex-col gap-6 text-lg leading-relaxed text-slate-700 md:text-xl">
          <p className="text-2xl font-bold text-[#1B2A4A]">Hi, I&apos;m Craig.</p>
          <p>
            By day I&apos;m a <b className={b}>software developer</b>. Nights and weekends, I&apos;m
            a youth baseball guy. My stepson and my nephew started at 7. They&apos;re 14 now.
            That&apos;s seven years of 7&nbsp;a.m. games, gas station breakfasts and brackets that
            end after dark.
          </p>
          <p>
            For four of those years I was the team&apos;s <b className={b}>GameChanger guy</b>,
            scoring every pitch. (If you&apos;ve done it, you know. Nobody thanks the scorekeeper.)
            For the last three I&apos;ve been a <b className={b}>head coach</b>, running a 7U team
            of my own.
          </p>
          <p className="border-l-4 border-[#DC143C] pl-5 text-2xl font-bold text-[#1B2A4A]">
            Here&apos;s what I learned: the baseball is the easy part.
          </p>
          <p>
            The hard part is typing in a schedule one game at a time. Planning practice in the
            parking lot. Redoing the lineup at midnight so every kid gets fair innings, then
            explaining it to a dad who&apos;s been counting. Working out Saturday night&apos;s
            seeding on a napkin.
          </p>
          <p>
            Every developer has a moment where they look at something tedious and think,{" "}
            <i>a computer should be doing this.</i> Mine came somewhere around the fortieth
            &ldquo;what time do we play?&rdquo; text. So I built <b className={b}>RallyCap</b> and
            put AI on the busywork:
          </p>
          <ul className="flex flex-col gap-3 pl-2">
            {[
              ["I snap the schedule", "instead of typing it."],
              [
                "I tell it what my team needs",
                "and get a practice plan for the whole season, made for 7-year-olds (who mostly need to learn which way to run).",
              ],
              [
                "I screenshot the tournament",
                "and it reads the teams, the games and the tie-breakers.",
              ],
              [
                "Every kid gets a walk-up song",
                "with an announcer calling their name. The kids love it. The parents love it more.",
              ],
            ].map(([t, rest]) => (
              <li key={t} className="flex gap-3">
                <span aria-hidden>✨</span>
                <span>
                  <b className={b}>{t}</b> {rest}
                </span>
              </li>
            ))}
          </ul>
          <p>
            And because I write software for a living, I know where AI shouldn&apos;t guess. Fair
            lineups, playing time and standings run on RallyCap&apos;s own engine. It follows your
            rules to the letter, gives the same answer every time, and shows its work.
          </p>
          <p>
            Youth baseball should be about the kids. RallyCap gives me my time back to coach them. I
            hope it does the same for you.
          </p>
          <div className="mt-2 flex items-center gap-4">
            <span className="flex size-14 items-center justify-center rounded-full bg-[#1B2A4A] text-xl font-black text-white">
              C
            </span>
            <p className="text-base leading-snug">
              <b className="text-lg text-[#1B2A4A]">Craig</b>
              <br />
              Founder &amp; developer, RallyCap · 7U head coach
            </p>
          </div>
          <div className="mt-6">
            <Cta />
            <p className="mt-4 text-base text-slate-500">
              Questions, ideas, bugs? I read every email (and I fix the bugs myself):{" "}
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
