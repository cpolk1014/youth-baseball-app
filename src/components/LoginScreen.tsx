"use client";

import { useState, useSyncExternalStore } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { safeNextPath } from "@/lib/supabase/next-path";

type Step = { kind: "email" } | { kind: "sent"; email: string };

const field =
  "h-14 w-full rounded-xl border-2 border-slate-400 bg-white px-4 text-lg focus:border-[#0b1f3a] focus:outline-none";
const primary =
  "h-14 w-full rounded-xl bg-[#0b1f3a] text-lg font-bold text-white disabled:opacity-40 active:bg-[#16325a]";

export function LoginScreen() {
  const [step, setStep] = useState<Step>({ kind: "email" });
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The query string, read on the client only (empty during server rendering).
  const search = useSyncExternalStore(
    () => () => {},
    () => window.location.search,
    () => "",
  );
  const params = new URLSearchParams(search);
  const next = () => safeNextPath(params.get("next"));

  const sendLink = async () => {
    setBusy(true);
    setError(null);
    const { error } = await getBrowserSupabase().auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next())}`,
      },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setStep({ kind: "sent", email: email.trim() });
  };

  const verifyCode = async (address: string) => {
    setBusy(true);
    setError(null);
    const { error } = await getBrowserSupabase().auth.verifyOtp({
      email: address,
      token: code.trim(),
      type: "email",
    });
    setBusy(false);
    if (error) setError("That code didn't work. Check it, or send a new link.");
    // Full load so the app starts fresh with the new session.
    else window.location.assign(next());
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-8">
      <h1 className="text-3xl font-bold">Dugout Lineups</h1>
      <p className="mt-1 mb-6 text-lg text-slate-700">Fair lineups for your travel team.</p>

      {!isSupabaseConfigured ? (
        <p className="rounded-xl border-2 border-amber-500 bg-amber-50 p-4 text-base">
          Sign-in isn&apos;t set up yet. Add the Supabase URL and anon key to{" "}
          <code>.env.local</code>.
        </p>
      ) : step.kind === "email" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void sendLink();
          }}
          className="flex flex-col gap-4"
        >
          {params.get("error") === "link" && (
            <p className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-900">
              That sign-in link expired or was opened in a different browser. Send a new one, or use
              the code from the email.
            </p>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-slate-700">Email</span>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={field}
            />
          </label>
          <button type="submit" disabled={busy || !email.includes("@")} className={primary}>
            {busy ? "Sending…" : "Email me a sign-in link"}
          </button>
          <p className="text-sm text-slate-600">
            No password needed. New here? This creates your account.
          </p>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void verifyCode(step.email);
          }}
          className="flex flex-col gap-4"
        >
          <p className="rounded-xl bg-green-50 p-4 text-lg leading-snug text-green-950">
            Check <b>{step.email}</b>. Tap the link in the email, or type the code from it here.
          </p>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-slate-700">Code from the email</span>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 10))}
              className={`${field} text-center text-2xl tracking-[0.4em]`}
            />
          </label>
          <button type="submit" disabled={busy || code.length < 6} className={primary}>
            {busy ? "Checking…" : "Sign in"}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep({ kind: "email" });
              setCode("");
            }}
            className="h-12 text-base font-semibold text-slate-700 underline"
          >
            Use a different email
          </button>
        </form>
      )}

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-red-50 p-3 text-base font-semibold text-red-900"
        >
          {error}
        </p>
      )}
    </main>
  );
}
