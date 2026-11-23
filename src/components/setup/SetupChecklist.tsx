"use client";

import Link from "next/link";
import { useState } from "react";
import { setupProgress, type SetupStep } from "@/lib/setup/checklist";

const hiddenKey = (key: string) => `rallycap:setup-hidden:${key}`;

function readHidden(key: string): boolean {
  try {
    return window.localStorage.getItem(hiddenKey(key)) === "1";
  } catch {
    return false;
  }
}

/** Hidden on this device for this team or club ("Hide" on the checklist). */
export function useSetupHidden(key: string): [boolean, () => void] {
  const [hidden, setHidden] = useState(() => typeof window !== "undefined" && readHidden(key));
  const hide = () => {
    try {
      window.localStorage.setItem(hiddenKey(key), "1");
    } catch {
      // Storage unavailable: hidden until the page reloads.
    }
    setHidden(true);
  };
  return [hidden, hide];
}

/**
 * A getting-started checklist: each step ticks itself off once it's done, the next one to do
 * has the big button, and the card goes away when everything's done (or "Hide").
 */
export function SetupChecklist({
  title,
  intro,
  steps,
  hideKey,
  onStep,
}: {
  title: string;
  intro: string;
  steps: SetupStep[];
  /** What "Hide" remembers on this device: the team's or club's id. */
  hideKey: string;
  /** Instead of following the step's link (a tab on the same page). */
  onStep?: (step: SetupStep) => void;
}) {
  const [hidden, hide] = useSetupHidden(hideKey);
  const { done, total } = setupProgress(steps);
  if (hidden || done === total) return null;
  const next = steps.find((s) => !s.done);

  return (
    <section
      aria-label={title}
      className="mb-4 rounded-xl border-2 border-[var(--team)] bg-white p-4 md:col-span-2 xl:col-span-3"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-black">{title}</h2>
          <p className="mt-0.5 text-base text-slate-700">{intro}</p>
        </div>
        <button
          onClick={hide}
          className="h-10 shrink-0 rounded-lg px-2 text-sm font-semibold text-slate-600 underline"
        >
          Hide
        </button>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div
          className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-200"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          aria-label={`${done} of ${total} done`}
        >
          <div
            className="h-full rounded-full bg-[var(--team)] transition-[width]"
            style={{ width: `${(done / total) * 100}%` }}
          />
        </div>
        <span className="shrink-0 text-sm font-bold text-slate-700 tabular-nums">
          {done} of {total} done
        </span>
      </div>
      <ol className="mt-3 flex flex-col">
        {steps.map((s, i) => {
          const isNext = s === next;
          const action = isNext
            ? "h-11 rounded-lg bg-[var(--team)] px-4 text-base font-bold text-white"
            : "h-11 rounded-lg px-2 text-base font-semibold text-[var(--team)] underline";
          return (
            <li
              key={s.id}
              className="flex items-center gap-3 border-t border-slate-100 py-2.5 first:border-t-0"
            >
              <span
                aria-hidden="true"
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base font-black ${
                  s.done
                    ? "bg-green-700 text-white"
                    : isNext
                      ? "border-2 border-[var(--team)] text-[var(--team)]"
                      : "border-2 border-slate-300 text-slate-500"
                }`}
              >
                {s.done ? "✓" : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`block text-base font-bold ${s.done ? "text-slate-500" : "text-slate-900"}`}
                >
                  {s.title}
                  <span className="sr-only">{s.done ? " (done)" : ""}</span>
                </span>
                {!s.done && (
                  <span className="block text-sm leading-snug text-slate-600">{s.detail}</span>
                )}
              </span>
              {!s.done &&
                (onStep ? (
                  <button onClick={() => onStep(s)} className={`shrink-0 ${action}`}>
                    {s.action}
                  </button>
                ) : (
                  <Link href={s.href} className={`flex shrink-0 items-center ${action}`}>
                    {s.action}
                  </Link>
                ))}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** One line for screens other than Home: "Set up your team · 2 of 5 done ›". */
export function SetupStrip({
  steps,
  hideKey,
  href,
  label,
}: {
  steps: SetupStep[];
  hideKey: string;
  href: string;
  label: string;
}) {
  const [hidden] = useSetupHidden(hideKey);
  const { done, total } = setupProgress(steps);
  if (hidden || done === total) return null;
  return (
    <Link
      href={href}
      className="mb-3 flex min-h-12 items-center gap-3 rounded-xl border-2 border-[var(--team)] bg-white px-3 font-bold text-[var(--team)] md:hidden"
    >
      <span className="flex-1">
        {label} · {done} of {total} done
      </span>
      <span aria-hidden="true" className="text-2xl">
        ›
      </span>
    </Link>
  );
}
