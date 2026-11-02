"use client";

import { useEffect, useState } from "react";
import type { MyClub } from "@/lib/data/club-backend";
import { useStoreState } from "@/lib/data/store";

// Clubs the signed-in user runs, fetched once per page load (they rarely change).
let cached: Promise<MyClub[]> | null = null;

export function useMyClubs(): MyClub[] | null {
  const { mode, offline } = useStoreState();
  const [clubs, setClubs] = useState<MyClub[] | null>(null);
  useEffect(() => {
    if (mode !== "supabase" || offline) return;
    cached ??= import("@/lib/data/club-backend")
      .then((m) => m.myClubs())
      .catch(() => {
        cached = null;
        return [];
      });
    let current = true;
    void cached.then((c) => current && setClubs(c));
    return () => {
      current = false;
    };
  }, [mode, offline]);
  return clubs;
}
