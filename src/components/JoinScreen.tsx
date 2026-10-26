"use client";

import { useEffect, useState } from "react";
import { ROLE_LABEL } from "@/lib/data/permissions";
import { preferTeam } from "@/lib/data/store";
import type { InvitePreview } from "@/lib/data/supabase-backend";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type State =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "error"; message: string }
  | { kind: "ready"; invite: InvitePreview };

const ROLE_BLURB = {
  parent: "You'll see lineups, the batting order and season playing time.",
  coach: "You'll be able to edit the roster, games and lineups.",
  manager: "You'll be able to edit the roster and games.",
  treasurer: "You'll see lineups and team info.",
};

function openTeam(teamId: string) {
  preferTeam(teamId);
  // Full load so the app starts on the joined team.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign("/games");
}

/** Landing page for an invite link (the proxy has already made the visitor sign in). */
export function JoinScreen({ token }: { token: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    import("@/lib/data/supabase-backend")
      .then((b) => b.previewInvite(token))
      .then((invite) => {
        if (!cancelled)
          setState(invite && invite.valid ? { kind: "ready", invite } : { kind: "invalid" });
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setState({ kind: "error", message: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const join = async (teamId: string) => {
    setBusy(true);
    setError(null);
    try {
      const b = await import("@/lib/data/supabase-backend");
      await b.acceptInvite(token, name.trim());
      openTeam(teamId);
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-8">
      <h1 className="text-3xl font-bold">RallyCap</h1>
      <div className="mt-6">
        {!isSupabaseConfigured ? (
          <p className="text-lg">
            Invites need sign-in, which isn&apos;t set up in this copy of the app.
          </p>
        ) : state.kind === "loading" ? (
          <p className="text-lg text-slate-600">Checking your invite…</p>
        ) : state.kind === "invalid" ? (
          <div className="rounded-xl border-2 border-amber-500 bg-amber-50 p-4 text-lg leading-snug">
            <p className="font-bold">This invite link has expired or been turned off.</p>
            <p className="mt-1">Ask your coach for a new one.</p>
          </div>
        ) : state.kind === "error" ? (
          <p className="rounded-xl bg-red-50 p-4 text-base text-red-950">{state.message}</p>
        ) : state.invite.alreadyMember ? (
          <div className="flex flex-col gap-4">
            <p className="text-lg">
              You&apos;re already on <b>{state.invite.teamName}</b>.
            </p>
            <button
              onClick={() => openTeam(state.invite.teamId)}
              className="h-14 rounded-xl bg-[#0b1f3a] text-lg font-bold text-white"
            >
              Open {state.invite.teamName}
            </button>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) void join(state.invite.teamId);
            }}
            className="flex flex-col gap-4"
          >
            <p className="text-xl leading-snug">
              Join <b>{state.invite.teamName}</b> as a {ROLE_LABEL[state.invite.role].toLowerCase()}
              .
            </p>
            <p className="text-base text-slate-700">{ROLE_BLURB[state.invite.role]}</p>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-slate-700">
                Your name, as the team knows you
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                autoComplete="name"
                placeholder={state.invite.role === "parent" ? "e.g. Sam's mom" : "e.g. Coach Dave"}
                className="h-14 rounded-xl border-2 border-slate-400 bg-white px-4 text-lg focus:border-[#0b1f3a] focus:outline-none"
              />
            </label>
            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="h-14 rounded-xl bg-[#0b1f3a] text-lg font-bold text-white disabled:opacity-40"
            >
              {busy ? "Joining…" : "Join team"}
            </button>
            {error && <p className="text-base font-semibold text-red-700">{error}</p>}
          </form>
        )}
      </div>
    </main>
  );
}
