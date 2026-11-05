"use client";

import { useCallback, useEffect, useState } from "react";
import { MAX_KIDS, statsPriceCents } from "@/lib/billing/family";
import { dollars } from "@/lib/billing/season";
import { useStoreState } from "@/lib/data/store";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { useCheckoutReturn } from "../useCheckoutReturn";

export interface StatsPass {
  passId: string;
  kids: number;
  createdAt: string;
  expiresOn: string;
  athletes: string[];
}

export const longDate = (d: string) =>
  new Date(`${d.slice(0, 10)}T12:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

/** The signed-in parent's player stats passes, and whether one covers a kid. */
export function useStatsPasses() {
  const { mode } = useStoreState();
  const signedIn = mode === "supabase";
  const [passes, setPasses] = useState<StatsPass[] | null>(signedIn ? null : []);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!signedIn) return;
    let current = true;
    void getBrowserSupabase()
      .rpc("my_family_access")
      .then(({ data }) => {
        if (!current) return;
        setPasses(
          (
            (data ?? []) as {
              pass_id: string;
              kids: number;
              created_at: string;
              expires_on: string;
              athletes: string[] | null;
            }[]
          ).map((r) => ({
            passId: r.pass_id,
            kids: r.kids,
            createdAt: r.created_at,
            expiresOn: r.expires_on,
            athletes: r.athletes ?? [],
          })),
        );
      });
    return () => {
      current = false;
    };
  }, [signedIn, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  /** Local mode (no sign-in) is a demo: everything's open. */
  const covers = (athleteId: string | null) =>
    !signedIn || (!!athleteId && (passes ?? []).some((p) => p.athletes.includes(athleteId)));
  /** The latest date a kid's stats are unlocked through. */
  const expiresFor = (athleteId: string | null) =>
    (passes ?? [])
      .filter((p) => athleteId && p.athletes.includes(athleteId))
      .map((p) => p.expiresOn)
      .sort()
      .at(-1) ?? null;

  return { passes, loading: signedIn && passes === null, covers, expiresFor, reload };
}

export interface MyKid {
  athleteId: string;
  name: string;
  teams: string[];
}

/** The parent's kids (one entry per kid, with the teams they've played for). */
export function useMyKids(): MyKid[] | null {
  const { mode } = useStoreState();
  const [kids, setKids] = useState<MyKid[] | null>(mode === "supabase" ? null : []);
  useEffect(() => {
    if (mode !== "supabase") return;
    let current = true;
    void getBrowserSupabase()
      .rpc("my_athletes")
      .then(({ data }) => {
        if (!current) return;
        const by = new Map<string, MyKid>();
        for (const r of (data ?? []) as {
          athlete_id: string;
          name: string;
          team_name: string | null;
        }[]) {
          const k = by.get(r.athlete_id) ?? { athleteId: r.athlete_id, name: r.name, teams: [] };
          if (r.team_name && !k.teams.includes(r.team_name)) k.teams.push(r.team_name);
          by.set(r.athlete_id, k);
        }
        setKids([...by.values()]);
      });
    return () => {
      current = false;
    };
  }, [mode]);
  return kids;
}

function oneYear(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * My profile: buy player stats (box score imports and trends) for a number of
 * kids, $10 for the first and $5 each after, for a year from today.
 */
export function BuyPlayerStats({
  kids,
  stats,
}: {
  kids: MyKid[];
  stats: ReturnType<typeof useStatsPasses>;
}) {
  const open = kids.filter((k) => !stats.covers(k.athleteId));
  const [count, setCount] = useState(() => Math.max(1, open.length));
  const [picked, setPicked] = useState<string[]>(() =>
    open.slice(0, Math.max(1, open.length)).map((k) => k.athleteId),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Back from Stripe without paying: the button works again.
  useCheckoutReturn(() => setBusy(false));

  const setTo = (n: number) => {
    const next = Math.min(MAX_KIDS, Math.max(1, n));
    setCount(next);
    // Fewer spots than kids picked: drop the last ones picked. More: pick the next kids.
    if (picked.length > next) setPicked(picked.slice(0, next));
    else if (picked.length < next) {
      const more = open.filter((k) => !picked.includes(k.athleteId)).map((k) => k.athleteId);
      setPicked([...picked, ...more].slice(0, next));
    }
  };
  const toggle = (id: string) => {
    if (picked.includes(id)) setPicked(picked.filter((x) => x !== id));
    else if (picked.length < count) setPicked([...picked, id]);
  };

  const buy = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "family", kids: count, athletes: picked }),
      });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error ?? "Couldn't start the payment.");
      window.location.assign(json.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const covered = kids.filter((k) => stats.covers(k.athleteId));
  const spare = count - picked.length;
  const step =
    "flex size-14 shrink-0 items-center justify-center rounded-xl border-2 border-slate-300 bg-white text-3xl font-bold active:bg-slate-100 disabled:opacity-30";

  return (
    <div className="flex flex-col gap-4">
      <p className="text-base text-slate-700">
        Import each game&apos;s GameChanger box score and watch your player&apos;s AVG, OBP, OPS and
        pitching add up, with charts of how they trend. Stays with your player on every team. Lasts
        a year from the day you buy.
      </p>
      {covered.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-xl bg-green-50 p-3 text-base text-green-950">
          {covered.map((k) => (
            <li key={k.athleteId}>
              ✓ {k.name}: unlocked through {longDate(stats.expiresFor(k.athleteId)!)}
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={() => setTo(count - 1)}
          disabled={count <= 1}
          aria-label="One fewer player"
          className={step}
        >
          −
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="text-3xl font-black tabular-nums" aria-live="polite">
            {count}
          </p>
          <p className="text-sm text-slate-600">player{count === 1 ? "" : "s"}</p>
        </div>
        <button
          onClick={() => setTo(count + 1)}
          disabled={count >= MAX_KIDS}
          aria-label="One more player"
          className={step}
        >
          +
        </button>
      </div>

      {open.length > 1 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-base font-semibold">Which players</legend>
          {open.map((k) => {
            const on = picked.includes(k.athleteId);
            return (
              <label
                key={k.athleteId}
                className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-2 bg-white px-3 py-2 ${on ? "border-[var(--team)]" : "border-slate-200"}`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  disabled={!on && picked.length >= count}
                  onChange={() => toggle(k.athleteId)}
                  className="size-5 shrink-0 accent-[var(--team)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-semibold">{k.name}</span>
                  {k.teams.length > 0 && (
                    <span className="block text-sm text-slate-600">{k.teams.join(", ")}</span>
                  )}
                </span>
              </label>
            );
          })}
        </fieldset>
      )}
      {open.length === 1 && picked.length === 1 && (
        <p className="text-base">
          For <b>{open[0]!.name}</b>
          {open[0]!.teams.length ? ` (${open[0]!.teams.join(", ")})` : ""}.
        </p>
      )}
      {spare > 0 && (
        <p className="text-sm text-slate-600">
          {spare} spot{spare === 1 ? "" : "s"} for a player you link later (a brother or sister,
          say).
        </p>
      )}

      <div className="rounded-xl bg-slate-50 p-3">
        <p className="flex items-baseline justify-between gap-2 text-base">
          <span>
            {dollars(1000)} for the first player
            {count > 1 ? ` + ${count - 1} × ${dollars(500)}` : ""}
          </span>
          <span className="text-2xl font-black tabular-nums">
            {dollars(statsPriceCents(count))}
          </span>
        </p>
        <p className="text-sm text-slate-600">For one year, through {longDate(oneYear())}.</p>
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-900">
          {error}
        </p>
      )}
      <button
        onClick={() => void buy()}
        disabled={busy}
        className="h-14 rounded-xl bg-[var(--team)] text-lg font-bold text-white active:bg-[var(--team-press)] disabled:opacity-50"
      >
        {busy ? "Opening checkout…" : `Buy for ${dollars(statsPriceCents(count))}`}
      </button>
      <p className="text-sm text-slate-600">
        Just for you. Another parent who wants the stats gets their own. Payment is by Stripe;
        RallyCap never sees your card.
      </p>
    </div>
  );
}

