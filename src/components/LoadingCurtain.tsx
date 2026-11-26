"use client";

// While the app loads a team (opening the app, or switching teams): the page blurs and the
// Fungo mark shows with a fungo bat taking swings beside it, so it's clear something is happening.
import type { CSSProperties } from "react";
import { themeVars } from "@/lib/branding/theme";
import { useStoreState } from "@/lib/data/store";

export function LoadingCurtain({ brand = false }: { brand?: boolean }) {
  const { status, mode, switchingTo } = useStoreState();
  if (mode !== "supabase" || status.kind !== "loading") return null;
  const text = switchingTo
    ? `Switching to ${[switchingTo.ageGroup, switchingTo.name].filter(Boolean).join(" ")}…`
    : brand
      ? "Loading…"
      : "Loading your team…";
  // Switching: the card wears the new team's colors (the page behind still shows the old).
  return <Curtain text={text} colors={switchingTo?.colors} />;
}

/** The blurred page and the card (shown by LoadingCurtain while a team loads). */
export function Curtain({ text, colors }: { text: string; colors?: string[] }) {
  const look = colors ? (themeVars(colors) as CSSProperties) : undefined;
  return (
    <div
      role="status"
      aria-live="polite"
      className="curtain-in fixed inset-0 z-[70] flex items-center justify-center bg-white/45 p-6 backdrop-blur-md print:hidden"
    >
      <div
        style={look}
        className="flex w-full max-w-xs flex-col items-center gap-3 rounded-3xl border-t-8 border-[var(--team-accent)] bg-white px-6 py-8 text-center shadow-2xl shadow-slate-900/20"
      >
        {/* The Fungo mark, centered, and under it a little fungo scene on its own ground line:
            the ball is tossed up, drops back into the zone, and gets hit to the upper right. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- a small static SVG */}
        <img src="/brand/fungo-icon-color.svg" alt="" className="-mb-2 size-24" />
        <div className="relative h-24 w-48">
          <span aria-hidden="true" className="absolute right-6 bottom-1 left-6 h-px bg-slate-200" />
          {/* Drawn lying flat, knob at the left; it turns around the knob (the hands). */}
          <svg
            viewBox="0 0 88 12"
            aria-hidden="true"
            className="bat-loading absolute top-[74px] left-[62px] h-[9px] w-[66px] text-[var(--team)]"
            fill="currentColor"
          >
            <circle cx="3" cy="6" r="2.6" />
            <path d="M4.5 4.95 L38 4.95 C54 4.95 61 3.75 70 3.75 L84.2 3.75 A2.25 2.25 0 0 1 84.2 8.25 L70 8.25 C61 8.25 54 7.05 38 7.05 L4.5 7.05 Z" />
          </svg>
          <span
            aria-hidden="true"
            className="ball-hit absolute top-[73px] left-[113px] size-2.5 rounded-full border-2 border-[var(--team-accent)] bg-white"
          />
        </div>
        <p className="text-lg font-bold text-slate-900">{text}</p>
      </div>
    </div>
  );
}
