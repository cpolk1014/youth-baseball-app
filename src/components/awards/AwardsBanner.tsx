"use client";

import Link from "next/link";
import { awardsToPick, pickText } from "@/lib/club/awards";
import { isCoach } from "@/lib/data/permissions";
import type { AppData } from "@/lib/data/types";

/** For coaches on phones (Games is their start page): club awards still to pick. */
export function AwardsBanner({ data }: { data: AppData }) {
  if (!isCoach(data.me.role)) return null;
  const toPick = awardsToPick(data.clubAwards);
  if (toPick.length === 0) return null;
  return (
    <Link
      href="/awards"
      className="mb-4 flex min-h-12 items-center justify-between gap-3 rounded-xl border-2 border-amber-500 bg-amber-50 px-4 py-2 text-base font-semibold text-amber-950"
    >
      <span>🏆 {pickText(toPick)}</span>
      <span className="shrink-0 font-bold underline">Pick</span>
    </Link>
  );
}
