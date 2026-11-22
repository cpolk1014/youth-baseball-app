"use client";

// Keeps the Chatter and Coach Chatter badges current: on load, every minute while the app is
// on screen, and when someone comes back to it. Signed-in (Supabase) mode only.
import { useEffect } from "react";
import { setIconCount, setUnread, setUnreadRefresher } from "@/lib/chatter/unread";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { useAppData, useStoreState } from "@/lib/data/store";

const EVERY_MS = 60_000;

export function UnreadWatcher() {
  const data = useAppData();
  const { mode } = useStoreState();
  const teamId = data?.team.id ?? null;
  const signedIn = mode === "supabase" && !!data?.me.userId;

  useEffect(() => {
    if (!signedIn) {
      setUnread({ chatter: 0, parents: 0, coach: 0 });
      setIconCount(0);
      return;
    }
    let stopped = false;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      const [chatter, coaches] = await Promise.all([
        import("@/lib/data/chatter-backend"),
        import("@/lib/data/coach-chatter-backend"),
      ]);
      const [team, coach, total] = await Promise.all([
        teamId
          ? chatter.unreadCounts(teamId).catch(() => ({ team: 0, parents: 0 }))
          : Promise.resolve({ team: 0, parents: 0 }),
        coaches.myUnread().catch(() => 0),
        getBrowserSupabase()
          .rpc("my_unread_total")
          .then(({ data }) => (typeof data === "number" ? data : null)),
      ]);
      if (stopped) return;
      setUnread({ chatter: team.team, parents: team.parents, coach });
      if (total !== null) setIconCount(total);
    };
    const run = () => void load();
    setUnreadRefresher(run);
    run();
    const timer = window.setInterval(run, EVERY_MS);
    document.addEventListener("visibilitychange", run);
    return () => {
      stopped = true;
      setUnreadRefresher(null);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", run);
    };
  }, [signedIn, teamId]);

  return null;
}
