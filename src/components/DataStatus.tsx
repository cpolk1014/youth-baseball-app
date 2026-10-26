"use client";

import { useState, type ReactNode } from "react";
import { createTeam, dismissSaveError, reloadData, signOut, useStoreState } from "@/lib/data/store";

const AGE_GROUPS = ["7U", "8U", "9U", "10U", "11U", "12U", "13U", "14U"];

function defaultSeasonName(today: Date): string {
  const month = today.getMonth(); // 0 = Jan
  const term = month < 5 ? "Spring" : month < 8 ? "Summer" : "Fall";
  return `${term} ${today.getFullYear()}`;
}

/** Wraps screen content: first-time setup, load errors, and failed-save notices. */
export function DataStatus({ children }: { children: ReactNode }) {
  const { status, saveError } = useStoreState();

  if (status.kind === "setup") return <TeamSetup hasTeam={status.team !== null} />;
  if (status.kind === "error") {
    return (
      <div className="rounded-xl border-2 border-red-700 bg-red-50 p-4 text-red-950">
        <p className="text-lg font-bold">Couldn&apos;t load your team.</p>
        <p className="mt-1 text-base">{status.message}</p>
        <div className="mt-3 flex gap-2">
          <button
            onClick={reloadData}
            className="h-12 flex-1 rounded-xl bg-red-700 text-base font-bold text-white"
          >
            Try again
          </button>
          <button
            onClick={() => void signOut()}
            className="h-12 flex-1 rounded-xl border-2 border-red-700 text-base font-bold"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {saveError && (
        <div
          role="alert"
          className="mb-3 flex items-start gap-2 rounded-xl border-2 border-red-700 bg-red-50 p-3 text-base text-red-950"
        >
          <p className="flex-1 leading-snug font-semibold">{saveError}</p>
          <button
            onClick={dismissSaveError}
            className="h-10 shrink-0 rounded-lg px-3 font-bold underline"
          >
            OK
          </button>
        </div>
      )}
      {children}
    </>
  );
}

function TeamSetup({ hasTeam }: { hasTeam: boolean }) {
  const [teamName, setTeamName] = useState("");
  const [ageGroup, setAgeGroup] = useState("10U");
  const [coachPitch, setCoachPitch] = useState(false);
  const [seasonName, setSeasonName] = useState(() => defaultSeasonName(new Date()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = (hasTeam || teamName.trim() !== "") && seasonName.trim() !== "";
  const field =
    "h-12 w-full rounded-lg border-2 border-slate-400 bg-white px-3 text-lg focus:border-[#0b1f3a] focus:outline-none";

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid) return;
        setBusy(true);
        setError(null);
        try {
          await createTeam({
            teamName: teamName.trim(),
            ageGroup,
            coachPitch,
            seasonName: seasonName.trim(),
          });
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
          setBusy(false);
        }
      }}
      className="flex flex-col gap-4"
    >
      <div>
        <h2 className="text-2xl font-bold">{hasTeam ? "Start a season" : "Set up your team"}</h2>
        <p className="mt-1 text-base text-slate-700">
          {hasTeam
            ? "Your team doesn't have a season yet."
            : "Coaching a team? Create it here. You'll be its coach. Joining someone else's team? Ask the coach to add you."}
        </p>
      </div>

      {!hasTeam && (
        <div className="flex gap-3">
          <label className="flex flex-[2] flex-col gap-1">
            <span className="text-sm font-semibold text-slate-700">Team name</span>
            <input
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              maxLength={60}
              className={field}
            />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-sm font-semibold text-slate-700">Age</span>
            <select
              value={ageGroup}
              onChange={(e) => setAgeGroup(e.target.value)}
              className={field}
            >
              {AGE_GROUPS.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      {!hasTeam && (
        <label className="flex min-h-14 items-center gap-3 rounded-xl border-2 border-slate-300 bg-white px-4">
          <input
            type="checkbox"
            checked={coachPitch}
            onChange={(e) => setCoachPitch(e.target.checked)}
            className="size-6 accent-[#0b1f3a]"
          />
          <span>
            <span className="block text-lg font-semibold">Coach&apos;s pitch</span>
            <span className="block text-sm text-slate-600">
              A coach pitches. Games default to 10 fielders.
            </span>
          </span>
        </label>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-slate-700">Season</span>
        <input
          value={seasonName}
          onChange={(e) => setSeasonName(e.target.value)}
          maxLength={40}
          className={field}
        />
      </label>

      <button
        type="submit"
        disabled={!valid || busy}
        className="h-14 rounded-xl bg-[#0b1f3a] text-lg font-bold text-white disabled:opacity-40"
      >
        {busy ? "Creating…" : hasTeam ? "Start season" : "Create team"}
      </button>
      {error && <p className="text-base font-semibold text-red-700">{error}</p>}
      <button
        type="button"
        onClick={() => void signOut()}
        className="h-12 text-base font-semibold underline"
      >
        Sign out
      </button>
    </form>
  );
}
