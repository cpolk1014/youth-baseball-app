"use client";

import { signOut, useStoreState } from "@/lib/data/store";
import { REAL_CLUB_HREF } from "@/lib/demo/guest";

/** On every page for a guest in the demo club: what this is, and the way to the real thing. */
export function DemoBanner() {
  const { guest } = useStoreState();
  if (!guest) return null;
  return (
    <div
      role="note"
      className="mb-4 flex flex-col gap-2 rounded-xl border-2 border-[#1B2A4A] bg-[#1B2A4A] p-3 text-white sm:flex-row sm:items-center print:hidden"
    >
      <p className="flex-1 text-base leading-snug">
        <b>Demo club.</b> You&apos;re the director and every team&apos;s coach. Everything here is
        made up and goes away in two days. AI and payments are off.
      </p>
      <button
        onClick={() => void signOut(REAL_CLUB_HREF)}
        className="h-11 shrink-0 rounded-lg bg-[#DC143C] px-4 text-base font-bold text-white active:bg-[#B5102F]"
      >
        Start my real club
      </button>
    </div>
  );
}
