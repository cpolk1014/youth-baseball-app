"use client";

// While the app loads a team (opening the app, or switching teams): the page blurs and the
// RallyCap cap shows with a bat taking swings, so it's clear something is happening.
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
        className="flex w-full max-w-xs flex-col items-center gap-4 rounded-3xl border-t-8 border-[var(--team-accent)] bg-white px-6 py-8 text-center shadow-2xl shadow-slate-900/20"
      >
        <div className="relative flex h-32 w-52 items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- a small static SVG */}
          <img src="/brand/rallycap-icon-color.svg" alt="" className="size-28" />
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="bat-loading absolute top-7 right-0 size-16 text-[var(--team)]"
            fill="currentColor"
          >
            <g transform="rotate(-45 12 12)">
              <circle cx="2.8" cy="12" r="2" />
              <path d="M4 10.9 L10.5 10.9 C13.5 9.6 16.5 9.3 19.5 9.3 A2.7 2.7 0 0 1 19.5 14.7 C16.5 14.7 13.5 14.4 10.5 13.1 L4 13.1 Z" />
            </g>
          </svg>
          <span
            aria-hidden="true"
            className="ball-hit absolute top-4 right-1 size-3 rounded-full border border-slate-300 bg-white"
          />
        </div>
        <p className="text-lg font-bold text-slate-900">{text}</p>
      </div>
    </div>
  );
}
