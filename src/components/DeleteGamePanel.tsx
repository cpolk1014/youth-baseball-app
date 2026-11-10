"use client";

import { useState, useSyncExternalStore } from "react";
import { postToGroupMe, useAppData } from "@/lib/data/store";
import { gamesOffMessage, offerGamePost } from "@/lib/data/gameDelete";
import type { Game } from "@/lib/data/types";
import { usePlan } from "./paywall";
import { toast } from "./shell/Toast";
import { useToday } from "./useToday";

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/**
 * The last step before games come off the schedule: what's about to happen, and, when a game
 * is coming up soon, an editable GroupMe post so the team hears about it. Needs a connection.
 */
export function DeleteGamePanel({
  games,
  tournamentName,
  action,
  children,
  onDelete,
  onDone,
  onCancel,
}: {
  games: Game[];
  tournamentName?: string;
  /** The verb on the buttons: "Delete" or "Remove". */
  action: string;
  /** What's about to happen, in words. */
  children: React.ReactNode;
  onDelete: () => Promise<void>;
  onDone: () => void;
  onCancel: () => void;
}) {
  const data = useAppData();
  const { paid } = usePlan();
  const today = useToday();
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine !== false,
    () => true,
  );
  const [text, setText] = useState(() => gamesOffMessage(games, tournamentName));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offer = !!data?.groupme && paid && offerGamePost(games, today);

  const go = async (post: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await onDelete();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete that. Try again.");
      setBusy(false);
      return;
    }
    if (post) {
      // The game is already gone, so a failed post is a note, not a reason to stop.
      await postToGroupMe(text).catch(() => {
        toast("Deleted, but the GroupMe post didn't go through.");
      });
    }
    onDone();
  };

  const keep = (
    <button
      type="button"
      onClick={onCancel}
      disabled={busy}
      className="h-14 w-full rounded-xl border-2 border-slate-400 bg-white text-lg font-bold disabled:opacity-40"
    >
      Keep it
    </button>
  );
  const remove = "bg-red-700 text-white active:bg-red-800";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 text-base leading-snug text-slate-800">{children}</div>
      {games.length > 1 && (
        <ul className="rounded-xl bg-slate-50 p-3 text-base">
          {games.map((g) => (
            <li key={g.id}>
              {g.date.slice(5).replace("-", "/")} vs {g.opponent}
            </li>
          ))}
        </ul>
      )}
      {offer && online && (
        <label className="flex flex-col gap-1">
          <span className="text-base font-semibold">Tell the team on GroupMe</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={Math.min(6, games.length + 2)}
            className="w-full rounded-xl border-2 border-slate-300 bg-white p-3 text-base leading-snug focus:border-[var(--team)] focus:outline-none"
          />
        </label>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-800">
          {error}
        </p>
      )}
      {!online ? (
        <>
          <p className="rounded-xl bg-amber-50 p-3 text-base font-semibold text-amber-950">
            This needs a connection. Try again when you have signal.
          </p>
          {keep}
        </>
      ) : offer ? (
        <>
          <button
            type="button"
            onClick={() => void go(true)}
            disabled={busy || !text.trim()}
            className={`h-14 rounded-xl text-lg font-bold disabled:opacity-40 ${remove}`}
          >
            {busy ? "Working…" : `${action} and post to GroupMe`}
          </button>
          <button
            type="button"
            onClick={() => void go(false)}
            disabled={busy}
            className="h-14 rounded-xl border-2 border-red-300 bg-white text-lg font-bold text-red-800 disabled:opacity-40"
          >
            {action}, don&apos;t post
          </button>
          {keep}
        </>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {keep}
          <button
            type="button"
            onClick={() => void go(false)}
            disabled={busy}
            className={`h-14 rounded-xl text-lg font-bold disabled:opacity-40 ${remove}`}
          >
            {busy ? "Working…" : action}
          </button>
        </div>
      )}
    </div>
  );
}
