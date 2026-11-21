"use client";

// The bell at the top of Chatter and Coach Chatter: turn notifications on for this phone,
// how to on an iPhone (Home Screen first), or turn them off for just this team or club.
import { useEffect, useState } from "react";
import {
  notifyEnabled,
  pushState,
  setNotifyEnabled,
  turnOnPush,
  type NotifyCategory,
  type PushState,
} from "@/lib/push/client";

const LATER_KEY = "rallycap:push-later";
const LATER_MS = 30 * 24 * 60 * 60 * 1000;

function askedLater(): boolean {
  try {
    const at = Number(window.localStorage.getItem(LATER_KEY) ?? 0);
    return Date.now() - at < LATER_MS;
  } catch {
    return false;
  }
}

export function NotifyBar({
  userId,
  scopeId,
  scopeName,
  category,
}: {
  userId: string;
  scopeId: string;
  scopeName: string;
  category: NotifyCategory;
}) {
  const [state, setState] = useState<PushState | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    void pushState().then((s) => current && setState(s));
    void notifyEnabled(scopeId, category)
      .then((e) => current && setEnabled(e))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [scopeId, category]);

  if (!state || state === "unsupported" || state === "blocked") return null;

  if (state === "on") {
    if (enabled === null) return null;
    return (
      <p className="mb-3 flex flex-wrap items-center gap-x-2 text-sm text-slate-600">
        <span>
          {enabled ? "🔔 Notifications on for " : "🔕 Notifications off for "}
          {scopeName}
        </span>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await setNotifyEnabled(userId, scopeId, category, !enabled);
              setEnabled(!enabled);
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          }}
          className="min-h-11 font-semibold text-[var(--team)] underline"
        >
          {enabled ? "Turn off here" : "Turn on"}
        </button>
        {error && <span className="text-red-700">{error}</span>}
      </p>
    );
  }

  if (hidden || askedLater()) return null;
  const later = () => {
    try {
      window.localStorage.setItem(LATER_KEY, String(Date.now()));
    } catch {
      // Private mode: it asks again next time.
    }
    setHidden(true);
  };

  return (
    <section className="mb-3 flex flex-col gap-2 rounded-xl border-2 border-[var(--team)] bg-white p-3">
      <p className="text-base font-bold">🔔 Get a buzz when someone posts</p>
      {state === "install" ? (
        <p className="text-base text-slate-700">
          On an iPhone or iPad, add Fungo to your Home Screen first: tap the Share button, then{" "}
          <b>Add to Home Screen</b>. Open Fungo from there and turn notifications on.
        </p>
      ) : (
        <p className="text-base text-slate-700">
          Turn on notifications on this phone for new posts in {scopeName}. You can turn them off
          for any team on My profile.
        </p>
      )}
      {error && <p className="text-base text-red-700">{error}</p>}
      <div className="flex gap-2">
        {state === "off" && (
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                setState(await turnOnPush());
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            }}
            className="h-12 flex-[2] rounded-xl bg-[var(--team)] text-base font-bold text-white disabled:opacity-50"
          >
            {busy ? "Turning on…" : "Turn on notifications"}
          </button>
        )}
        <button
          onClick={later}
          className="h-12 flex-1 rounded-xl border-2 border-slate-300 bg-white text-base font-bold"
        >
          {state === "install" ? "Got it" : "Not now"}
        </button>
      </div>
    </section>
  );
}
