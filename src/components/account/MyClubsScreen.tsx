"use client";

import Link from "next/link";
import { useStoreState } from "@/lib/data/store";
import { AppShell, Loading } from "../AppShell";
import { useMyClubs } from "../club/useMyClubs";
import { useMyTeamClubs } from "./useMe";

const heading = "mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase";

/** My Clubs: clubs I run, and the clubs my teams belong to this season. */
export function MyClubsScreen() {
  const { mode } = useStoreState();
  const clubs = useMyClubs();
  const teamClubs = useMyTeamClubs();

  const shell = (children: React.ReactNode) => (
    <AppShell title="My clubs" tab="account" bare>
      {children}
    </AppShell>
  );
  if (mode !== "supabase") return shell(<p className="text-lg">Clubs need sign-in.</p>);
  if (!clubs || !teamClubs) return shell(<Loading />);
  const until = (iso: string) =>
    new Date(`${iso}T12:00`).toLocaleDateString(undefined, { month: "long", day: "numeric" });

  return shell(
    <div className="flex flex-col gap-6">
      {clubs.length > 0 && (
        <section>
          <h2 className={heading}>Clubs I run</h2>
          <ul className="flex flex-col gap-2">
            {clubs.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/club?club=${c.id}`}
                  className="flex min-h-16 items-center justify-between gap-3 rounded-xl border-2 border-slate-200 bg-white px-4 active:bg-slate-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-lg font-bold">{c.name}</span>
                    <span className="block text-sm text-slate-600">
                      {c.role === "director" ? "Director" : "Assistant director"}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold text-[var(--team)]">Open ›</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {teamClubs.length > 0 && (
        <section>
          <h2 className={heading}>My teams in a club</h2>
          <ul className="flex flex-col gap-2">
            {teamClubs.map((t) => (
              <li
                key={t.teamId}
                className="rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-base"
              >
                <b>{t.teamName}</b> is part of <b>{t.club}</b> for {t.season}, through{" "}
                {until(t.expiresOn)}.
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-slate-600">
            Your club can view these teams&apos; lineups, playing time, rules and stats, and shares
            its logo, uniforms and practice plans with you.
          </p>
        </section>
      )}

      {clubs.length === 0 && teamClubs.length === 0 && (
        <p className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-4 text-base">
          You&apos;re not part of a club. Got a code from your club? Enter it on Coaches &amp;
          parents.
        </p>
      )}

      <Link href="/club" className="text-base font-semibold text-[var(--team)] underline">
        {clubs.length > 0 ? "Buy more team codes" : "Start a club"}
      </Link>
    </div>,
  );
}
