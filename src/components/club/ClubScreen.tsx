"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ClubCode, ClubTeam } from "@/lib/data/club-backend";
import { CLUB_PRICE_CENTS, dollars } from "@/lib/billing/season";
import { codeMessage } from "@/lib/club";
import { formatClock } from "@/lib/data/game";
import { useStoreState } from "@/lib/data/store";
import { AppShell, Loading } from "../AppShell";
import { Sheet } from "../Sheet";
import { TeamBadge } from "../TeamBadge";
import { ClubGroupMeTab } from "./ClubGroupMeTab";
import { ClubLibraryTab } from "./ClubLibraryTab";
import { ClubLookTab } from "./ClubLookTab";
import { BuyCodes } from "./BuyCodes";
import { forgetMyClubs, useMyClubs } from "./useMyClubs";

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
    return shell(<StartClub />);
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
      <ClubTabs key={club.id} clubId={club.id} clubName={club.name} />
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

function ClubTabs({ clubId, clubName }: { clubId: string; clubName: string }) {
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
      {tab === "teams" && <ClubDashboard clubId={clubId} clubName={clubName} />}
      {tab === "look" && <ClubLookTab clubId={clubId} />}
      {tab === "library" && <ClubLibraryTab clubId={clubId} />}
      {tab === "groupme" && <ClubGroupMeTab clubId={clubId} />}
    </>
  );
}

/** Just back from Stripe: "?paid=1" in the address. */
function usePaid(): boolean {
  const [paid, setPaid] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the address
    setPaid(new URLSearchParams(window.location.search).get("paid") === "1");
  }, []);
  return paid;
}

/** Not a club admin: start a club by paying for its teams. */
function StartClub() {
  const paid = usePaid();
  const [waited, setWaited] = useState(0);

  // Back from paying: the club appears once Stripe confirms (usually seconds).
  useEffect(() => {
    if (!paid || waited >= 10) return;
    const t = setTimeout(async () => {
      const m = await import("@/lib/data/club-backend");
      const clubs = await m.myClubs().catch(() => []);
      if (clubs.length) {
        forgetMyClubs();
        window.location.replace("/club");
      } else setWaited((n) => n + 1);
    }, 3000);
    return () => clearTimeout(t);
  }, [paid, waited]);

  if (paid) {
    return (
      <p role="status" className="rounded-xl border-2 border-green-700 bg-green-50 p-4 text-lg">
        {waited < 10
          ? "Payment received. Setting up your club…"
          : "Payment received. Your club is taking longer than usual to appear; reload in a minute, or contact RallyCap if it doesn't."}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border-2 border-slate-200 bg-white p-4 text-base">
        <p className="text-lg font-bold">Start a club</p>
        <p className="mt-1 text-slate-700">
          Running several teams? Pay {dollars(CLUB_PRICE_CENTS)} per team for the season and get one
          code per team. Head coaches enter their code, and you can see every team&apos;s lineups,
          playing time and stats (view only), share your logo, uniforms and practice plans, and post
          to all your teams&apos; GroupMe groups.
        </p>
      </div>
      <BuyCodes />
    </div>
  );
}

function ClubDashboard({ clubId, clubName }: { clubId: string; clubName: string }) {
  const paid = usePaid();
  const [buying, setBuying] = useState(false);
  const [reload, setReload] = useState(0);
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
  }, [clubId, reload]);

  // Back from paying: new codes show up once Stripe confirms; look again a few times.
  useEffect(() => {
    if (!paid) return;
    const timers = [3000, 8000, 15000].map((ms) => setTimeout(() => setReload((n) => n + 1), ms));
    return () => timers.forEach(clearTimeout);
  }, [paid]);

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

  /** The phone's share sheet (text the head coach); on a computer, copy the message. */
  const share = async (code: string, season: string) => {
    const text = codeMessage(clubName, season, code, window.location.origin);
    try {
      if (navigator.share) {
        await navigator.share({ title: `${clubName} code`, text });
        return;
      }
    } catch (e) {
      // Closing the share sheet isn't an error.
      if (e instanceof DOMException && e.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(`${code}:message`);
    } catch {
      setCopied(null);
    }
  };

  return (
    <>
      {paid && (
        <p
          role="status"
          className="mb-4 rounded-xl border-2 border-green-700 bg-green-50 p-3 text-base font-semibold"
        >
          Payment received. New codes appear below in a few seconds.
        </p>
      )}
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
        open={teams.length === 0 || paid}
      >
        <summary className="flex min-h-11 cursor-pointer items-center text-lg font-bold">
          Team codes{season ? ` · ${season}` : ""} ({thisSeason.length - unused.length} of{" "}
          {thisSeason.length} used)
        </summary>
        <p className="mb-3 text-base text-slate-700">
          One code per team for the season. Tap <b>Share</b> to text a head coach their code; they
          enter it on Coaches &amp; parents. The team keeps its data, and you can view it here until{" "}
          {thisSeason[0]
            ? new Date(`${thisSeason[0].expiresOn}T12:00`).toLocaleDateString(undefined, {
                month: "long",
                day: "numeric",
                year: "numeric",
              })
            : "the season ends"}
          .
        </p>
        <button
          onClick={() => setBuying(true)}
          className="mb-3 h-12 w-full rounded-xl bg-[var(--team)] text-base font-bold text-white"
        >
          Buy codes ({dollars(CLUB_PRICE_CENTS)} per team)
        </button>
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
                <span className="flex shrink-0 gap-2">
                  <button
                    onClick={() => void share(c.code, c.season)}
                    className="h-11 rounded-lg bg-[var(--team)] px-4 text-sm font-bold text-white"
                  >
                    {copied === `${c.code}:message` ? "Message copied" : "Share"}
                  </button>
                  <button
                    onClick={() => void copy(c.code)}
                    className="h-11 rounded-lg border-2 border-slate-300 bg-white px-3 text-sm font-bold active:bg-slate-100"
                  >
                    {copied === c.code ? "Copied" : "Copy"}
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      </details>

      <Sheet open={buying} title="Buy team codes" onClose={() => setBuying(false)}>
        {buying && <BuyCodes clubId={clubId} onCancel={() => setBuying(false)} />}
      </Sheet>
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
