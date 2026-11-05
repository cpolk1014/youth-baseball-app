"use client";

import { useCallback, useEffect, useState } from "react";
import { dollars } from "@/lib/billing/season";
import { FAMILY_OPTIONS, type FamilyOption, type FamilyScope } from "@/lib/billing/family";
import { useStoreState } from "@/lib/data/store";
import type { Player } from "@/lib/rules/types";
import { getBrowserSupabase } from "@/lib/supabase/client";

export interface FamilyPassRow {
  passId: string;
  plan: string;
  scope: FamilyScope;
  seasonLabel: string;
  expiresOn: string;
  isBuyer: boolean;
  athletes: string[];
  codes: { code: string; used: boolean }[];
}

/** The signed-in parent's stats passes, and whether one covers a kid. */
export function useFamilyPasses() {
  const { mode } = useStoreState();
  const signedIn = mode === "supabase";
  const [passes, setPasses] = useState<FamilyPassRow[] | null>(signedIn ? null : []);
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
              plan: string;
              scope: FamilyScope;
              season_label: string;
              expires_on: string;
              is_buyer: boolean;
              athletes: string[] | null;
              codes: { code: string; used: boolean }[] | null;
            }[]
          ).map((r) => ({
            passId: r.pass_id,
            plan: r.plan,
            scope: r.scope,
            seasonLabel: r.season_label,
            expiresOn: r.expires_on,
            isBuyer: r.is_buyer,
            athletes: r.athletes ?? [],
            codes: r.codes ?? [],
          })),
        );
      });
    return () => {
      current = false;
    };
  }, [signedIn, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const redeem = useCallback(async (code: string) => {
    const { error } = await getBrowserSupabase().rpc("redeem_family_code", { p_code: code });
    if (error) throw new Error(error.message);
    setVersion((v) => v + 1);
  }, []);

  /** Local mode (no sign-in) is a demo: everything's open. */
  const covers = (athleteId: string | null) =>
    !signedIn || (!!athleteId && (passes ?? []).some((p) => p.athletes.includes(athleteId)));

  return { passes, loading: signedIn && passes === null, covers, reload, redeem };
}

/** Pick a plan and go to Stripe Checkout. */
export function UpgradeOptions({ kids, kid }: { kids: Player[]; kid: Player }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const first = kid.name.split(" ")[0];

  const buy = async (o: FamilyOption) => {
    setBusy(`${o.scope}-${o.plan}`);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "family", plan: o.plan, scope: o.scope, playerId: kid.id }),
      });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error ?? "Couldn't start the payment.");
      window.location.assign(json.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  };

  const group = (scope: FamilyScope, title: string, note: string) => (
    <section>
      <h3 className="text-sm font-bold tracking-wide text-slate-600 uppercase">{title}</h3>
      <p className="mb-2 text-sm text-slate-600">{note}</p>
      <ul className="flex flex-col gap-2">
        {FAMILY_OPTIONS.filter((o) => o.scope === scope).map((o) => (
          <li key={o.plan}>
            <button
              onClick={() => void buy(o)}
              disabled={busy !== null}
              className="flex min-h-16 w-full items-center gap-3 rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-left active:bg-slate-50 disabled:opacity-50"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-bold">{o.label}</span>
                <span className="block text-sm text-slate-600">{o.detail}</span>
              </span>
              <span className="shrink-0 text-xl font-black tabular-nums">
                {busy === `${o.scope}-${o.plan}` ? "…" : dollars(o.cents)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <div className="flex flex-col gap-5">
      <p className="text-base text-slate-700">
        For this season (through July 31). The stats stay with {first} from team to team, and every
        season you add keeps adding up.
      </p>
      {group("one", `Just ${first}`, `Box scores and stats for ${kid.name.replace(/\.$/, "")}.`)}
      {group(
        "multi",
        "All my players",
        kids.length > 1
          ? `Every player you're a parent of: ${kids.map((k) => k.name.split(" ")[0]).join(", ")}, and any you add later.`
          : "Every player you're a parent of, now and later (brothers and sisters too).",
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-900">
          {error}
        </p>
      )}
      <p className="text-sm text-slate-600">Payment is by Stripe. RallyCap never sees your card.</p>
    </div>
  );
}

/** Got a code from the parent who paid? */
export function RedeemCode({ redeem }: { redeem: (code: string) => Promise<void> }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!code.trim()) return;
        setBusy(true);
        setError(null);
        redeem(code)
          .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
          .finally(() => setBusy(false));
      }}
      className="flex flex-col gap-2"
    >
      <label className="text-base font-semibold" htmlFor="family-code">
        Have a code from your family?
      </label>
      <div className="flex gap-2">
        <input
          id="family-code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={8}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder="ABCD2345"
          className="h-12 min-w-0 flex-1 rounded-xl border-2 border-slate-300 bg-white px-3 font-mono text-lg tracking-widest uppercase focus:border-[var(--team)] focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || code.trim().length < 8}
          className="h-12 shrink-0 rounded-xl bg-slate-800 px-4 text-base font-bold text-white disabled:opacity-40"
        >
          {busy ? "…" : "Use it"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-base font-semibold text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}

/** For the parent who paid: the codes to share with the other adults. */
export function ShareCodes({ pass }: { pass: FamilyPassRow }) {
  const [copied, setCopied] = useState<string | null>(null);
  if (!pass.isBuyer || pass.codes.length === 0) return null;
  const share = async (code: string) => {
    const text = `Join me on RallyCap to see our player's stats: sign in at rallycap.team, open My player, and enter this code: ${code}`;
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(code);
        setCopied(code);
      }
    } catch {
      // Closed the share sheet.
    }
  };
  return (
    <section className="mb-4 rounded-xl border-2 border-slate-200 bg-white p-3">
      <h2 className="mb-1 text-sm font-bold tracking-wide text-slate-600 uppercase">
        Share your stats pass
      </h2>
      <p className="mb-2 text-sm text-slate-600">
        Each code lets one other adult in your family see the same players&apos; stats this season.
        They need their own RallyCap sign-in.
      </p>
      <ul className="flex flex-col gap-2">
        {pass.codes.map((c) => (
          <li key={c.code} className="flex items-center gap-3">
            <span
              className={`font-mono text-lg font-bold tracking-widest ${c.used ? "text-slate-400 line-through" : ""}`}
            >
              {c.code}
            </span>
            {c.used ? (
              <span className="text-sm text-slate-600">Used</span>
            ) : (
              <button
                onClick={() => void share(c.code)}
                className="h-10 rounded-lg border-2 border-slate-300 px-3 text-sm font-bold"
              >
                {copied === c.code ? "Copied" : "Share"}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
