"use client";

// My profile → Notifications: notifications on this phone, and which teams' Chatter and which
// clubs' Coach Chatter send them.
import { useEffect, useState } from "react";
import type { CoachClub } from "@/lib/data/coach-chatter-backend";
import {
  notifyEnabled,
  pushState,
  setNotifyEnabled,
  turnOffPush,
  turnOnPush,
  type NotifyCategory,
  type PushState,
} from "@/lib/push/client";

const heading = "mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase";
const card = "rounded-xl border-2 border-slate-200 bg-white p-4";

export function NotifySettings({
  userId,
  teams,
}: {
  userId: string;
  /** With my role there: the Parents channel is for families (parents and treasurers). */
  teams: { id: string; name: string; role?: string }[];
}) {
  const [state, setState] = useState<PushState | null>(null);
  const [clubs, setClubs] = useState<CoachClub[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    void pushState().then((s) => current && setState(s));
    void import("@/lib/data/coach-chatter-backend")
      .then((m) => m.myCoachClubs())
      .then((c) => current && setClubs(c))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, []);

  if (!state || state === "unsupported") return null;

  const toggleDevice = async () => {
    setBusy(true);
    setError(null);
    try {
      if (state === "on") {
        await turnOffPush();
        setState("off");
      } else {
        setState(await turnOnPush());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={card}>
      <h2 className={heading}>Notifications</h2>
      {state === "install" && (
        <p className="text-base text-slate-700">
          On an iPhone or iPad, add Fungo to your Home Screen first (Share, then Add to Home
          Screen), open it from there, and turn notifications on here.
        </p>
      )}
      {state === "blocked" && (
        <p className="text-base text-slate-700">
          Notifications are blocked for Fungo on this device. Allow them in your phone&apos;s or
          browser&apos;s settings, then come back here.
        </p>
      )}
      {(state === "on" || state === "off") && (
        <>
          <button
            disabled={busy}
            onClick={() => void toggleDevice()}
            className={`mb-3 h-12 w-full rounded-xl text-base font-bold disabled:opacity-50 ${
              state === "on" ? "border-2 border-slate-300 bg-white" : "bg-[var(--team)] text-white"
            }`}
          >
            {state === "on" ? "Turn off on this phone" : "Turn on notifications on this phone"}
          </button>
          {error && <p className="mb-2 text-base text-red-700">{error}</p>}
          {state === "on" && (
            <ul className="flex flex-col">
              {teams.map((t) => (
                <li key={`t-${t.id}`} className="mt-2 first:mt-0">
                  <p className="text-sm font-bold text-slate-600">{t.name}</p>
                  <ul>
                    <Toggle
                      userId={userId}
                      scopeId={t.id}
                      category="parents"
                      label="Chatter: Team channel"
                    />
                    <Toggle
                      userId={userId}
                      scopeId={t.id}
                      category="chatter"
                      label="Chatter: Club channel (club teams)"
                    />
                    {(t.role === "parent" || t.role === "treasurer") && (
                      <Toggle
                        userId={userId}
                        scopeId={t.id}
                        category="families"
                        label="Chatter: Parents channel"
                      />
                    )}
                    <Toggle userId={userId} scopeId={t.id} category="games" label="Game changes" />
                    <Toggle
                      userId={userId}
                      scopeId={t.id}
                      category="money"
                      label="New charges for my family"
                    />
                    <Toggle
                      userId={userId}
                      scopeId={t.id}
                      category="stats"
                      label="Box scores: how my kids did"
                    />
                  </ul>
                </li>
              ))}
              {clubs.length > 0 && (
                <li className="mt-2">
                  <p className="text-sm font-bold text-slate-600">Coach Chatter</p>
                </li>
              )}
              {clubs.map((c) => (
                <Toggle
                  key={`c-${c.id}`}
                  userId={userId}
                  scopeId={c.id}
                  category="coach_chatter"
                  label={c.name}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function Toggle({
  userId,
  scopeId,
  category,
  label,
}: {
  userId: string;
  scopeId: string;
  category: NotifyCategory;
  label: string;
}) {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    let current = true;
    void notifyEnabled(scopeId, category)
      .then((e) => current && setOn(e))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [scopeId, category]);
  return (
    <li>
      <label className="flex min-h-12 items-center justify-between gap-3 text-base">
        <span className="min-w-0 truncate font-semibold">{label}</span>
        <input
          type="checkbox"
          role="switch"
          checked={on ?? true}
          disabled={on === null}
          onChange={async (e) => {
            const next = e.target.checked;
            setOn(next);
            try {
              await setNotifyEnabled(userId, scopeId, category, next);
            } catch {
              setOn(!next);
            }
          }}
          className="size-6 shrink-0 accent-[var(--team)]"
        />
      </label>
    </li>
  );
}