export interface Purchase {
  id: string;
  boughtAt: string;
  kind: string;
  what: string;
  amountCents: number;
  expiresOn: string | null;
}

/** Everything this person has bought (player stats, teams, clubs), with when each ends. */
export function usePurchases(version: number): Purchase[] | null {
  const { mode } = useStoreState();
  const [rows, setRows] = useState<Purchase[] | null>(mode === "supabase" ? null : []);
  useEffect(() => {
    if (mode !== "supabase") return;
    let current = true;
    void getBrowserSupabase()
      .rpc("my_purchases")
      .then(({ data }) => {
        if (!current) return;
        setRows(
          (
            (data ?? []) as {
              id: string;
              bought_at: string;
              kind: string;
              what: string;
              amount_cents: number;
              expires_on: string | null;
            }[]
          ).map((r) => ({
            id: r.id,
            boughtAt: r.bought_at,
            kind: r.kind,
            what: r.what,
            amountCents: r.amount_cents,
            expiresOn: r.expires_on,
          })),
        );
      });
    return () => {
      current = false;
    };
  }, [mode, version]);
  return rows;
}

export function PurchasesTable({ rows }: { rows: Purchase[] }) {
  const today = new Date().toISOString().slice(0, 10);
  if (rows.length === 0) return <p className="text-base text-slate-700">Nothing yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-base">
        <thead>
          <tr className="border-b-2 border-slate-200 text-sm text-slate-600">
            <th className="py-1 pr-3">Bought</th>
            <th className="py-1 pr-3">What</th>
            <th className="py-1 pr-3 text-right">Paid</th>
            <th className="py-1">Expires</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const ended = r.expiresOn !== null && r.expiresOn < today;
            return (
              <tr key={r.id} className="border-b border-slate-100 align-top">
                <td className="py-2 pr-3 whitespace-nowrap">{longDate(r.boughtAt)}</td>
                <td className="py-2 pr-3">{r.what}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{dollars(r.amountCents)}</td>
                <td className={`py-2 whitespace-nowrap ${ended ? "text-slate-500" : ""}`}>
                  {r.expiresOn ? longDate(r.expiresOn) : "–"}
                  {ended ? " (ended)" : ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
