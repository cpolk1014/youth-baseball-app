"use client";

// While the app loads a team (opening the app, or switching teams): the page blurs and the
// Fungo mark shows with its baseball spinning, so it's clear something is happening. A load that
// runs long also gets a short tip, each one on screen long enough to read.
import { useEffect, useState, type CSSProperties } from "react";
import {
  BRAND_CRIMSON,
  BRAND_NAVY,
  MARK_BALL,
  MARK_F_PATH,
  MARK_SEAM_PATH,
  MARK_TRANSFORM,
} from "@/lib/branding/brand-mark";
import { themeVars } from "@/lib/branding/theme";
import { useAppData, useStoreState } from "@/lib/data/store";
import { TIP_DELAY_MS, TIP_EVERY_MS, tipAt, tipsFor } from "@/lib/loading/tips";

export function LoadingCurtain({ brand = false }: { brand?: boolean }) {
  const { status, mode, switchingTo } = useStoreState();
  const data = useAppData();
  if (mode !== "supabase" || status.kind !== "loading") return null;
  const text = switchingTo
    ? `Switching to ${[switchingTo.ageGroup, switchingTo.name].filter(Boolean).join(" ")}…`
    : brand
      ? "Loading…"
      : "Loading your team…";
  // Tips for my role on the team being loaded, when we know it.
  const role = switchingTo
    ? data?.myTeams.find((t) => t.name === switchingTo.name && t.ageGroup === switchingTo.ageGroup)
        ?.role
    : data?.me.role;
  // Switching: the card wears the new team's colors (the page behind still shows the old).
  return <Curtain text={text} colors={switchingTo?.colors} role={role} />;
}

/** The blurred page and the card (shown by LoadingCurtain while a team loads). */
export function Curtain({
  text,
  colors,
  role,
}: {
  text: string;
  colors?: string[];
  role?: string | null;
}) {
  const look = colors ? (themeVars(colors) as CSSProperties) : undefined;
  const tip = useSlowTip(role);
  return (
    <div
      role="status"
      aria-live="polite"
      className="curtain-in fixed inset-0 z-[70] flex items-center justify-center bg-white/45 p-6 backdrop-blur-md print:hidden"
    >
      <div
        style={look}
        className="flex w-full max-w-xs flex-col items-center gap-3 rounded-3xl border-t-8 border-[var(--team-accent)] bg-white px-6 pt-8 pb-6 text-center shadow-2xl shadow-slate-900/20"
      >
        <SpinningMark className="-my-2 size-36 motion-reduce:hidden" />
        {/* eslint-disable-next-line @next/next/no-img-element -- a small static SVG */}
        <img
          src="/brand/fungo-icon-color.svg"
          alt=""
          className="-my-2 hidden size-36 motion-reduce:block"
        />
        <p className="text-lg font-bold text-slate-900">{text}</p>
        {/* Room for a tip is kept from the start, so the card doesn't jump when one shows. */}
        <p
          aria-live="off"
          className={`min-h-[3.75rem] text-base text-slate-600 transition-opacity duration-500 ${
            tip ? "opacity-100" : "opacity-0"
          }`}
        >
          {tip && (
            <>
              <span className="font-bold text-[var(--team)]">Tip: </span>
              {tip}
            </>
          )}
        </p>
      </div>
    </div>
  );
}

/** Nothing for a quick load; after TIP_DELAY_MS a tip, then a new one every TIP_EVERY_MS. */
function useSlowTip(role: string | null | undefined): string | null {
  const [tip, setTip] = useState<string | null>(null);
  useEffect(() => {
    const tips = tipsFor(role);
    const start = Math.floor(Math.random() * tips.length);
    let n = 0;
    let every: number | undefined;
    const first = window.setTimeout(() => {
      setTip(tipAt(tips, start, n));
      every = window.setInterval(() => setTip(tipAt(tips, start, ++n)), TIP_EVERY_MS);
    }, TIP_DELAY_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
    };
  }, [role]);
  return tip;
}

/**
 * The Fungo mark with its baseball spinning: two seams (the logo's, and the same turned halfway
 * round, like a real ball) turn around the ball's center, clipped to the ball and kept left of
 * the F's stem, under the F. (With reduced motion the card shows the plain mark instead.)
 */
export function SpinningMark({ className = "" }: { className?: string }) {
  const { cx, cy, r } = MARK_BALL;
  return (
    <svg viewBox="0 0 320 320" aria-hidden="true" className={className}>
      <defs>
        <clipPath id="fungo-ball">
          <circle cx={cx} cy={cy} r={r} />
        </clipPath>
        {/* Everything left of the F's stem: the white of the ball. */}
        <clipPath id="fungo-ball-face">
          <path d="M 400 0 L 905 0 L 905 230 L 860 257 L 816 328 L 742 456 L 700 482 L 400 700 Z" />
        </clipPath>
      </defs>
      <g transform={MARK_TRANSFORM}>
        <g clipPath="url(#fungo-ball)">
          <g clipPath="url(#fungo-ball-face)">
            <g className="seam-spin">
              <path fill={BRAND_CRIMSON} fillRule="evenodd" d={MARK_SEAM_PATH} />
              <path
                fill={BRAND_CRIMSON}
                fillRule="evenodd"
                d={MARK_SEAM_PATH}
                transform={`rotate(180 ${cx} ${cy})`}
              />
            </g>
          </g>
        </g>
        <path fill={BRAND_NAVY} fillRule="evenodd" d={MARK_F_PATH} />
      </g>
    </svg>
  );
}
