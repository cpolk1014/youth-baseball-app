"use client";

import { useEffect, useState } from "react";
import type { TeamClub } from "@/lib/data/club-backend";

const field =
  "h-12 w-full min-w-0 rounded-xl border-2 border-slate-300 bg-white px-3 font-mono text-lg tracking-widest uppercase focus:border-[var(--team)] focus:outline-none";

/**
 * The team's club: which club it belongs to this season, or (for coaches) a box to enter the
 * club's code. Joining keeps all the team's data; the club can view (not change) lineups,
 * playing time, rules and imported stats.
 */
export function ClubSection({ teamId, canJoin }: { teamId: string; canJoin: boolean }) {
  const [club, setClub] = useState<TeamClub | null | "loading">("loading");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    import("@/lib/data/club-backend")
      .then((m) => m.teamClub(teamId))
      .then(
        (c) => current && setClub(c),
        () => current && setClub(null),
      );
    return () => {
      current = false;
    };
  }, [teamId]);

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      const m = await import("@/lib/data/club-backend");
      await m.redeemClubCode(teamId, code);
      setClub(await m.teamClub(teamId));
      setCode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (club === "loading") return null;
  const active = club && club.expiresOn >= new Date().toISOString().slice(0, 10);
  if (!active && !canJoin) return null;

  return (
    <section className="mb-6 rounded-xl border-2 border-slate-200 bg-white p-4">
      <h2 className="mb-1 text-sm font-bold tracking-wide text-slate-600 uppercase">Club</h2>
      {active ? (
        <p className="text-base">
          Part of <b>{club.club}</b> for {club.season}. The club can view this team&apos;s lineups,
          playing time, rules and GameChanger stats. It can&apos;t change anything, and it never
          sees team money, parents or families&apos; own stats.
        </p>
      ) : (
        <>
          <p className="mb-3 text-base text-slate-700">
            Got a code from your club? Enter it to join the club for the season. The team keeps all
            its data. The club can view lineups, playing time, rules and GameChanger stats, and
            can&apos;t change anything.
          </p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (code.trim()) void join();
            }}
          >
            <input
              value={code}
              onChange={(e) =>
                setCode(
                  e.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, "")
                    .slice(0, 8),
                )
              }
              placeholder="CLUB CODE"
              aria-label="Club code"
              autoCapitalize="characters"
              autoComplete="off"
              className={field}
            />
            <button
              type="submit"
              disabled={code.length < 8 || busy}
              className="h-12 shrink-0 rounded-xl bg-[var(--team)] px-5 text-lg font-bold text-white disabled:opacity-40"
            >
              {busy ? "Joining…" : "Join"}
            </button>
          </form>
          {error && (
            <p role="alert" className="mt-2 text-base font-semibold text-red-700">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}
