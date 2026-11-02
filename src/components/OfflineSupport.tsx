"use client";

import { useEffect } from "react";
import { useAppData, useStoreState } from "@/lib/data/store";

const DAY = 24 * 60 * 60 * 1000;

/**
 * Registers the service worker (production only) and, when the team loads online, asks it
 * to save the pages a coach needs in the dugout: Games, each game in the next three weeks
 * (and its lineup card), and the main sections.
 */
export function OfflineSupport() {
  const data = useAppData();
  const { mode, offline } = useStoreState();

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  const games = data?.games;
  useEffect(() => {
    if (mode !== "supabase" || offline || !games || !("serviceWorker" in navigator)) return;
    const now = Date.now();
    const soon = games
      .filter((g) => {
        const t = new Date(`${g.date}T12:00`).getTime();
        return t > now - 2 * DAY && t < now + 21 * DAY;
      })
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 20);
    const paths = [
      "/games",
      ...soon.flatMap((g) => [`/games/${g.id}`, `/games/${g.id}/card`]),
      "/pa",
      "/roster",
      "/season",
      "/practices",
      "/plays",
    ];
    void navigator.serviceWorker.ready
      .then((reg) => reg.active?.postMessage({ type: "warm", paths }))
      .catch(() => undefined);
  }, [mode, offline, games]);

  return null;
}
