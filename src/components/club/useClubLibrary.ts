"use client";

import { useEffect, useState } from "react";
import type { ClubPlan, ClubPlaySet } from "@/lib/data/club-backend";
import { useStoreState } from "@/lib/data/store";

/**
 * The team's club library (practice plans, homework play sets). Empty when the team has no
 * club; the database only shows it while the team holds an active club code.
 */
export function useClubLibrary(clubId: string | null | undefined): {
  plans: ClubPlan[];
  sets: ClubPlaySet[];
} {
  const { mode, offline } = useStoreState();
  const [lib, setLib] = useState<{ plans: ClubPlan[]; sets: ClubPlaySet[] }>({
    plans: [],
    sets: [],
  });
  useEffect(() => {
    if (!clubId || mode !== "supabase" || offline) return;
    let current = true;
    void (async () => {
      const m = await import("@/lib/data/club-backend");
      const [plans, sets] = await Promise.all([m.clubPlans(clubId), m.clubPlaySets(clubId)]);
      if (current) setLib({ plans, sets });
    })().catch(() => undefined);
    return () => {
      current = false;
    };
  }, [clubId, mode, offline]);
  return lib;
}
