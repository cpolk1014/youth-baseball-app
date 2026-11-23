"use client";

import { useState } from "react";
import type { Tournament } from "@/lib/data/tournament-backend";
import { shareUrl } from "@/lib/tournaments/shared";

const backend = () => import("@/lib/data/tournament-backend");

/**
 * Share the tournament with the other teams: a public, read-only link to the standings,
 * scores, bracket and "What time do we play tomorrow?". Coaches and managers turn it on and
 * off; once it's on, anyone on the team can pass the link along.
 */
export function ShareTournament({
  tournament: t,
  canEdit,
  onChanged,
}: {
  tournament: Tournament;
  canEdit: boolean;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  if (!t.shareToken && !canEdit) return null;
  const url = t.shareToken ? shareUrl(t.shareToken, window.location.origin) : null;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const send = async (link: string) => {
    setNote(null);
    const text = `Standings, scores and the bracket for ${t.name}, updated as games finish:`;
    try {
      if (navigator.share) {
        await navigator.share({ title: t.name, text, url: link });
        return;
      }
      await navigator.clipboard.writeText(link);
      setNote("Link copied. Paste it in the tournament's group chat or send it to other coaches.");
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      setError("Couldn't share. Press and hold the link to copy it.");
    }
  };

  return (
    <section className="rounded-xl border-2 border-slate-200 bg-white p-4 md:col-span-2">
      <h2 className="mb-1 text-sm font-bold tracking-wide text-slate-600 uppercase">
        Share with the other teams
      </h2>
      {url ? (
        <>
          <p className="text-base text-slate-700">
            Anyone with this link sees the standings, scores, bracket and “What time do we play
            tomorrow?” for their own team. Read only: only your team enters scores. No players or
            anything else of the team&apos;s.
          </p>
          <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-base font-semibold break-all select-all">
            {url}
          </p>
          <div className="mt-3 flex flex-col gap-2 md:flex-row">
            <button
              onClick={() => void send(url)}
              className="h-12 rounded-xl bg-[var(--team)] px-5 text-base font-bold text-white active:bg-[var(--team-press)]"
            >
              Share the link
            </button>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-12 items-center justify-center rounded-xl border-2 border-slate-300 bg-white px-5 text-base font-semibold"
            >
              See what they see ↗
            </a>
            {canEdit &&
              (stopping ? (
                <span className="flex flex-col gap-2 md:flex-row md:items-center">
                  <span className="text-base font-semibold">The link stops working. Sure?</span>
                  <button
                    onClick={() =>
                      void run(async () => {
                        await (await backend()).stopSharingTournament(t.id);
                        setStopping(false);
                      })
                    }
                    disabled={busy}
                    className="h-12 rounded-xl bg-red-700 px-5 text-base font-bold text-white disabled:opacity-40"
                  >
                    Stop sharing
                  </button>
                  <button
                    onClick={() => setStopping(false)}
                    className="h-12 rounded-xl border-2 border-slate-300 px-5 text-base font-semibold"
                  >
                    Keep it
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => setStopping(true)}
                  className="h-12 rounded-xl border-2 border-red-200 bg-white px-5 text-base font-semibold text-red-700"
                >
                  Stop sharing
                </button>
              ))}
          </div>
        </>
      ) : (
        <>
          <p className="text-base text-slate-700">
            Every team here wants to know who they play next. Share a read-only link to the
            standings, scores, bracket and “What time do we play tomorrow?”. Only tournament info:
            no players, nothing else of the team&apos;s. Turn it off any time.
          </p>
          <button
            onClick={() =>
              void run(async () => {
                await (await backend()).shareTournament(t.id);
                setNote("Link made. Tap “Share the link” to send it.");
              })
            }
            disabled={busy}
            className="mt-3 h-12 w-full rounded-xl bg-[var(--team)] px-5 text-base font-bold text-white active:bg-[var(--team-press)] disabled:opacity-40 md:w-auto"
          >
            {busy ? "Making the link…" : "Make a share link"}
          </button>
        </>
      )}
      {note && (
        <p role="status" className="mt-2 text-base font-semibold text-green-800">
          {note}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-base font-semibold text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
