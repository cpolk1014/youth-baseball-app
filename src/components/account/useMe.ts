"use client";

import { useEffect, useState } from "react";
import type { Me, MyTeamClub } from "@/lib/data/account-backend";
import { useAppData, useStoreState } from "@/lib/data/store";

// Who's signed in (name, email), fetched once per page load and refreshed after edits.
let cached: Promise<Me | null> | null = null;
const listeners = new Set<() => void>();

export function refreshMe(): void {
  cached = null;
  for (const l of listeners) l();
}

export function useMe(): Me | null {
  const { mode, email } = useStoreState();
  const data = useAppData();
  const [me, setMe] = useState<Me | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const l = () => setVersion((v) => v + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  useEffect(() => {
    if (mode !== "supabase") return;
    cached ??= import("@/lib/data/account-backend").then((m) => m.getMe()).catch(() => null);
    let current = true;
    void cached.then((m) => current && setMe(m));
    return () => {
      current = false;
    };
  }, [mode, version]);
  if (mode !== "supabase") return null;
  if (me) return me;
  // Until it loads: the email we already have, and my name on this team.
  const mine = data?.members.find((m) => m.userId === data.me.userId);
  return email ? { id: data?.me.userId ?? "", email, name: mine?.displayName ?? null } : null;
}

/** "CP" from "Craig Polk"; else from the email; "?" when there's nothing. */
export function initials(me: { name: string | null; email: string | null } | null): string {
  const name = me?.name?.trim();
  if (name) {
    const words = name.split(/\s+/);
    return (
      (words[0]?.[0] ?? "") + (words.length > 1 ? (words.at(-1)?.[0] ?? "") : "")
    ).toUpperCase();
  }
  return (me?.email?.[0] ?? "?").toUpperCase();
}

/** My teams that are in a club this season (for showing My Clubs). */
let teamClubs: Promise<MyTeamClub[]> | null = null;
export function useMyTeamClubs(): MyTeamClub[] | null {
  const { mode, offline } = useStoreState();
  const [list, setList] = useState<MyTeamClub[] | null>(null);
  useEffect(() => {
    if (mode !== "supabase" || offline) return;
    teamClubs ??= import("@/lib/data/account-backend")
      .then((m) => m.myTeamClubs())
      .catch(() => {
        teamClubs = null;
        return [];
      });
    let current = true;
    void teamClubs.then((c) => current && setList(c));
    return () => {
      current = false;
    };
  }, [mode, offline]);
  return list;
}
