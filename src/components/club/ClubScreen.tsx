"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ClubCode, ClubTeam } from "@/lib/data/club-backend";
import { formatClock } from "@/lib/data/game";
import { useStoreState } from "@/lib/data/store";
import { AppShell, Loading } from "../AppShell";
import { TeamBadge } from "../TeamBadge";
import { ClubGroupMeTab } from "./ClubGroupMeTab";
import { ClubLibraryTab } from "./ClubLibraryTab";
import { ClubLookTab } from "./ClubLookTab";
import { useMyClubs } from "./useMyClubs";

const DAY = 24 * 60 * 60 * 1000;

/** A club director's view of every team that joined this season (view only). */
export function ClubScreen() {
  const { mode } = useStoreState();
  const clubs = useMyClubs();
  const [clubId, setClubId] = useState<string | null>(null);
  const club = clubs?.find((c) => c.id === clubId) ?? clubs?.[0] ?? null;

  const shell = (children: React.ReactNode, subtitle?: string) => (
    <AppShell title={club?.name ?? "Club"} subtitle={subtitle} tab="club" bare>
      {children}
    </AppShell>
  );
  if (mode !== "supabase") return shell(<p className="text-lg">Clubs need sign-in.</p>);
  if (!clubs) return shell(<Loading />);
  if (!club) {
    return shell(
      <p className="text-lg">
        You&apos;re not a club admin. Clubs are set up with RallyCap; ask your club director.
      </p>,
    );
  }
  return shell(
    <>
      {clubs.length > 1 && (
        <div role="tablist" className="mb-4 flex flex-wrap gap-2">
          {clubs.map((c) => (
            <button
              key={c.id}
              role="tab"
              aria-selected={c.id === club.id}
              onClick={() => setClubId(c.id)}
              className={`h-11 rounded-xl px-4 text-base font-bold ${
                c.id === club.id
                  ? "bg-[var(--team)] text-white"
                  : "border-2 border-slate-300 bg-white"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      <ClubTabs key={club.id} clubId={club.id} />
    </>,
    "Club · view only",
  );
}

type Tab = "teams" | "look" | "library" | "groupme";
const TABS: [Tab, string][] = [
  ["teams", "Teams"],
  ["look", "Look"],
  ["library", "Library"],
  ["groupme", "GroupMe"],
];

function ClubTabs({ clubId }: { clubId: string }) {
  const [tab, setTab] = useState<Tab>("teams");
  return (
    <>
      <div
        role="tablist"
        className="mb-4 grid grid-cols-4 gap-1 rounded-xl border-2 border-[var(--team)] p-1"
      >
        {TABS.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`min-h-11 rounded-lg px-1 text-sm font-bold sm:text-base ${
              tab === id ? "bg-[var(--team)] text-white" : "text-[var(--team)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "teams" && <ClubDashboard clubId={clubId} />}
      {tab === "look" && <ClubLookTab clubId={clubId} />}
      {tab === "library" && <ClubLibraryTab clubId={clubId} />}
      {tab === "groupme" && <ClubGroupMeTab clubId={clubId} />}
    </>
  );
}

function ClubDashboard({ clubId }: { clubId: string }) {
  const [teams, setTeams] = useState<ClubTeam[] | null>(null);
  // When the dashboard loaded, for "last lineup N days ago".
  const [now, setNow] = useState(0);
  const [codes, setCodes] = useState<ClubCode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    void (async () => {
      try {
        const m = await import("@/lib/data/club-backend");
        const [t, c] = await Promise.all([m.clubOverview(clubId), m.clubCodes(clubId)]);
        if (!current) return;
        setTeams(t);
        setCodes(c);
        setNow(Date.now());
      } catch (e) {
        if (current) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      current = false;
    };
  }, [clubId]);

  if (error) {
    return (
      <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-800">
        Couldn&apos;t load the club ({error}).
      </p>
    );
  }
  if (!teams) return <Loading />;

  const season = codes[0]?.season ?? null;
  const thisSeason = codes.filter((c) => c.season === season);
  const unused = thisSeason.filter((c) => !c.teamName);
  const quiet = teams.filter((t) => isQuiet(t, now));

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
    } catch {
      setCopied(null);
    }
  };

  return (
    <>
      <div className="mb-4 grid grid-cols-3 gap-2">
        <Stat label={`Teams${season ? ` · ${season}` : ""}`} value={teams.length} />
        <Stat label="Codes unused" value={unused.length} />
        <Stat label="Quiet 2+ weeks" value={quiet.length} warn={quiet.length > 0} />
      </div>

      {teams.length === 0 ? (
        <p className="mb-4 rounded-xl border-2 border-dashed border-slate-300 bg-white p-4 text-base">
          No teams have joined yet. Give each head coach one code (below); they enter it on Coaches
          &amp; parents in their team.
        </p>
      ) : (
        <ul className="mb-6 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {teams.map((t) => (
            <li key={t.teamId}>
              <TeamCard team={t} now={now} />
            </li>
          ))}
        </ul>
      )}

      <details
        className="rounded-xl border-2 border-slate-200 bg-white p-3"
        open={teams.length === 0}
      >
        <summary className="flex min-h-11 cursor-pointer items-center text-lg font-bold">
          Team codes{season ? ` · ${season}` : ""} ({thisSeason.length - unused.length} of{" "}
          {thisSeason.length} used)
        </summary>
        <p className="mb-3 text-base text-slate-700">
          One code per team for the season. The head coach enters it on Coaches &amp; parents; the
          team keeps its data and you can view it here until June 30.
        </p>
        <ul className="flex flex-col gap-2">
          {thisSeason.map((c) => (
            <li
              key={c.code}
              className="flex min-h-12 items-center justify-between gap-3 rounded-lg bg-slate-50 px-3"
            >
              <span className="font-mono text-lg font-bold tracking-widest">{c.code}</span>
              {c.teamName ? (
                <span className="text-right text-sm text-slate-700">✓ {c.teamName}</span>
              ) : (
                <button
                  onClick={() => void copy(c.code)}
                  className="h-10 rounded-lg border-2 border-slate-300 bg-white px-3 text-sm font-bold active:bg-slate-100"
                >
                  {copied === c.code ? "Copied" : "Copy"}
                </button>
              )}
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div
      className={`flex flex-col items-center rounded-xl border-2 p-2 ${
        warn ? "border-amber-400 bg-amber-50" : "border-slate-200 bg-white"
      }`}
    >
      <span className="text-2xl font-black tabular-nums">{value}</span>
      <span className="text-center text-xs font-bold tracking-wide text-slate-600 uppercase">
        {label}
      </span>
    </div>
  );
}

const isQuiet = (t: ClubTeam, now: number) =>
  !t.lastLineupAt || now - new Date(t.lastLineupAt).getTime() > 14 * DAY;

function ago(iso: string | null, now: number): string {
  if (!iso) return "No lineups yet";
  const days = Math.floor((now - new Date(iso).getTime()) / DAY);
  return days <= 0
    ? "Lineup saved today"
    : days === 1
      ? "Lineup saved yesterday"
      : `Last lineup ${days} days ago`;
}

function TeamCard({ team: t, now }: { team: ClubTeam; now: number }) {
  const quiet = isQuiet(t, now);
  const record = `${t.wins}-${t.losses}${t.ties ? `-${t.ties}` : ""}`;
  return (
    <Link
      href={`/club/teams/${t.teamId}`}
      className="flex h-full flex-col gap-2 rounded-xl border-2 border-slate-200 bg-white p-3 active:bg-slate-50"
    >
      <span className="flex items-center gap-3">
        <TeamBadge name={t.name} colors={t.colors} logoPath={t.logoPath} size={44} />
        <span className="min-w-0">
          <span className="block truncate text-lg font-bold">{t.name}</span>
          <span className="block text-sm text-slate-600">
            {t.ageGroup} · {t.headCoach ?? "Coach not named"}
          </span>
        </span>
      </span>
      <span className="grid grid-cols-2 gap-1 text-base">
        <span>
          <b>{t.players}</b> players
        </span>
        <span>
          Record <b>{record}</b>
        </span>
      </span>
      <span className="text-base text-slate-800">
        {t.nextGame
          ? `Next: ${new Date(`${t.nextGame.date}T12:00`).toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}${t.nextGame.time ? ` ${formatClock(t.nextGame.time)}` : ""}${
              t.nextGame.opponent ? ` vs ${t.nextGame.opponent}` : ""
            }`
          : "No games scheduled"}
      </span>
      <span className={`text-sm font-semibold ${quiet ? "text-amber-800" : "text-slate-600"}`}>
        {quiet ? "⚠ " : ""}
        {ago(t.lastLineupAt, now)}
      </span>
    </Link>
  );
}
