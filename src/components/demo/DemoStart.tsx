"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { preferTeam, signOut } from "@/lib/data/store";
import { REAL_CLUB_HREF, isGuest } from "@/lib/demo/guest";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type Step =
  | { kind: "checking" }
  | { kind: "ready" }
  | { kind: "building" }
  | { kind: "signed-in"; email: string | null }
  | { kind: "error"; message: string };

/**
 * "Try the demo club": on a tap, signs the visitor in as a guest (no email), builds their own
 * copy of the made-up Bayou Baseball Club, and opens its club page with the 10U as their team.
 * Nothing is built until someone taps: search engines load this page and run its code, and
 * each build is a whole club. A guest coming back goes straight to their club.
 */
export function DemoStart() {
  const [step, setStep] = useState<Step>(() =>
    isSupabaseConfigured
      ? { kind: "checking" }
      : { kind: "error", message: "The demo needs Supabase (it isn't set up here)." },
  );

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let live = true;
    void getBrowserSupabase()
      .auth.getUser()
      .then(({ data }) => {
        if (!live) return;
        if (data.user && !isGuest(data.user)) {
          setStep({ kind: "signed-in", email: data.user.email ?? null });
        } else if (data.user) {
          // A guest with a demo already: open it.
          setStep({ kind: "building" });
          void startDemo().then((next) => live && next && setStep(next));
        } else {
          setStep({ kind: "ready" });
        }
      });
    return () => {
      live = false;
    };
  }, []);

  const build = () => {
    setStep({ kind: "building" });
    void startDemo().then((next) => next && setStep(next));
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-8">
      <h1>
        {/* eslint-disable-next-line @next/next/no-img-element -- a small static SVG */}
        <img
          src="/brand/fungo-horizontal-color.svg"
          alt="Fungo"
          width={710}
          height={266}
          className="-ml-3 h-20 w-auto"
        />
      </h1>
      {step.kind === "ready" && (
        <div className="mt-4">
          <p className="text-2xl font-black text-slate-900">Try a whole club, no sign-up</p>
          <p className="mt-2 text-lg text-slate-700">
            The Bayou Baseball Club: eight teams from 7U to 14U, a season of games and lineups, a
            tournament, team Chatter, club awards and a practice library. You&apos;re the director
            and every team&apos;s coach. It&apos;s all made up, and it&apos;s yours for two days.
          </p>
          <button
            onClick={build}
            className="mt-6 h-14 w-full rounded-xl bg-[#DC143C] text-lg font-bold text-white active:bg-[#B5102F]"
          >
            Build my demo club
          </button>
          <Link
            href={REAL_CLUB_HREF}
            className="mt-3 flex h-12 items-center justify-center text-base font-semibold text-slate-700 underline"
          >
            Ready for the real thing? Start a club
          </Link>
        </div>
      )}
      {step.kind === "building" && (
        <div role="status" className="mt-4">
          <p className="text-2xl font-black text-slate-900">Building your demo club…</p>
          <p className="mt-2 text-lg text-slate-700">
            The Bayou Baseball Club: eight teams from 7U to 14U, a season of games and lineups, club
            awards and a practice library. It&apos;s all made up, and it&apos;s yours to click
            around for two days.
          </p>
          <div className="mt-6 h-2 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-[#DC143C]" />
          </div>
        </div>
      )}
      {step.kind === "signed-in" && (
        <div className="mt-4">
          <p className="text-2xl font-black text-slate-900">You&apos;re already signed in</p>
          <p className="mt-2 text-lg text-slate-700">
            {step.email ? (
              <>
                You&apos;re signed in as <b className="break-all">{step.email}</b>.{" "}
              </>
            ) : null}
            The demo club uses a guest login of its own, so your teams stay out of it.
          </p>
          <button
            onClick={() => void signOut("/demo")}
            className="mt-6 h-14 w-full rounded-xl bg-[#DC143C] text-lg font-bold text-white active:bg-[#B5102F]"
          >
            Sign out and try the demo
          </button>
          <Link
            href="/"
            className="mt-3 flex h-12 items-center justify-center rounded-xl border-2 border-slate-400 text-base font-bold text-slate-800"
          >
            Back to my team
          </Link>
        </div>
      )}
      {step.kind === "error" && (
        <div className="mt-4">
          <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-900">
            {step.message}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 h-14 w-full rounded-xl bg-[#1B2A4A] text-lg font-bold text-white"
          >
            Try again
          </button>
          <Link
            href={REAL_CLUB_HREF}
            className="mt-3 flex h-12 items-center justify-center rounded-xl border-2 border-slate-400 text-base font-bold text-slate-800"
          >
            Start a real club instead
          </Link>
        </div>
      )}
    </main>
  );
}

// Once per page load: a second run (React runs effects twice in development) would sign in a
// second guest and build a second club, and the app could end up signed in as one guest with
// the other guest's team remembered.
let starting: Promise<Step | null> | null = null;

/** Sign in as a guest, build the demo club, and open it. Null once it's opening. */
function startDemo(): Promise<Step | null> {
  starting ??= (async (): Promise<Step | null> => {
    const sb = getBrowserSupabase();
    const { data } = await sb.auth.getUser();
    if (data.user && !isGuest(data.user)) {
      return { kind: "signed-in", email: data.user.email ?? null };
    }
    if (!data.user) {
      const { error } = await sb.auth.signInAnonymously();
      if (error) return { kind: "error", message: demoErrorMessage(error.message) };
    }
    const built = await sb.rpc("start_demo_club");
    const team = (built.data as { team?: string } | null)?.team;
    if (built.error || !team) {
      return { kind: "error", message: demoErrorMessage(built.error?.message ?? "") };
    }
    preferTeam(team);
    // A full load, so the app starts with the guest's new club.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/club");
    return null;
  })();
  // "Try again" reloads the page, which starts over.
  return starting;
}

function demoErrorMessage(raw: string): string {
  if (/anonymous sign-ins are disabled/i.test(raw)) {
    return "The demo club isn't open yet. Start a real club instead: it's free to set up.";
  }
  if (/rate limit|busy/i.test(raw)) {
    return "The demo is busy right now. Give it a few minutes and try again.";
  }
  return "Couldn't build the demo club. Try again in a moment.";
}
