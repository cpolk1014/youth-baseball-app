"use client";

import { localDateString, placeLabel } from "@/lib/data/game";
import { useAppData } from "@/lib/data/store";
import { logoUrl } from "@/lib/branding/logo";
import { playsFor } from "@/lib/plays/library";
import { formatPracticeWhen } from "@/lib/practice/format";
import { practiceMonths, type PrintRange } from "@/lib/practice/print";
import { planMinutes } from "@/lib/practice/schedule";
import { useState } from "react";
import { BRAND_LOGO, loadPdfImage, teamColor } from "@/lib/print/phone";
import { PrintButton } from "./PrintButton";
import { AppShell, Loading } from "./AppShell";

// Letter paper with half-inch margins; the page flows onto as many sheets as it needs.
const PAGE_RULE = "@page { size: letter portrait; margin: 0.5in; }";

/**
 * The practice schedule on paper, for coaches and parents: upcoming or the whole season,
 * with each practice's drills and plays if wanted. Printed from the browser.
 */
export function PracticeScheduleScreen() {
  const data = useAppData();
  const [range, setRange] = useState<PrintRange>("upcoming");
  const [withPlans, setWithPlans] = useState(false);

  if (!data) {
    return (
      <AppShell title="Print schedule" backHref="/practices" tab="practice">
        <Loading />
      </AppShell>
    );
  }

  const today = localDateString(new Date());
  const months = practiceMonths(data.practices, range, today);
  const count = months.reduce((n, m) => n + m.practices.length, 0);
  const logo = logoUrl(data.team.logoPath);
  const printed = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <AppShell
      title="Print schedule"
      subtitle={`${data.team.name} · ${data.season.name}`}
      backHref="/practices"
      tab="practice"
    >
      <style>{PAGE_RULE}</style>

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center print:hidden">
        <div
          role="radiogroup"
          aria-label="Which practices"
          className="grid grid-cols-2 rounded-xl border-2 border-[var(--team)] p-1 md:w-80"
        >
          {(
            [
              ["upcoming", "Upcoming"],
              ["season", "Whole season"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              role="radio"
              aria-checked={range === value}
              onClick={() => setRange(value)}
              className={`h-11 rounded-lg text-base font-bold ${range === value ? "bg-[var(--team)] text-white" : "text-[var(--team)]"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="flex min-h-12 items-center gap-3 rounded-xl border-2 border-slate-300 bg-white px-3 text-base font-semibold">
          <input
            type="checkbox"
            checked={withPlans}
            onChange={(e) => setWithPlans(e.target.checked)}
            className="size-5 accent-[var(--team)]"
          />
          Include drills and plays
        </label>
        <div className="md:ml-auto">
          <PrintButton
            name={`${data.team.name} practice schedule`}
            disabled={count === 0}
            makePdf={async () => {
              const [{ practiceSchedulePdf }, teamLogo, rallyLogo] = await Promise.all([
                import("@/lib/print/practicePdf"),
                loadPdfImage(logo),
                loadPdfImage(BRAND_LOGO),
              ]);
              return practiceSchedulePdf(
                data.practices,
                { teamName: data.team.name, teamColor: teamColor(), teamLogo, rallyLogo, printed },
                { seasonName: data.season.name, range, today, withPlans },
              ).blob();
            }}
          />
        </div>
      </div>

      {/* The page: looks like paper on screen, prints as is. */}
      <article className="mx-auto w-full max-w-[8.5in] bg-white p-5 text-slate-900 shadow-lg ring-1 ring-slate-300 sm:p-10 print:max-w-none print:p-0 print:shadow-none print:ring-0">
        <header className="flex items-center gap-4 border-b-4 border-[var(--team)] pb-3">
          {logo && (
            // eslint-disable-next-line @next/next/no-img-element -- the team's logo, printed as is
            <img src={logo} alt="" className="size-14 shrink-0 rounded-lg object-contain" />
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl leading-tight font-black">{data.team.name}</h1>
            <p className="text-base text-slate-600">Practice schedule · {data.season.name}</p>
          </div>
          <p className="text-right text-sm text-slate-500">
            {range === "upcoming" ? "Upcoming" : "Whole season"}
            <br />
            Printed {printed}
          </p>
        </header>

        {count === 0 ? (
          <p className="mt-6 text-base text-slate-600">
            {range === "upcoming"
              ? "No upcoming practices. Try Whole season."
              : "No practices this season yet."}
          </p>
        ) : (
          months.map((m) => (
            <section key={m.label} className="mt-5">
              <h2 className="mb-1 text-sm font-bold tracking-wide text-[var(--team)] uppercase">
                {m.label}
              </h2>
              <table className="w-full border-collapse text-left text-sm">
                <thead className="border-b-2 border-slate-300 text-xs tracking-wide text-slate-500 uppercase">
                  <tr>
                    <th className="w-[22%] py-1 pr-2 font-bold">Date</th>
                    <th className="w-[18%] py-1 pr-2 font-bold">Time</th>
                    <th className="w-[30%] py-1 pr-2 font-bold">Where</th>
                    <th className="py-1 font-bold">Focus</th>
                  </tr>
                </thead>
                {m.practices.map((p) => {
                  const [day, time] = formatPracticeWhen(p).split(" · ");
                  const where = placeLabel(p);
                  const plays = playsFor(p.plays);
                  const plans = withPlans && !p.canceled && (p.plan.length > 0 || plays.length > 0);
                  return (
                    <tbody key={p.id} className="break-inside-avoid border-b border-slate-200">
                      <tr className={`align-top ${p.canceled ? "text-slate-400" : ""}`}>
                        <td
                          className={`py-1.5 pr-2 font-semibold ${p.canceled ? "line-through" : ""}`}
                        >
                          {day}
                        </td>
                        <td className={`py-1.5 pr-2 ${p.canceled ? "line-through" : ""}`}>
                          {time ?? "–"}
                        </td>
                        <td className={`py-1.5 pr-2 ${p.canceled ? "line-through" : ""}`}>
                          {where ?? "–"}
                          {!p.canceled && p.locationAddress && (
                            <span className="block text-xs text-slate-500">
                              {p.locationAddress}
                            </span>
                          )}
                        </td>
                        <td className="py-1.5">
                          {p.canceled ? <b className="text-red-700">Canceled</b> : (p.focus ?? "")}
                        </td>
                      </tr>
                      {plans && (
                        <tr>
                          <td colSpan={4} className="pb-2 pl-3 text-xs text-slate-700">
                            {p.plan.length > 0 && (
                              <ol className="list-decimal pl-4">
                                {p.plan.map((d) => (
                                  <li key={d.id}>
                                    <b>{d.title}</b> · {d.minutes} min
                                  </li>
                                ))}
                              </ol>
                            )}
                            {p.plan.length > 0 && (
                              <p className="mt-0.5 text-slate-500">
                                {planMinutes(p.plan)} minutes of drills
                              </p>
                            )}
                            {plays.length > 0 && (
                              <p className="mt-0.5">
                                <b>Plays to work on:</b> {plays.map((x) => x.name).join(", ")}
                              </p>
                            )}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  );
                })}
              </table>
            </section>
          ))
        )}

        <footer className="mt-8 flex items-center justify-between border-t border-slate-200 pt-3 text-xs text-slate-500">
          <span>
            {count} practice{count === 1 ? "" : "s"} · Check Fungo for changes.
          </span>
          {/* eslint-disable-next-line @next/next/no-img-element -- printed brand mark */}
          <img src="/brand/fungo-horizontal-color.svg" alt="Fungo" className="h-5" />
        </footer>
      </article>
    </AppShell>
  );
}
