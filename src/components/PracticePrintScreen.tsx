"use client";

import { placeLabel } from "@/lib/data/game";
import { useAppData } from "@/lib/data/store";
import { logoUrl } from "@/lib/branding/logo";
import { playsFor } from "@/lib/plays/library";
import { ACTOR_NAMES, type Actor } from "@/lib/plays/types";
import { formatPracticeWhen } from "@/lib/practice/format";
import { drillTimes } from "@/lib/practice/print";
import { planMinutes } from "@/lib/practice/schedule";
import { useState } from "react";
import { BRAND_LOGO, loadPdfImage, teamColor } from "@/lib/print/phone";
import { PrintButton } from "./PrintButton";
import { AppShell, Loading } from "./AppShell";

// Letter paper with half-inch margins; long plans flow onto more sheets.
const PAGE_RULE = "@page { size: letter portrait; margin: 0.5in; }";

/**
 * One practice on paper, for the coach's clipboard: every drill in order with its clock
 * time, minutes and full how-to, the plays to walk through (each position's job), and notes.
 */
export function PracticePrintScreen({ practiceId }: { practiceId: string }) {
  const data = useAppData();
  const [withPlays, setWithPlays] = useState(true);
  const back = `/practices/${practiceId}`;

  if (!data) {
    return (
      <AppShell title="Print practice" backHref={back} tab="practice">
        <Loading />
      </AppShell>
    );
  }
  const practice = data.practices.find((p) => p.id === practiceId);
  if (!practice) {
    return (
      <AppShell title="Practice not found" backHref="/practices" tab="practice">
        <p className="text-lg">This practice doesn&apos;t exist anymore.</p>
      </AppShell>
    );
  }

  const logo = logoUrl(data.team.logoPath);
  const where = placeLabel(practice);
  const times = drillTimes(practice.startTime, practice.plan);
  const plays = playsFor(practice.plays);
  const total = planMinutes(practice.plan);

  return (
    <AppShell
      title="Print practice"
      subtitle={formatPracticeWhen(practice)}
      backHref={back}
      tab="practice"
    >
      <style>{PAGE_RULE}</style>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center print:hidden">
        {plays.length > 0 && (
          <label className="flex min-h-12 items-center gap-3 rounded-xl border-2 border-slate-300 bg-white px-3 text-base font-semibold">
            <input
              type="checkbox"
              checked={withPlays}
              onChange={(e) => setWithPlays(e.target.checked)}
              className="size-5 accent-[var(--team)]"
            />
            Include each position&apos;s job in the plays
          </label>
        )}
        <div className="sm:ml-auto">
          <PrintButton
            name={`${data.team.name} practice ${practice.date}`}
            makePdf={async () => {
              const [{ practicePlanPdf }, teamLogo, rallyLogo] = await Promise.all([
                import("@/lib/print/practicePdf"),
                loadPdfImage(logo),
                loadPdfImage(BRAND_LOGO),
              ]);
              return practicePlanPdf(
                practice,
                {
                  teamName: data.team.name,
                  teamColor: teamColor(),
                  teamLogo,
                  rallyLogo,
                  printed: new Date().toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  }),
                },
                withPlays,
              ).blob();
            }}
          />
        </div>
      </div>

      <article className="mx-auto w-full max-w-[8.5in] bg-white p-5 text-slate-900 shadow-lg ring-1 ring-slate-300 sm:p-10 print:max-w-none print:p-0 print:shadow-none print:ring-0">
        <header className="flex items-center gap-4 border-b-4 border-[var(--team)] pb-3">
          {logo && (
            // eslint-disable-next-line @next/next/no-img-element -- the team's logo, printed as is
            <img src={logo} alt="" className="size-14 shrink-0 rounded-lg object-contain" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold tracking-wide text-slate-500 uppercase">
              {data.team.name} · Practice
            </p>
            <h1 className="text-2xl leading-tight font-black">{formatPracticeWhen(practice)}</h1>
            {where && (
              <p className="text-base text-slate-700">
                {where}
                {practice.locationAddress ? ` · ${practice.locationAddress}` : ""}
              </p>
            )}
          </div>
        </header>

        {practice.canceled && (
          <p className="mt-4 rounded-lg border-2 border-red-700 p-3 text-lg font-black text-red-700">
            Canceled
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-x-8 gap-y-1 text-base">
          <p>
            <b>Focus:</b> {practice.focus ?? "Not set"}
          </p>
          {total > 0 && (
            <p>
              <b>Drills:</b> {practice.plan.length} · {total} min
            </p>
          )}
        </div>

        <h2 className="mt-5 mb-2 text-sm font-bold tracking-wide text-[var(--team)] uppercase">
          Practice plan
        </h2>
        {practice.plan.length === 0 ? (
          <p className="text-base text-slate-600">No drills yet.</p>
        ) : (
          <ol className="flex flex-col">
            {practice.plan.map((d, i) => (
              <li
                key={d.id}
                className="flex break-inside-avoid gap-3 border-t border-slate-200 py-3 first:border-t-0"
              >
                {/* A box to tick off on the clipboard. */}
                <span
                  aria-hidden="true"
                  className="mt-1 size-5 shrink-0 rounded border-2 border-slate-400"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="text-lg leading-snug font-bold">
                      {i + 1}. {d.title}
                    </p>
                    <p className="text-base font-semibold whitespace-nowrap text-slate-700 tabular-nums">
                      {times ? `${times[i]!.from}–${times[i]!.to} · ` : ""}
                      {d.minutes} min
                    </p>
                  </div>
                  {d.notes && (
                    <p className="mt-1 text-base leading-relaxed whitespace-pre-line text-slate-800">
                      {d.notes}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}

        {plays.length > 0 && (
          <section className="mt-5">
            <h2 className="mb-2 text-sm font-bold tracking-wide text-[var(--team)] uppercase">
              Plays to walk through
            </h2>
            <ul className="flex flex-col gap-3">
              {plays.map((p) => (
                <li key={p.id} className="break-inside-avoid">
                  <p className="text-base font-bold">
                    {p.name} <span className="font-normal text-slate-600">· {p.situation}</span>
                  </p>
                  {withPlays && (
                    <ul className="mt-1 grid gap-x-6 text-sm text-slate-800 sm:grid-cols-2 print:grid-cols-2">
                      {(Object.keys(ACTOR_NAMES) as Actor[])
                        .filter((a) => p.jobs[a])
                        .map((a) => (
                          <li key={a}>
                            <b>{ACTOR_NAMES[a]}:</b> {p.jobs[a]}
                          </li>
                        ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {practice.notes && (
          <section className="mt-5 break-inside-avoid">
            <h2 className="mb-1 text-sm font-bold tracking-wide text-[var(--team)] uppercase">
              Notes
            </h2>
            <p className="text-base whitespace-pre-line">{practice.notes}</p>
          </section>
        )}

        <footer className="mt-8 flex items-center justify-between border-t border-slate-200 pt-3 text-xs text-slate-500">
          <span>
            Printed {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
          {/* eslint-disable-next-line @next/next/no-img-element -- printed brand mark */}
          <img src="/brand/fungo-horizontal-color.svg" alt="Fungo" className="h-5" />
        </footer>
      </article>
    </AppShell>
  );
}
