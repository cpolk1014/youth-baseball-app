"use client";

import { useState } from "react";
import { useCheckoutReturn } from "../useCheckoutReturn";
import {
  CLUB_PRICE_CENTS,
  MAX_CLUB_TEAMS,
  dollars,
  seasonEnds,
  seasonsOnSale,
} from "@/lib/billing/season";

const field =
  "h-12 w-full rounded-xl border-2 border-slate-300 bg-white px-3 text-lg focus:border-[var(--team)] focus:outline-none";
const endDate = (season: string) =>
  new Date(`${seasonEnds(season)}T12:00`).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

/**
 * Pay for a season of team codes ($99 each), for this club or (without clubId) a new club.
 * Opens Stripe's checkout page; the codes appear here once Stripe confirms the payment.
 */
export function BuyCodes({ clubId, onCancel }: { clubId?: string; onCancel?: () => void }) {
  const seasons = seasonsOnSale(new Date());
  const [season, setSeason] = useState(seasons[0]!);
  const [teams, setTeams] = useState(clubId ? 1 : 10);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Back from Stripe without paying: the button works again.
  useCheckoutReturn(() => setBusy(false));
  const valid = teams >= 1 && teams <= MAX_CLUB_TEAMS && (clubId || name.trim().length > 0);

  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "club", clubId, clubName: name.trim(), teams, season }),
      });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error ?? "Couldn't start the payment.");
      window.location.assign(json.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {!clubId && (
        <label className="flex flex-col gap-1">
          <span className="text-base font-semibold">Club name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="Traction Canes"
            className={field}
          />
        </label>
      )}
      <div className="flex flex-col gap-1">
        <span className="text-base font-semibold">Teams</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setTeams(Math.max(1, teams - 1))}
            aria-label="Fewer teams"
            className="size-14 rounded-xl border-2 border-slate-400 bg-white text-2xl font-bold active:bg-slate-100"
          >
            −
          </button>
          <input
            inputMode="numeric"
            value={teams}
            onChange={(e) =>
              setTeams(Math.min(MAX_CLUB_TEAMS, Number(e.target.value.replace(/\D/g, "")) || 0))
            }
            aria-label="Number of teams"
            className="h-14 w-24 rounded-xl border-2 border-slate-300 text-center text-2xl font-black"
          />
          <button
            type="button"
            onClick={() => setTeams(Math.min(MAX_CLUB_TEAMS, teams + 1))}
            aria-label="More teams"
            className="size-14 rounded-xl border-2 border-slate-400 bg-white text-2xl font-bold active:bg-slate-100"
          >
            +
          </button>
        </div>
      </div>
      {seasons.length > 1 && (
        <label className="flex flex-col gap-1">
          <span className="text-base font-semibold">Season</span>
          <select value={season} onChange={(e) => setSeason(e.target.value)} className={field}>
            {seasons.map((s) => (
              <option key={s} value={s}>
                {s} (through {endDate(s)})
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="rounded-xl bg-slate-100 p-3 text-base">
        <p className="text-2xl font-black">{dollars(CLUB_PRICE_CENTS * teams)}</p>
        <p>
          {teams} team{teams === 1 ? "" : "s"} × {dollars(CLUB_PRICE_CENTS)} for the {season}{" "}
          season, through {endDate(season)}. One code per team.
        </p>
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-800">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        {onCancel && (
          <button
            onClick={onCancel}
            className="h-14 flex-1 rounded-xl border-2 border-slate-400 text-lg font-bold active:bg-slate-100"
          >
            Cancel
          </button>
        )}
        <button
          onClick={() => void pay()}
          disabled={!valid || busy}
          className="h-14 flex-[2] rounded-xl bg-[var(--team)] text-lg font-bold text-white disabled:opacity-40"
        >
          {busy ? "Opening checkout…" : `Pay ${dollars(CLUB_PRICE_CENTS * teams)}`}
        </button>
      </div>
      <p className="text-sm text-slate-600">
        Payment is handled by Stripe. RallyCap never sees your card.
      </p>
    </div>
  );
}
