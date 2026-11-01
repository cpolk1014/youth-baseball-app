"use client";

import { useCallback, useEffect, useState } from "react";
import { saveGameDay } from "@/lib/data/store";
import type { GameDaySettings, Team } from "@/lib/data/types";
import { GroupMePost } from "./GroupMePost";

const heading = "mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase";
const select =
  "h-12 w-full rounded-xl border-2 border-slate-300 bg-white px-3 text-lg focus:border-[var(--team)] focus:outline-none";

const DEFAULTS: GameDaySettings = {
  timezone: "America/Chicago",
  arriveMinutes: 60,
  postMode: "off",
  postHours: 3,
  postDays: 1,
  postTime: "18:00",
};

/** The "when" choices, as one list: off, hours before, or a day and time. */
const WHEN: { id: string; label: string; set: Partial<GameDaySettings> }[] = [
  { id: "off", label: "Don't post automatically", set: { postMode: "off" } },
  ...[2, 3, 4, 6].map((h) => ({
    id: `h${h}`,
    label: `${h} hours before the first game`,
    set: { postMode: "hours" as const, postHours: h },
  })),
  { id: "d0", label: "Morning of game day", set: { postMode: "days", postDays: 0 } },
  { id: "d1", label: "The day before", set: { postMode: "days", postDays: 1 } },
  { id: "d2", label: "2 days before", set: { postMode: "days", postDays: 2 } },
];

const whenId = (g: GameDaySettings) =>
  g.postMode === "off" ? "off" : g.postMode === "hours" ? `h${g.postHours}` : `d${g.postDays}`;

interface Preview {
  gameDate: string;
  sendAt: string | null;
  message: string | null;
  sentAt: string | null;
}

/**
 * Game day posts: "Game against The Cubs / Chabills Field / 7:00 PM / Arrive by 6:00 PM /
 * White combo", posted to GroupMe automatically on the coach's schedule, with a preview and
 * Post now.
 */
export function GameDayPosts({ team }: { team: Team }) {
  const saved = team.gameDay ?? DEFAULTS;
  const [g, setG] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null | "loading">("loading");
  const [posting, setPosting] = useState(false);
  const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const changed = JSON.stringify(g) !== JSON.stringify(saved);

  const load = useCallback(async () => {
    try {
      const { nextGameDayPost } = await import("@/lib/data/supabase-backend");
      setPreview(await nextGameDayPost(team.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPreview(null);
    }
  }, [team.id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading from the server
    void load();
  }, [load]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      // Post times follow this device's time zone the first time posts are turned on.
      const timezone = saved.postMode === "off" && g.postMode !== "off" ? device : g.timezone;
      await saveGameDay({ ...g, timezone });
      setG({ ...g, timezone });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const when = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: saved.timezone,
    });

  return (
    <section className="mb-6 flex flex-col gap-4">
      <h2 className={heading}>Game day posts</h2>
      <p className="-mt-2 text-base text-slate-700">
        Where, when, arrival and uniform for each game day, posted to the group for you. Two games
        on one day go in one post.
      </p>

      <label className="flex flex-col gap-1">
        <span className="text-base font-semibold">Post automatically</span>
        <select
          value={whenId(g)}
          onChange={(e) => setG({ ...g, ...WHEN.find((w) => w.id === e.target.value)!.set })}
          className={select}
        >
          {WHEN.map((w) => (
            <option key={w.id} value={w.id}>
              {w.label}
            </option>
          ))}
        </select>
      </label>
      {g.postMode === "days" && (
        <label className="flex flex-col gap-1">
          <span className="text-base font-semibold">At</span>
          <input
            type="time"
            value={g.postTime}
            onChange={(e) => e.target.value && setG({ ...g, postTime: e.target.value })}
            className={select}
          />
        </label>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-base font-semibold">Arrive by</span>
        <select
          value={g.arriveMinutes ?? ""}
          onChange={(e) =>
            setG({ ...g, arriveMinutes: e.target.value === "" ? null : Number(e.target.value) })
          }
          className={select}
        >
          <option value="">Don&apos;t say</option>
          {[30, 45, 60, 75, 90, 120].map((m) => (
            <option key={m} value={m}>
              {m < 60 ? `${m} minutes` : m === 60 ? "1 hour" : `${m / 60} hours`.replace(".5", "½")}{" "}
              before the first game
            </option>
          ))}
        </select>
        <span className="text-sm text-slate-600">
          A game can have its own arrival time (Edit game).
        </span>
      </label>

      {g.postMode !== "off" && saved.timezone !== device && !changed && (
        <p className="text-sm text-slate-700">
          Post times use {saved.timezone.replace(/_/g, " ")}.{" "}
          <button
            onClick={() => setG({ ...g, timezone: device })}
            className="font-semibold underline"
          >
            Use {device.replace(/_/g, " ")}
          </button>
        </p>
      )}

      {changed && (
        <button
          onClick={() => void save()}
          disabled={busy}
          className="h-14 rounded-xl bg-[var(--team)] text-lg font-bold text-white disabled:opacity-40"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-800">
          {error}
        </p>
      )}

      <div className="rounded-xl border-2 border-slate-200 bg-white p-3">
        <h3 className="mb-1 text-base font-bold">Next game day</h3>
        {preview === "loading" ? (
          <p className="text-base text-slate-600">Loading…</p>
        ) : !preview || !preview.message ? (
          <p className="text-base text-slate-700">No upcoming games.</p>
        ) : (
          <>
            <pre className="mb-2 rounded-lg bg-slate-100 p-3 font-sans text-base whitespace-pre-wrap">
              {preview.message}
            </pre>
            <p className="mb-3 text-sm text-slate-700">
              {preview.sentAt
                ? `Posted ${when(preview.sentAt)}.`
                : preview.sendAt
                  ? `Posts automatically ${when(preview.sendAt)}${
                      new Date(preview.sendAt) < new Date() ? " (in the next few minutes)" : ""
                    }.`
                  : "Automatic posts are off."}{" "}
              It updates if the game, arrival or uniform changes before then.
            </p>
            {posting ? (
              <GroupMePost
                initialText={preview.message}
                rows={6}
                onSent={() => {
                  void (async () => {
                    const { markGameDayPosted } = await import("@/lib/data/supabase-backend");
                    await markGameDayPosted(team.id, preview.gameDate).catch(() => undefined);
                    await load();
                  })();
                }}
              />
            ) : (
              !preview.sentAt && (
                <button
                  onClick={() => setPosting(true)}
                  className="h-12 w-full rounded-xl border-2 border-[#00aff0] text-base font-bold text-[#0077a8] active:bg-sky-50"
                >
                  Post now instead
                </button>
              )
            )}
          </>
        )}
      </div>
      <p className="text-sm text-slate-600">
        Automatic posts go out within about 10 minutes of the time shown.
      </p>
    </section>
  );
}
