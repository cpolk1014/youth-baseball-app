"use client";

import { useEffect, useState } from "react";
import { TEAM_PRICE_CENTS, dollars, seasonEnds, seasonFor } from "@/lib/billing/season";
import type { TeamClub } from "@/lib/data/club-backend";
import { clearPaidFlag } from "./paidFlag";

const field =
  "h-12 w-full min-w-0 rounded-xl border-2 border-slate-300 bg-white px-3 font-mono text-lg tracking-widest uppercase focus:border-[var(--team)] focus:outline-none";

/**
 * The team's club: which club it belongs to this season, or (for coaches) a box to enter the
 * club's code. Joining keeps all the team's data; the club can view (not change) lineups,
 * playing time, rules and imported stats.
 */
export function ClubSection({ teamId, canJoin }: { teamId: string; canJoin: boolean }) {
  const [club, setClub] = useState<TeamClub | null | "loading">("loading");
  const [passes, setPasses] = useState<{ season: string; expiresOn: string }[]>([]);
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);
  const [fromLink, setFromLink] = useState(false);
  const [look, setLook] = useState(0);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    import("@/lib/data/club-backend")
      .then((m) => Promise.all([m.teamClub(teamId), m.teamPasses(teamId).catch(() => [])]))
      .then(
        ([c, p]) => {
          if (!current) return;
          setClub(c);
          setPasses(p);
        },
        () => current && setClub(null),
      );
    return () => {
      current = false;
    };
  }, [teamId, look]);

  // A club's message link ("?code=…"): fill the code in.
  useEffect(() => {
    const linked = (new URLSearchParams(window.location.search).get("code") ?? "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 8);
    if (!linked) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the address
    setCode(linked);
    setFromLink(true);
  }, []);

  // Back from paying ("?paid=1"): the pass shows once Stripe confirms; look again a few times.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("paid") !== "1") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the address
    setPaid(true);
    clearPaidFlag();
    const timers = [3000, 8000, 15000].map((ms) => setTimeout(() => setLook((n) => n + 1), ms));
    timers.push(setTimeout(() => setPaid(false), 18000));
    return () => timers.forEach(clearTimeout);
  }, []);

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
  const today = new Date().toISOString().slice(0, 10);
  const active = club && club.expiresOn >= today;
  const pass = passes.find((p) => p.expiresOn >= today);
  if (!active && !canJoin && !pass) return null;
  const until = (iso: string) =>
    new Date(`${iso}T12:00`).toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

  const payForTeam = async () => {
    setPaying(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "team", teamId, season: seasonFor(new Date()) }),
      });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error ?? "Couldn't start the payment.");
      window.location.assign(json.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPaying(false);
    }
  };

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
          {fromLink && (
            <p className="mb-2 rounded-lg bg-amber-50 p-2 text-base text-amber-950">
              Your club&apos;s code is filled in. Check this is the right team (its name is at the
              top), then tap <b>Join</b>.
            </p>
          )}
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
      {!active && (
        <div className="mt-4 border-t-2 border-slate-100 pt-3">
          <h2 className="mb-1 text-sm font-bold tracking-wide text-slate-600 uppercase">Season</h2>
          {pass ? (
            <p className="text-base">
              ✓ Paid for {pass.season}, through <b>{until(pass.expiresOn)}</b>.
            </p>
          ) : paid ? (
            <p role="status" className="text-base font-semibold text-green-800">
              Payment received. It shows here in a few seconds.
            </p>
          ) : canJoin ? (
            <>
              <p className="mb-2 text-base text-slate-700">
                Not part of a club? Pay for this team&apos;s {seasonFor(new Date())} season:{" "}
                {dollars(TEAM_PRICE_CENTS)}, through {until(seasonEnds(seasonFor(new Date())))}.
              </p>
              <button
                onClick={() => void payForTeam()}
                disabled={paying}
                className="h-12 w-full rounded-xl border-2 border-[var(--team)] bg-white text-base font-bold text-[var(--team)] disabled:opacity-40"
              >
                {paying ? "Opening checkout…" : `Pay ${dollars(TEAM_PRICE_CENTS)} for the season`}
              </button>
            </>
          ) : null}
        </div>
      )}
    </section>
  );
}
